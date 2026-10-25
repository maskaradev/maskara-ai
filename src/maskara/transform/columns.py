"""Column roles: what each table column holds, from its header and a sample of its values.

The order of trust is: the user's `columns=` override, then the header, then the values. A header
hint that the values contradict ('name' over product names) falls back to `keep`, and so does
anything unrecognized. Inference is a convenience, not a guarantee: `MaskResult.columns` reports
every role used, so a run can be checked and pinned with `columns=`.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import date

from ..detect import rules
from ..persona.formats import DATE_PATTERNS, shift_dates

# role -> what it does to a cell
ROLES = {
    "name": "full name, replaced by the subject's persona name in the same form",
    "first_name": "first name of the subject's persona",
    "last_name": "last name of the subject's persona",
    "email": "the persona's email in the original's local-part style",
    "phone": "the persona's phone in the original's layout",
    "address": "the persona's street address, same parts as the original",
    "city": "the persona's city",
    "state": "the persona's state (kept under strict/balanced by design of the presets)",
    "zip": "the persona's ZIP",
    "dob": "birth date generalized to the persona's birth year (never just shifted)",
    "date": "shifted by the subject's per-person offset; gaps within a subject are preserved",
    "age": "the persona's age (within the preset's age band)",
    "sex": "kept: the persona has the same sex",
    "id": "value-keyed replacement: same value, same replacement in every table and text",
    "financial": "value-keyed, format-preserving; card numbers stay Luhn-valid in test ranges",
    "secret": "value-keyed replacement of the same shape",
    "network": "IPs to documentation ranges, hosts to example.* domains",
    "text": "free text: detected, linked and replaced span by span",
    "keep": "left as is",
}
SAMPLE = 50

NOT_PERSON = {"product", "item", "company", "org", "organization", "store", "brand", "business", "file", "category",
              "street", "city", "state", "country", "bank", "pet", "event", "project", "team", "plan", "display",
              "host", "domain", "job", "campaign", "group", "dept", "department", "tag", "model", "app"}


def _tokens(header: str) -> list[str]:
    h = re.sub(r"([a-z])([A-Z])", r"\1_\2", header).lower()
    return [t for t in re.split(r"[^a-z0-9]+", h) if t]


def from_header(header: str) -> str | None:
    t = _tokens(header)
    s = set(t)
    joined = "_".join(t)
    if not t:
        return None
    if s & {"dob", "birthday", "birthdate"} or "birth" in joined:
        return "dob"
    if s & {"email", "mail"} or "e_mail" in joined:
        return "email"
    if s & {"phone", "tel", "telephone", "mobile", "cell", "fax"}:
        return "phone"
    if s & {"password", "passwd", "secret", "token", "apikey"} or "api_key" in joined:
        return "secret"
    if "ip" in s or joined in ("ip_address", "mac_address", "url", "website", "hostname"):
        return "network"
    if s & {"ssn", "passport", "mrn", "uuid", "username", "login", "handle", "license", "npi"} or "social_security" in joined:
        return "id"
    if s & {"card", "iban", "routing", "last4", "cvv", "acct"} or "account_number" in joined or "bank_account" in joined:
        return "financial"
    if s & {"street", "addr", "address", "address1", "address2"}:
        return "address"
    if s & {"city", "town"}:
        return "city"
    if s & {"state", "province"}:
        return "state"
    if s & {"zip", "zipcode", "postal", "postcode"}:
        return "zip"
    if t == ["age"] or t[-1:] == ["age"]:
        return "age"
    if s & {"sex", "gender"}:
        return "sex"
    if s & {"date", "time", "timestamp", "day", "datetime", "created", "updated", "modified", "placed", "opened",
            "closed", "shipped", "delivered", "visited", "admitted", "discharged"} or t[-1] in ("at", "on"):
        return "date"
    if joined in ("first", "fname", "firstname", "given", "given_name", "forename") or \
            ("first" in s and "name" in s) or ("given" in s and "name" in s):
        return "first_name"
    if joined in ("last", "lname", "lastname", "surname", "family_name") or ("last" in s and "name" in s):
        return "last_name"
    if "name" in s or "fullname" in s:
        return "keep" if s & NOT_PERSON else "name"  # 'product_name': whatever the values look like
    if s & {"id", "key", "number", "no", "num", "uid", "guid", "code", "ref"} or t[-1].endswith("id"):
        return "id"
    if s & {"text", "body", "note", "notes", "message", "comment", "comments", "description", "content",
            "transcript", "summary", "details", "narrative", "remarks", "subject"}:
        return "text"
    return None


def _share(values: Sequence[str], test) -> float:
    return sum(1 for v in values if test(v)) / len(values) if values else 0.0


TIME_TAIL = re.compile(r"(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2}|[AaPp][Mm])?)?")


def is_date(v: str) -> bool:
    """The whole value is one date, optionally with a time: '2024-03-07', 'March 7, 2024', '3/7/24 10:00'."""
    for pattern in DATE_PATTERNS:
        if (m := pattern.match(v)) and TIME_TAIL.fullmatch(v, m.end()) and shift_dates(m.group(), 0)[1]:
            return True
    return False


def _is_person(v: str) -> bool:
    words = v.replace(",", " ").split()
    return 2 <= len(words) <= 4 and all(w[:1].isupper() for w in words) and \
        (rules._first(words[0]) and rules._last(words[-1].rstrip(".")) or
         "," in v and rules._last(words[0]) and rules._first(words[1]))


def missing(value: object) -> bool:
    """None, '', or a pandas NaN/NaT (the only values not equal to themselves)."""
    return value is None or value == "" or value != value  # noqa: PLR0124


def from_values(values: Sequence[object]) -> str | None:
    present = [v for v in values if not missing(v)]
    if present and all(isinstance(v, date) for v in present):  # date, datetime, pandas Timestamp
        return "date"
    sample = [str(v).strip() for v in present if str(v).strip()][:SAMPLE]
    if not sample or all(isinstance(v, (int, float, bool)) for v in present):
        return None
    if _share(sample, lambda v: rules.EMAIL.fullmatch(v)) >= 0.8:
        return "email"
    if _share(sample, lambda v: rules.SSN.fullmatch(v)) >= 0.8:
        return "id"
    if _share(sample, lambda v: rules.PHONE.fullmatch(v) and not v.isdigit()) >= 0.8:
        return "phone"
    if _share(sample, is_date) >= 0.8:
        return "date"
    if _share(sample, lambda v: len(v) >= 40 and " " in v) >= 0.5:
        return "text"
    if _share(sample, _is_person) >= 0.6:
        return "name"
    return None


def infer(header: str, values: Sequence[object]) -> str:
    """The role of one column. Header first; values confirm or override where the header is vague."""
    by_header, by_values = from_header(header), from_values(values)
    if by_header == "text" and not any(isinstance(v, str) for v in values):
        return "keep"  # a 'note' flag or a numeric 'comments' count
    if by_header == "name" and by_values not in ("name", None):
        return by_values
    if by_header == "name" and not any(_is_person(str(v)) for v in values[:SAMPLE] if not missing(v)):
        return "keep"
    if by_header == "date" and by_values not in ("date", None):
        return "keep"
    if by_header == "text" and by_values not in ("text", None):
        return by_values
    if by_header == "keep":
        return "keep"
    return by_header or by_values or "keep"

"""Pattern rules: formats that identify by shape (emails, phones, card numbers, dates, addresses).

No model and no downloads. Each rule has a fixed score that says how often its shape is PII when it
matches, so `merge` prefers an email match over a name guess inside it. Validation is strict where a
checksum or range exists (Luhn, SSN areas, IPv4 octets, calendar dates), because a false positive
here is a corrupted value in someone's data.

Names are the weak spot of rules. Three cheap cues catch the common cases: a title ('Ms. Lopez'),
a first name followed by a surname from the bundled name tables ('Maria Garcia'), and a first name
after a greeting or introduction ('Hi Maria', 'my name is Maria'). Anything else needs known values
from the user's tables (`detect.known`) or a model (`detect.models`).
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator

from .. import data
from ..persona.formats import DATE_PATTERNS, luhn_ok, shift_dates
from ..persona.geo import STATES, STREET_SUFFIXES
from .base import Detection
from .packs import patterns_for

Rule = Callable[[str], Iterator[Detection]]

_SUFFIXES = sorted({*STREET_SUFFIXES, *STREET_SUFFIXES.values(), "Pkwy", "Parkway", "Hwy", "Highway", "Sq",
                    "Square", "Loop", "Row", "Plaza", "Pike"}, key=len, reverse=True)
_STATE = "|".join(sorted([*STATES, *STATES.values()], key=len, reverse=True))

EMAIL = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])")
URL = re.compile(r"\b(?:https?://|www\.)[^\s<>\"']+", re.IGNORECASE)
# US numbers in the usual layouts; the leading 1 / +1 is part of the span when present.
PHONE = re.compile(r"(?<![\w+])(?:\+?1[-.\s]?)?(?:\(\d{3}\)\s?|\d{3}[-.\s]?)\d{3}[-.\s]?\d{4}(?![\w-])")
INTL_PHONE = re.compile(r"(?<![\w+])\+\d{1,3}(?:[-.\s]?\(?\d{1,4}\)?){2,5}(?![\w-])")
SSN = re.compile(r"(?<![\w-])(\d{3})-(\d{2})-(\d{4})(?![\w-])")
SSN_CUE = re.compile(r"\b(?:ssn|social security(?: number| no\.?)?)\s*(?:is|:|#)?\s*(\d{9})\b", re.IGNORECASE)
CARD = re.compile(r"(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])")
CARD_LAST4 = re.compile(r"\b(?:card|visa|mastercard|amex|account)\b[^.\n]{0,25}?\b(?:ending in|ends in|ending with|"
                        r"last (?:4|four)(?: digits)?(?: of [^.\n]{0,20}?)?)\s*(?:is|are|:)?\s*(\d{4})\b",
                        re.IGNORECASE)
# A transcript's answer to 'the last four digits of the card?': four digits alone after the speaker.
CARD_LAST4_ANSWER = re.compile(r"\blast (?:4|four)\b[^\n?]{0,40}\?[ \t]*\n[^\n:]{1,20}:[ \t]*(\d{4})[ \t.]*(?:\n|$)",
                               re.IGNORECASE)
IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\d|\.\d)")
IPV6 = re.compile(r"(?<![\w:])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|"
                  r"(?:[0-9A-Fa-f]{1,4}:){1,6}:(?:[0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})(?![\w:])")
MAC = re.compile(r"(?<![\w:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![\w:-])")
STREET = re.compile(r"\b\d{1,6}(?:\s+(?:[NSEW]\.?|[A-Z][a-z]+|\d+(?:st|nd|rd|th))){1,4}\s+"
                    rf"(?:{'|'.join(_SUFFIXES)})\b\.?"
                    r"(?:,?\s+(?:Apt|Apartment|Unit|Suite|Ste|#)\.?\s*[\w-]+)?")
PO_BOX = re.compile(r"\bP\.?\s?O\.?\s+Box\s+\d+\b", re.IGNORECASE)
# 'Denver, CO', 'Denver, Colorado 80216': one to three capitalized words, a state, an optional ZIP.
PLACE = re.compile(rf"\b[A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){{0,2}},\s+(?:{_STATE})\b(?:\s+\d{{5}}(?:-\d{{4}})?\b)?")
ZIP_CUE = re.compile(r"\b(?:zip(?:\s*code)?|postal code)\s*(?:is|:|#)?\s*(\d{5}(?:-\d{4})?)\b", re.IGNORECASE)
ID_CUE = re.compile(r"\b(?:customer|account|acct|member|patient|employee|user|order|invoice|policy|claim|case|"
                    r"reference|ref|confirmation|tracking|mrn|record|license|passport|badge|student)"
                    r"(?:\s+(?:id|no\.?|number|num|#))?\s*(?:is|:|#)?\s*(#?[A-Za-z0-9][A-Za-z0-9-]{3,})\b",
                    re.IGNORECASE)
# Later digit blocks belong to the code too ('AET-8237-4916-75'), or they would survive replacement.
CODE = re.compile(r"\b[A-Z]{2,5}-\d{4,}(?:-\d+)*\b")
COORDINATES = re.compile(r"(?<![\d.])-?\d{1,3}\.\d{3,},?\s*-?\d{1,3}\.\d{3,}(?![\d.])")
# 'label: value' forms. The cue is case-insensitive, the value shape is not; between them may sit
# markup and filler ('**Swift BIC**: ', 'pin is ', '| CVV Code | ').
SEP = r"(?i:[\s:*|=#(.]+|\b(?:is|was|are|number|no|nos|code)\b){1,8}"
CUES = [(re.compile(rf"(?i:\b(?:{cue}))\b{SEP}({value})(?![\w@])"), category, label) for cue, value, category, label in (
    (r"user\s?name|user id|login|handle", r"(?=[\w.-]*[\d._])[A-Za-z][\w.-]{2,}\w", "ID", "username"),
    (r"account(?: id| number| no)|acct(?: no)?|member id|customer id", r"[A-Z0-9][A-Z0-9-]{4,}", "ID", "account_id"),
    (r"routing|aba", r"\d{9}", "FINANCIAL", "routing_number"),
    (r"cvv2?|cvc|card security|security code", r"\d{3,4}", "FINANCIAL", "cvv"),
    (r"pin", r"\d{4,8}", "CREDENTIAL", "pin"),
    (r"swift(?:\s*/?\s*bic)?|bic", r"[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?", "FINANCIAL", "swift_bic"),
    (r"iban", r"[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?", "FINANCIAL", "iban"),
    (r"card", r"\d(?:[ -]?\d){12,18}", "FINANCIAL", "card_number"),
    (r"vin|vehicle identification", r"[A-HJ-NPR-Z0-9]{17}", "ID", "vehicle_id"),
    (r"password|passcode|passphrase", r"(?=\S*[\d!@#$%^&*])\S{4,}?(?=[.,;]?(?:\s|$))", "CREDENTIAL", "password"),
)]
SECRET = re.compile(r"\b(?:api[_ ]?key|secret(?: key)?|access key|token)\s*(?:is|:|=)\s*((?=\S*\d)\S{8,})", re.IGNORECASE)
KEY_SHAPED = re.compile(r"\b(?:AKIA[0-9A-Z]{16}|(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}|"
                        r"gh[pousr]_[A-Za-z0-9]{30,})\b")
AGE = re.compile(r"\b(?:I'?m|I am|aged?:?)\s+(\d{1,3})\b(?!\s*(?:%|percent|\$|dollars|minutes?|hours?|days?|"
                 r"weeks?|months?|times|items?|orders?|pounds|lbs|miles|years ago|am\b|pm\b|[ap]\.m\.))|"
                 r"\b(\d{1,3})[- ]years?[- ]old\b", re.IGNORECASE)
BIRTH_CUE = re.compile(r"(?:\bdob|\bd\.o\.b\.?|date of birth|birth\s?date|\bborn(?: on| in)?|birthday)"
                       r"\W{0,3}(?:is|was|of)?\W{0,3}(?:\n[^\n:]{1,20}:\s*)?$", re.IGNORECASE)
# A title, then the whole name after it: initials, a name, and a second name if any. Initials are
# 'C.A. ', 'C. A. ' or 'J.Smith'; one initial and a space ('Mr. Y. What') may end a sentence instead.
_CAP = "A-ZÀ-ÖØ-ÞĀ-ſ"  # capitals, Latin-1 and Latin Extended-A ('Bülent Yılmaz', 'Şahin')
TITLE_WORD = rf"[{_CAP}][^\W\d_]+(?:[-'’][^\W\d_]+)*"
TITLE = re.compile(r"\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof)\.? +((?:(?:[A-Z]\.){1,3}(?=[A-Z])|(?:[A-Z]\.){2,3} |"
                   rf"(?:[A-Z]\. ){{2,3}})?{TITLE_WORD})((?: +{TITLE_WORD}){{0,2}})")
# A lookahead, so 'Thanks Maria Lopez' still yields 'Maria Lopez' after rejecting 'Thanks Maria'.
NAME_PAIR = re.compile(r"\b(?=(([A-Z][a-z]+(?:-[A-Z][a-z]+)?) +(?:[A-Z]\.? +)?([A-Z][a-z]+(?:[-'’][A-Z][a-z]+)?))\b)")
NEXT_WORD = re.compile(r" +([A-Z][a-z]+(?:[-'’][A-Z][a-z]+)?)\b")
NAME_CUE = re.compile(r"\b(?=(?:my name is|this is|i'm|i am|name's|hi|hello|hey|dear|thanks|thank you|regards|"
                      r"cheers|best|sincerely)\s*,?\s+([A-Z][a-z]+)\b(?![-'’]\w))", re.IGNORECASE)
NOT_SURNAME = {*STREET_SUFFIXES, *STREET_SUFFIXES.values(), "Street", "St", "County", "City", "Park", "Lake",
               "Hill", "River", "Valley", "University", "College", "School", "Hospital", "Center", "Bank",
               "Inc", "Corp", "Company", "Group", "Team", "Support", "Store", "Day", "Morning", "Avenue"}
CALENDAR = {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
            "November", "December", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
            "Sunday"}
NOT_PLACE = {"Thanks", "Thank", "Hi", "Hello", "Hey", "Yes", "No", "Okay", "Ok", "Sure", "Best", "Regards", "Cheers",
             "Sincerely", "Dear", "Well", "So", "Oh", "Sorry", "Please", "Great", "Perfect", "Done", "Also"}
NOT_GIVEN = NOT_PLACE | CALENDAR | NOT_SURNAME  # for `base.repeats`: words before a surname that are no given name
FIRST_MIN = 2e-6  # share of SSA first-name records below which a word is not taken as a first name


def _d(m: re.Match, category, label: str, score: float, group: int = 0) -> Detection:
    return Detection(m.start(group), m.end(group), category, label, score, "rules")


# Shared mailboxes of an organization identify no one; 'support@store.com' stays as written.
ROLE_MAILBOX = re.compile(r"(?:support|help|info|contact|sales|billing|orders?|service|team|hello|admin|noreply|"
                          r"no-reply|donotreply|privacy|press|jobs|careers|security|abuse|postmaster|webmaster)@",
                          re.IGNORECASE)


def emails(text: str) -> Iterator[Detection]:
    for m in EMAIL.finditer(text):
        if not ROLE_MAILBOX.match(m.group()):
            yield _d(m, "CONTACT", "email", 0.98)


def urls(text: str) -> Iterator[Detection]:
    for m in URL.finditer(text):
        end = m.end() - (len(m.group()) - len(m.group().rstrip(".,;:!?)]'\"")))
        # Scored above dates and phones, so a date in the query string can't win and leave the host behind.
        if "@" not in m.group():
            yield Detection(m.start(), end, "NETWORK", "url", 0.96, "rules")


def phones(text: str) -> Iterator[Detection]:
    for m in PHONE.finditer(text):
        digits = re.sub(r"\D", "", m.group())[-10:]
        if digits[0] in "01":
            continue
        bare = m.group().isdigit()
        yield _d(m, "CONTACT", "phone", 0.6 if bare else 0.95)
    for m in INTL_PHONE.finditer(text):
        if 8 <= len(re.sub(r"\D", "", m.group())) <= 15:
            yield _d(m, "CONTACT", "phone", 0.9)


def ids(text: str) -> Iterator[Detection]:
    for m in SSN.finditer(text):
        area, group, serial = m.groups()
        if area not in ("000", "666") and area[0] != "9" and group != "00" and serial != "0000":
            yield _d(m, "ID", "ssn", 0.97)
    for m in SSN_CUE.finditer(text):
        yield _d(m, "ID", "ssn", 0.97, 1)
    for m in ID_CUE.finditer(text):
        if re.search(r"\d", m.group(1)):
            yield _d(m, "ID", "id", 0.85, 1)
    for m in CODE.finditer(text):
        yield _d(m, "ID", "id", 0.7)
    for pattern, category, label in CUES:
        for m in pattern.finditer(text):
            yield _d(m, category, label, 0.86, 1)
    for m in SECRET.finditer(text):
        yield Detection(m.start(1), m.end(1) - (m.group(1)[-1] in ".,;"), "CREDENTIAL", "secret", 0.85, "rules")
    for m in KEY_SHAPED.finditer(text):
        yield _d(m, "CREDENTIAL", "api_key", 0.95)


def financial(text: str) -> Iterator[Detection]:
    for m in CARD.finditer(text):
        digits = re.sub(r"\D", "", m.group())
        if 13 <= len(digits) <= 19 and luhn_ok(digits) and len(set(digits)) > 1:
            yield _d(m, "FINANCIAL", "card_number", 0.97)
    for pattern in (CARD_LAST4, CARD_LAST4_ANSWER):
        for m in pattern.finditer(text):
            yield _d(m, "FINANCIAL", "card_last4", 0.9, 1)


def network(text: str) -> Iterator[Detection]:
    for m in IPV4.finditer(text):
        if all(int(o) <= 255 for o in m.group().split(".")):
            yield _d(m, "NETWORK", "ip_address", 0.9)
    for pattern in (IPV6, MAC):
        for m in pattern.finditer(text):
            yield _d(m, "NETWORK", "ip_address" if pattern is IPV6 else "mac_address", 0.9)


def dates(text: str) -> Iterator[Detection]:
    for pattern in DATE_PATTERNS:
        for m in pattern.finditer(text):
            if not shift_dates(m.group(), 0)[1]:  # not a real calendar date
                continue
            # A birth date is generalized to the persona's age band, never just shifted (see transform).
            birth = BIRTH_CUE.search(text, max(0, m.start() - 30), m.start())
            yield _d(m, "DATE", "birth_date" if birth else "date", 0.93)


def places(text: str) -> Iterator[Detection]:
    for m in STREET.finditer(text):
        yield _d(m, "ADDRESS", "street_address", 0.9)
    for m in PO_BOX.finditer(text):
        yield _d(m, "ADDRESS", "street_address", 0.9)
    for m in COORDINATES.finditer(text):
        yield _d(m, "LOCATION", "coordinates", 0.85)
    for m in PLACE.finditer(text):
        if m.group().split(",")[0] in NOT_PLACE:
            continue
        yield _d(m, "ADDRESS" if re.search(r"\d{5}", m.group()) else "LOCATION", "place", 0.88)
    for m in ZIP_CUE.finditer(text):
        yield _d(m, "ADDRESS", "zip", 0.9, 1)


def ages(text: str) -> Iterator[Detection]:
    for m in AGE.finditer(text):
        group = 1 if m.group(1) else 2
        if 0 < int(m.group(group)) <= 120:
            yield _d(m, "DEMOGRAPHIC", "age", 0.75, group)


def _first(word: str) -> bool:
    return word not in CALENDAR and data.names().first_freq.get(word, 0) >= FIRST_MIN


def _last(word: str) -> bool:
    return word not in NOT_SURNAME and word not in CALENDAR and word in data.names().last_freq


def names(text: str) -> Iterator[Detection]:
    for m in TITLE.finditer(text):
        # The title stays: it carries gender, which the persona keeps anyway. Up to two capitalized
        # words after the first name are the rest of the name ('Mr Mehmet Bülent Yılmaz'), whether or
        # not the surname tables know them, up to a word that ends names ('Dr. Smith Street').
        end = m.end(1)
        for word in re.finditer(r"\S+", m.group(2)):
            if word.group() in NOT_SURNAME or word.group() in CALENDAR:
                break
            end = m.start(2) + word.end()
        yield Detection(m.start(1), end, "PERSON", "person", 0.85, "rules")
    for m in NAME_PAIR.finditer(text):
        if not (_first(m.group(2)) and _last(m.group(3))):
            continue
        # A third capitalized word: a surname ('Mary Ann Smith') joins; anything else means a product
        # or an organization ('Willow Baby Monitor'), not a person.
        if nxt := NEXT_WORD.match(text, m.end(1)):
            if _last(nxt.group(1)):
                yield Detection(m.start(1), nxt.end(1), "PERSON", "person", 0.6, "rules")
            continue
        yield _d(m, "PERSON", "person", 0.6, 1)
    for m in NAME_CUE.finditer(text):
        if _first(m.group(1)) and m.group(1)[0].isupper():
            yield _d(m, "PERSON", "first_name", 0.55, 1)


RULES: tuple[Rule, ...] = (emails, urls, phones, ids, financial, network, dates, places, ages, names)


class RulesDetector:
    """All pattern rules. Stdlib only; the name cues read the bundled SSA/Nemotron name tables.

    `extra` adds user patterns: a pack name, `packs.Pattern`s or their specs (see `detect.packs`).
    """

    name = "rules"

    def __init__(self, extra=None):
        self.extra = patterns_for(extra)

    def detect(self, text: str) -> list[Detection]:
        return [d for rule in RULES for d in rule(text)] + [d for p in self.extra for d in p.detect(text)]

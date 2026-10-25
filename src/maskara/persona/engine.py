"""The persona engine: one consistent synthetic person per subject, and replacements drawn from it.

Coherence chain (v0-design §3.2), in order, each step conditioned on the previous ones:

    preserved attributes (sex, age band, region; per preset)
      -> a Nemotron-Personas-USA row matching them (age, sex, state, ZIP, city, education, occupation)
      -> first name for sex x birth decade (SSA), surname, middle name
      -> email from the name on a reserved domain
      -> phone with an area code of the state, in the fictional 555-0100..0199 range
      -> street address in the row's ZIP and city
      -> per-subject date shift
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field, fields
from datetime import date, timedelta
from functools import cache

from .. import data
from ..bench.types import Category
from ..vault import Vault, normalize
from . import formats as fmt
from .geo import AREA_CODES, REGION, STATE_CODES, STATES, STREET_SUFFIXES, STREETS
from .presets import PRESETS, Preset

REFERENCE_YEAR = 2025  # ages in the persona data are as of this year
ADULT_AGES = (18, 80)
MAX_NAME_REDRAWS = 50  # attempts at a persona whose names differ from the original's  # ages a persona is drawn from when the subject's age is unknown
CATEGORIES = ("PERSON", "CONTACT", "ADDRESS", "LOCATION", "DATE", "ID", "FINANCIAL", "CREDENTIAL",
              "NETWORK", "ORG", "DEMOGRAPHIC", "QUANTITY", "OTHER")
ATTRS = ("sex", "age", "birth_year", "birth_date", "state", "zip", "city", "education", "occupation", "name")

# Broad education levels the balanced preset preserves.
EDUCATION_BUCKET = {
    "less_than_9th": "below_hs", "9th_12th_no_diploma": "below_hs", "high_school": "high_school",
    "some_college": "high_school", "associates": "college", "bachelors": "college", "graduate": "graduate",
}


@dataclass(frozen=True)
class Persona:
    """A synthetic person. Every field is generated; none is copied from an original.

    `id` is a stable opaque handle (safe to output). `shift_days` is applied to every date of this
    subject, so gaps between that subject's dates are preserved exactly.
    """

    id: str
    name: str  # "first last"
    first: str
    middle: str
    last: str
    sex: str  # 'F' or 'M'
    age: int
    birth_year: int
    email: str
    phone: str
    street: str
    city: str
    state: str  # USPS code
    zip: str
    education: str
    occupation: str
    shift_days: int
    _engine: PersonaEngine | None = field(default=None, repr=False, compare=False)

    def shift(self, d: date) -> date:
        return d + timedelta(days=self.shift_days)

    def replace(self, category: Category, text: str) -> str:
        """A replacement for `text`, a detected mention of `category` that refers to this subject.

        The result keeps the original's format (name form, phone layout, date format, ID length and
        checksum) and is deterministic: the same persona and text always give the same output.

            PERSON       full name, first, last, initials, 'Last, First', titles and suffixes kept
            CONTACT      email (style of the local part kept) or phone (layout kept)
            ADDRESS      street line, unit, city, state, ZIP, in the parts the original had
            LOCATION     state in the same form (code or name), city, 'City, ST'; countries kept
            DATE         shifted by `shift_days`; text with no recognizable date is left as is
                         unless it contains digits, which are then replaced
            DEMOGRAPHIC  numbers become this persona's age; other values (gender, ...) are kept
            ID, FINANCIAL, CREDENTIAL, NETWORK, ORG, OTHER
                         keyed on the value, not the subject (see `PersonaEngine.replace`); a
                         code's letter prefix is kept ('CUS-575198' -> 'CUS-224730')
            QUANTITY     kept: amounts carry analytic value and identify no one on their own

        Inputs are plain strings; offsets and surrounding text are the caller's concern.
        """
        if category not in CATEGORIES:
            raise ValueError(f"unknown category {category!r}; expected one of {CATEGORIES}")
        if not text.strip():
            return text
        lead, body, trail = _strip(text)
        out = {
            "PERSON": self._person, "CONTACT": self._contact, "ADDRESS": self._address,
            "LOCATION": self._location, "DATE": self._date, "DEMOGRAPHIC": self._demographic,
        }.get(category)
        if out is None:
            return self._engine.replace(category, text)
        return lead + out(body) + trail

    # -- per category -------------------------------------------------------------------------------

    def _person(self, text: str) -> str:
        m = re.match(r"^((?:(?:mr|mrs|ms|miss|mx|dr|prof|sir|rev)\.?\s+)*)(.*?)"
                     r"((?:,?\s+(?:jr|sr|ii|iii|iv|md|phd|esq)\.?)*)((?:'s|’s)?)$", text, re.IGNORECASE)
        title, core, suffix, possessive = m.groups()
        if "," in core:  # 'Smith, John A.'
            last, rest = (p.strip() for p in core.split(",", 1))
            return title + self._last(last) + ", " + self._given(rest) + suffix + possessive
        tokens = core.split()
        if not tokens:
            return text
        if len(tokens) == 1:
            tok = tokens[0]
            if not title and (re.fullmatch(r"(?:[A-Z]\.){2,3}", tok) or (  # 'J.S.', or 'JS' but not 'DOE'
                    re.fullmatch(r"[A-Z]{2,3}", tok) and not self._engine.is_name(tok))):
                letters = [self.first, self.middle, self.last][: len(re.sub(r"\W", "", tok))]
                if len(letters) == 2:
                    letters = [self.first, self.last]
                dot = "." if "." in tok else ""
                out = "".join(w[0] + dot for w in letters)
            elif title or self._engine.looks_like_surname(tok):
                out = self._last(tok)
            else:
                out = self._given(tok)
            return title + out + suffix + possessive
        given = self._given(" ".join(tokens[:-1]))
        return title + given + " " + self._last(tokens[-1]) + suffix + possessive

    def _given(self, text: str) -> str:
        """First name plus any middle names or initials, each in the original token's form."""
        out, names = [], iter([self.first, self.middle])
        for tok in text.split():
            if re.fullmatch(r"(?:[A-Za-z]\.){2,3}", tok):  # 'C.A.': one initial per name
                out.append("".join(match_case(next(names, self.middle)[0], c) + "." for c in tok[::2]))
                continue
            name = next(names, self.middle)
            out.append(match_case(name[0], tok) + tok[1:] if _initial(tok) else fmt.match_case(name, tok))
        return " ".join(out)

    def _last(self, tok: str) -> str:
        return self.last[0] + tok[1:] if _initial(tok) else fmt.match_case(self.last, tok)

    def _contact(self, text: str) -> str:
        if "@" in text:
            local, _, domain = text.partition("@")
            s = self._engine._stream("email", self.id, fmt.ascii_letters(local), domain.lower())
            return fmt.email(text, self.first, self.last, self._engine.email_domain_for(domain), s)
        digits = re.sub(r"\D", "", self.phone)
        if out := fmt.phone(text, digits):
            return out
        return self._engine.replace("CONTACT", text)

    def _address(self, text: str) -> str:
        s = self._engine._stream("address", self.id)
        if m := re.fullmatch(r"\d{5}(-\d{4})?", text):
            return self.zip + (f"-{s.between(1, 9999):04d}" if m.group(1) else "")
        if re.match(r"^p\.?\s*o\.?\s*box\b", text, re.IGNORECASE):
            return fmt.match_case(re.sub(r"\d+", lambda d: fmt.fill(d.group(), s), text), text)
        parts = re.split(r"(,\s*|\n)", text, maxsplit=1)
        head, sep, rest = parts[0], *(parts[1:] if len(parts) == 3 else ("", ""))
        if not re.match(r"^\d", head):  # no street line: 'Springfield, IL 62704'
            return fmt.match_case(self._place(text), text)
        number, name, suffix = self.street.split(" ")
        if not FULL_SUFFIX.search(head):
            suffix = STREET_SUFFIXES[suffix]  # the original abbreviates (or has no suffix): 'St'
        street = f"{number} {name} {suffix}"
        if unit := re.search(r"(?:\b(apt|apartment|suite|ste|unit)|(#))\.?\s*([\w-]+)", text, re.IGNORECASE):
            street += f" {unit.group(0)[: unit.start(3) - unit.start(0)]}{fmt.fill(unit.group(3), s)}"
        out = street + (sep + self._place(rest) if rest else "")
        return fmt.match_case(out, text)

    def _place(self, text: str) -> str:
        """'City', 'City, ST', 'City, State 12345' rebuilt from the persona in the same shape."""
        out = self.city
        if re.search(r"\b[A-Z]{2}\b", text):
            out += f", {self.state}"
        elif any(name.casefold() in text.casefold() for name in STATES.values()):
            out += f", {STATES[self.state]}"
        if m := re.search(r"\b\d{5}(-\d{4})?\b", text):
            out += " " + self.zip + (f"-{self._engine._stream('zip4', self.id).between(1, 9999):04d}"
                                     if m.group(1) else "")
        return out

    def _location(self, text: str) -> str:
        if (code := _state_code(text)) is not None:
            return self.state if code == text.upper() else fmt.match_case(STATES[self.state], text)
        if re.search(r"\d", text):  # coordinates and the like
            return self._engine.replace("LOCATION", text)
        if text.casefold() in COUNTRIES:
            return text
        if m := re.fullmatch(r"(.+?)\s+(county|parish)", text, re.IGNORECASE):
            return fmt.match_case(f"{self.city} {m.group(2)}", text)
        if "," in text or "\n" in text:
            return fmt.match_case(self._place(text), text)
        return fmt.match_case(self.city, text)

    def _date(self, text: str) -> str:
        out, n = fmt.shift_dates(text, self.shift_days)
        if n or not re.search(r"\d", text) or _time_or_year(text):
            return out
        return self._engine.replace("OTHER", text)

    def _demographic(self, text: str) -> str:
        return re.sub(r"\d+", str(self.age), text, count=1) if re.search(r"\d", text) else text


class PersonaEngine:
    """Assigns personas to subjects and replaces values, deterministically under a vault key.

        engine = PersonaEngine(preset="balanced", vault=Vault(".maskara/vault.db"))
        p = engine.persona_for("user_123", {"sex": "F", "age": 47, "state": "IL"})
        p.replace("PERSON", "Dr. Jane Doe")     # 'Dr. Linda Whitaker'
        p.replace("DATE", "March 3, 2004")      # 'February 14, 2004'

    `vault` defaults to `Vault.ephemeral()`: consistent within the process only. `namespace` scopes
    subject keys, so the same key in two projects can get different personas. `email_domain`
    replaces the reserved example.com/.org/.net domains.
    """

    def __init__(self, preset: str | Preset = "balanced", vault: Vault | None = None, *,
                 namespace: str = "default", email_domain: str | None = None):
        if isinstance(preset, str) and preset not in PRESETS:
            raise ValueError(f"unknown preset {preset!r}; expected one of {sorted(PRESETS)}")
        self.preset = PRESETS[preset] if isinstance(preset, str) else preset
        self.vault = vault or Vault.ephemeral()
        self.namespace = namespace
        self.email_domain = email_domain

    # -- public -------------------------------------------------------------------------------------

    def persona_for(self, subject_key: str, attrs: Mapping[str, object] | None = None) -> Persona:
        """The persona of `subject_key`, created on first use and reused afterwards.

        `subject_key` is any stable identifier of a real person (user id, email, MRN); it is hashed
        with the vault key and never stored. `attrs` are that person's known attributes, used to
        condition the persona per the preset: sex, age | birth_year | birth_date, state, zip, city,
        education, occupation, and name (used to infer sex when `sex` is missing, and so that the
        persona shares no first or last name with it: 'Brian Bell' never becomes 'Brian Wong'; the
        name is not stored). The first assignment wins: later calls return the stored persona even
        if they pass different attrs. Distinct subjects always get distinct names. Not thread-safe
        (one SQLite connection).
        """
        subject = self.vault.lookup("subject", self.namespace, subject_key)
        target = self._target(attrs or {})
        avoid = {normalize(w) for w in re.findall(r"[^\W\d_]+", str((attrs or {}).get("name") or ""))}

        def make(first: int) -> dict:
            # The next attempt whose names differ from the original's: deterministic, and since
            # attempts only move forward, the vault's retries on taken names still terminate.
            for attempt in range(first, first + MAX_NAME_REDRAWS):
                persona = self._make(subject, target, attempt)
                if not avoid & {normalize(persona["first"]), normalize(persona["last"])}:
                    break
            return persona

        stored = self.vault.subject(self.namespace, subject, make)
        return Persona(**stored, _engine=self)

    def replace(self, category: Category, text: str) -> str:
        """A replacement for a value that is not tied to a known subject.

        Value-keyed categories (ID, FINANCIAL, CREDENTIAL, NETWORK, ORG, OTHER) give the same
        output for the same input everywhere, and distinct inputs never collide, so join keys
        survive. Person-bound categories (PERSON, CONTACT, ADDRESS, LOCATION, DEMOGRAPHIC) use a
        persona derived from the value itself; DATE uses one namespace-wide shift. An upper-case
        letter prefix of an id is format and stays: only the digits after it are replaced, keyed on
        the digits, so 'CUS-575198' in a column, in a text, and a bare '575198' all stay joined.
        """
        if category not in CATEGORIES:
            raise ValueError(f"unknown category {category!r}; expected one of {CATEGORIES}")
        if not text.strip() or category == "QUANTITY":
            return text
        if category == "DATE":
            return self.persona_for("\0dates").replace("DATE", text)
        if category in ("ID", "FINANCIAL") and (code := self._code(text)):
            lead, prefix, body, trail = code
            return lead + prefix + self.replace(category, body) + trail
        if category in ("PERSON", "CONTACT", "ADDRESS", "LOCATION", "DEMOGRAPHIC") and not (
                category in ("CONTACT", "LOCATION") and self._value_shaped(category, text)):
            # A persona for the value itself, conditioned on what the text reveals (the sex of a
            # first name, the state of a place), so the preset's preservation rules still hold.
            attrs = {"name": text} if category == "PERSON" else _place_attrs(text)
            return self.persona_for(f"\0{category}:{text}", attrs).replace(category, text)
        lookup = self.vault.lookup("value", self.namespace, category, text)

        def make(attempt: int) -> str:
            s = self.vault.stream("value", self.namespace, lookup, str(attempt))
            out = self._value(category, text, s)
            for _ in range(20):  # short values can come out unchanged; never return the original
                if out != text:
                    break
                out = fmt.fill(text, s)
            return out

        if category in ("ID", "FINANCIAL", "CREDENTIAL", "ORG"):
            return self.vault.value(self.namespace, category, lookup, make)
        return make(0)

    # -- persona construction -----------------------------------------------------------------------

    def _target(self, attrs: Mapping[str, object]) -> dict:
        """Normalize caller attrs into the conditions the sampler matches on."""
        unknown = set(attrs) - set(ATTRS)
        if unknown:
            raise ValueError(f"unknown attrs {sorted(unknown)}; expected some of {ATTRS}")
        t: dict = {}
        sex = str(attrs.get("sex") or "").strip().lower()
        if sex[:1] in ("f", "w") or sex in ("girl",):
            t["sex"] = "F"
        elif sex[:1] in ("m", "b"):
            t["sex"] = "M"
        if attrs.get("age") is not None:
            t["age"] = int(attrs["age"])
        elif attrs.get("birth_year") is not None:
            t["age"] = REFERENCE_YEAR - int(attrs["birth_year"])
        elif attrs.get("birth_date") is not None:
            bd = attrs["birth_date"]
            t["age"] = REFERENCE_YEAR - (bd.year if isinstance(bd, date) else int(str(bd)[:4]))
        index = _index()
        if attrs.get("zip"):
            z = str(attrs["zip"]).strip()[:5].zfill(5)
            if z in index.zips:
                t.setdefault("state", index.zips[z][0])
                t.setdefault("city", index.zips[z][1])
        if attrs.get("state"):
            t["state"] = _state_code(str(attrs["state"])) or t.get("state")
        if attrs.get("city"):
            t["city"] = str(attrs["city"]).strip()
        if t.get("state") and t.get("city"):
            t["size"] = index.sizes.get((t["state"], t["city"].casefold()))
        if "sex" not in t and attrs.get("name"):  # used only to infer sex; never stored
            first = str(attrs["name"]).split(",")[-1].split()
            if first and (sex := data.names().first_sex.get(first[0].capitalize())):
                t["sex"] = sex
        if attrs.get("education"):
            t["education"] = _education_bucket(str(attrs["education"]))
        if attrs.get("occupation"):
            t["occupation"] = re.sub(r"[^a-z0-9]+", "_", str(attrs["occupation"]).lower()).strip("_")
        return t

    def _make(self, subject: str, t: dict, attempt: int) -> dict:
        p = self.preset
        s = self.vault.stream("persona", self.namespace, subject, str(attempt))
        row = self._sample(t, s)
        age = row.age
        if "age" in t:
            lo, hi = _band(t["age"], p.age_band)
            if not lo <= age <= hi:
                age = s.between(lo, hi)
        birth_year = REFERENCE_YEAR - age

        names = data.names()
        decades = sorted(d for sex, d in names.first if sex == row.sex)
        decade = min(max(birth_year // 10 * 10, decades[0]), decades[-1]) if p.cohort_names else s.pick(decades)
        first = s.weighted(*names.first[(row.sex, decade)])
        middle = first
        while middle == first:
            middle = s.weighted(*names.first[(row.sex, decade)])
        last = s.weighted(*names.last)

        domain = self.email_domain or s.pick(fmt.RESERVED_DOMAINS)
        email = f"{fmt.ascii_letters(first)}.{fmt.ascii_letters(last)}@{domain}"
        phone = f"({s.pick(AREA_CODES[row.state].split())}) 555-01{s.below(100):02d}"
        street = f"{s.between(100, 9899)} {s.pick(STREETS)} {s.pick(list(STREET_SUFFIXES))}"
        shift = s.between(1, p.max_shift_days) * (1 if s.below(2) else -1)
        persona = Persona(
            id=hashlib.sha256(f"{subject}\0{attempt}".encode()).hexdigest()[:16], name=f"{first} {last}",
            first=first, middle=middle, last=last, sex=row.sex, age=age, birth_year=birth_year, email=email,
            phone=phone, street=street, city=row.city, state=row.state, zip=row.zip, education=row.education,
            occupation=row.occupation, shift_days=shift,
        )
        return {f.name: getattr(persona, f.name) for f in fields(Persona) if f.name != "_engine"}

    def _sample(self, t: dict, s) -> data.Row:
        """A persona row matching `t` under the preset, relaxing conditions until one matches.

        Geography relaxes from the preset's level to wider ones; within each, occupation is dropped
        first, then education, then age. Sex is never relaxed. Without a known age the row is an
        adult (`ADULT_AGES`), drawn at the data's own age distribution within that range.
        """
        p, index = self.preset, _index()
        sex = t.get("sex") or ("F" if s.below(2) else "M")
        state = t.get("state")
        groups: list[tuple[_Group, object]] = []  # widening geography, with an optional row filter
        if state:
            by_state = index.groups.get((sex, state), EMPTY)
            if p.region == "state+size" and t.get("size"):
                groups.append((by_state, lambda r: r.size == t["size"]))
            if p.region != "region":
                groups.append((by_state, None))
            groups.append((index.groups.get((sex, REGION.get(state)), EMPTY), None))
        groups.append((index.groups[(sex, "*")], None))

        conds = []  # dropped from the end: occupation first, then education
        if p.education and t.get("education"):
            conds.append(lambda r: EDUCATION_BUCKET.get(r.education) == t["education"])
        if p.occupation and t.get("occupation"):
            conds.append(lambda r: r.occupation == t["occupation"])
        for group, geo in groups:
            # Age band first, then any age. With no age known, an adult: the data includes children,
            # and a subject known only by name (a staff member, a customer) is almost never one.
            bases = [group.rows]
            if "age" in t:
                lo, hi = _band(t["age"], p.age_band)
                bases.insert(0, [r for age in range(lo, hi + 1) for r in group.by_age.get(age, ())])
            else:
                bases.insert(0, group.adults)
            for base in bases:
                for k in range(len(conds), -1, -1):
                    active = conds[:k] + ([geo] if geo else [])
                    match = [r for r in base if all(c(r) for c in active)] if active else base
                    if match:
                        return s.pick(match)
        raise AssertionError("persona data is empty")

    # -- value-keyed replacements -------------------------------------------------------------------

    def _stream(self, *parts: str):
        return self.vault.stream(self.namespace, *parts)

    def email_domain_for(self, original_domain: str) -> str:
        """The configured domain, or a reserved one chosen by the original domain (same in, same out)."""
        if self.email_domain:
            return self.email_domain
        return fmt.RESERVED_DOMAINS[int(self.vault.lookup("domain", original_domain), 16) % 3]

    def looks_like_surname(self, token: str) -> bool:
        names, word = data.names(), token.capitalize()
        return names.last_freq.get(word, 0) > names.first_freq.get(word, 0)

    def is_name(self, token: str) -> bool:
        names, word = data.names(), token.capitalize()
        return word in names.first_freq or word in names.last_freq

    def _code(self, text: str) -> tuple[str, str, str, str] | None:
        """(lead, prefix, digits, trail) of a letter-prefixed code ('CUS-575198', 'T67592'), else None.

        Only upper-case prefixes of up to five letters before four or more digits count. Letters that
        could be a name ('LEE-20431') may be someone's, so those codes are replaced whole.
        """
        lead, body, trail = _strip(text)
        m = CODE.fullmatch(body)
        if m is None or self.is_name(m["letters"]):
            return None
        return lead, m["prefix"], m["digits"], trail

    def _value_shaped(self, category: str, text: str) -> bool:
        """CONTACT and LOCATION values that are not about a person: unknown phone layouts, coordinates."""
        if category == "CONTACT":
            return "@" not in text and fmt.phone(text, "0" * 10) is None
        return bool(re.search(r"\d", text))

    def _value(self, category: str, text: str, s) -> str:
        lead, body, trail = _strip(text)
        if category == "ID" and fmt.SSN.match(body):
            out = fmt.ssn(body, s)
        elif category in ("ID", "FINANCIAL") and 13 <= len(re.sub(r"\D", "", body)) <= 19 \
                and re.fullmatch(r"[\d \-]+", body):
            out = fmt.card(body, s) if category == "FINANCIAL" or fmt.luhn_ok(re.sub(r"\D", "", body)) \
                else fmt.identifier(body, s)
        elif category in ("ID", "FINANCIAL"):
            out = fmt.identifier(body, s)
        elif category == "NETWORK":
            out = fmt.network(body, s)
        elif category == "ORG":
            out = _org(body, s)
        else:
            out = fmt.fill(body, s)
        return lead + out + trail


# -- helpers ----------------------------------------------------------------------------------------

CODE = re.compile(r"(?P<prefix>(?P<letters>[A-Z]{1,5})[-_/#.: ]?)(?P<digits>\d(?:[-_/. ]?\d){3,})")
FULL_SUFFIX = re.compile(rf"\b(?:{'|'.join(STREET_SUFFIXES)})\b", re.IGNORECASE)
COUNTRIES = {"us", "u.s.", "usa", "u.s.a.", "united states", "united states of america", "america"}
ORG_KEEP = ("University", "College", "School", "Hospital", "Clinic", "Medical Center", "Bank", "Credit Union",
            "Church", "Foundation", "Institute", "Library", "Museum", "Pharmacy")
ORG_NOUNS = ("Group", "Partners", "Systems", "Holdings", "Logistics", "Industries", "Labs", "Works",
             "Services", "Solutions", "Associates", "Supply", "Media", "Health", "Foods", "Capital")
ORG_SUFFIX = re.compile(r"(,?\s+(?:inc|llc|l\.l\.c|corp|corporation|co|ltd|llp|plc|lp)\.?)$", re.IGNORECASE)


def _org(text: str, s) -> str:
    suffix = m.group(1) if (m := ORG_SUFFIX.search(text)) else ""
    keep = next((k for k in ORG_KEEP if k.casefold() in text.casefold()), None)
    name = s.weighted(*data.names().last)
    out = f"{name} {keep or s.pick(ORG_NOUNS)}{suffix}"
    return fmt.match_case(out, text)


def _place_attrs(text: str) -> dict:
    """The state a place mention reveals: a state name or code, a known ZIP, or a known city."""
    if m := re.search(r"\b\d{5}\b", text):
        return {"zip": m.group()}
    for part in reversed(re.split(r"[,\n]", text)):
        words = part.split()
        for n in range(len(words), 0, -1):
            for i in range(len(words) - n + 1):
                if code := _state_code(" ".join(words[i:i + n])):
                    return {"state": code}
    city = re.split(r"[,\n]", text)[0].strip().casefold()
    return {"state": _index().cities[city], "city": city} if city in _index().cities else {}


def _strip(text: str) -> tuple[str, str, str]:
    body = text.strip()
    start = text.index(body) if body else 0
    return text[:start], body, text[start + len(body):]


def _initial(tok: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z]\.?", tok))


def match_case(letter: str, like: str) -> str:
    return letter.lower() if like[:1].islower() else letter.upper()


def _state_code(text: str) -> str | None:
    t = text.strip().rstrip(".")
    if len(t) == 2 and t.upper() in STATES:
        return t.upper()
    return STATE_CODES.get(t.casefold())


def _time_or_year(text: str) -> bool:
    return bool(re.fullmatch(r"\s*(?:\d{4}|\d{1,2}(?::\d{2}){1,2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)\s*",
                             text, re.IGNORECASE))


def _band(age: int, width: int) -> tuple[int, int]:
    if width == 0:
        return age, age
    lo = age // width * width
    return lo, lo + width - 1


def _education_bucket(text: str) -> str | None:
    t = text.lower()
    if t in EDUCATION_BUCKET:
        return EDUCATION_BUCKET[t]
    for bucket, words in (("graduate", ("graduate", "master", "phd", "doctor", "professional")),
                          ("college", ("bachelor", "associate", "college degree", "ba", "bs")),
                          ("high_school", ("high school", "ged", "some college", "diploma")),
                          ("below_hs", ("less", "no diploma", "9th", "elementary", "none"))):
        if any(w in t for w in words):
            return bucket
    return None


@dataclass
class _Group:
    rows: list = field(default_factory=list)
    by_age: dict = field(default_factory=dict)
    adults: list = field(default_factory=list)  # rows within ADULT_AGES


EMPTY = _Group()


@dataclass
class _Index:
    groups: dict = field(default_factory=dict)  # (sex, state | region | '*') -> rows
    zips: dict = field(default_factory=dict)    # zip -> (state, city)
    sizes: dict = field(default_factory=dict)   # (state, city casefolded) -> size tier
    cities: dict = field(default_factory=dict)  # city casefolded -> the state with most people there


@cache
def _index() -> _Index:
    idx, city_states = _Index(), Counter()
    for r in data.personas():
        for key in (r.state, REGION.get(r.state), "*"):
            group = idx.groups.setdefault((r.sex, key), _Group())
            group.rows.append(r)
            group.by_age.setdefault(r.age, []).append(r)
            if ADULT_AGES[0] <= r.age <= ADULT_AGES[1]:
                group.adults.append(r)
        idx.zips.setdefault(r.zip, (r.state, r.city))
        idx.sizes.setdefault((r.state, r.city.casefold()), r.size)
        city_states[(r.city.casefold(), r.state)] += 1
    for (city, state), _ in city_states.most_common():
        idx.cities.setdefault(city, state)
    return idx

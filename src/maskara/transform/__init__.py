"""Apply replacements: table cells by column role, free text span by span.

Text is rebuilt from its edits in one pass (never a global search-and-replace of originals), so an
original that happens to occur inside other text is left alone unless it was detected there.

Whose persona a replacement comes from is the resolver's call; here it only matters whether there is
one. Without an owner, person-bound values (a stray email, an unlinked street) get a persona derived
from the value itself and dates take one namespace-wide shift, via `PersonaEngine.replace`.

Birth dates are never just shifted: a shift of a few weeks keeps the real age, so they become a date
in the persona's birth year, which the preset already drew within its age band.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from ..detect.base import Detection
from ..detect.known import KnownValues
from ..persona import Persona, PersonaEngine
from ..persona import formats as fmt
from ..persona.formats import parse_date, shift_dates
from ..resolve import PERSON_BOUND, Link, titled
from ..vault import normalize
from .columns import ROLES, infer, missing

ROLE_CATEGORY = {
    "name": "PERSON", "first_name": "PERSON", "last_name": "PERSON", "email": "CONTACT", "phone": "CONTACT",
    "address": "ADDRESS", "zip": "ADDRESS", "city": "LOCATION", "state": "LOCATION", "dob": "DATE",
    "date": "DATE", "age": "DEMOGRAPHIC", "id": "ID", "financial": "FINANCIAL", "secret": "CREDENTIAL",
    "network": "NETWORK",
}


@dataclass(frozen=True)
class Edit:
    start: int
    end: int
    replacement: str


def rebuild(text: str, edits: list[Edit]) -> tuple[str, list[tuple[int, int]]]:
    """The text with `edits` applied (sorted, non-overlapping), and each edit's span in the output."""
    out, spans, pos, size = [], [], 0, 0
    for e in edits:
        if e.start < pos:
            raise ValueError(f"overlapping edit at {e.start}")
        out.append(text[pos:e.start])
        size += e.start - pos
        out.append(e.replacement)
        spans.append((size, size + len(e.replacement)))
        size += len(e.replacement)
        pos = e.end
    out.append(text[pos:])
    return "".join(out), spans


class Replacer:
    """Personas per subject, created on first use from the attributes the tables gave."""

    def __init__(self, engine: PersonaEngine, attrs: Mapping[str, dict], known: KnownValues):
        self.engine = engine
        self.attrs = attrs
        self.known = known
        self._personas: dict[str, Persona] = {}

    def persona(self, subject: str, sex: str | None = None) -> Persona:
        """`sex` is what a title in the text says ('Mr'), used for a name no table knows."""
        if subject not in self._personas:
            attrs = self.attrs.get(subject)
            if attrs is None and subject.startswith("name:"):
                # The name infers sex from the first name and keeps the persona off the original's names.
                attrs = {"name": subject[5:].split("\0")[0].title(), **({"sex": sex} if sex else {})}
            self._personas[subject] = self.engine.persona_for(subject, attrs or {})
        return self._personas[subject]

    def personas(self) -> list[Persona]:
        """Every persona handed out so far, in order of first use."""
        return list(self._personas.values())

    # -- text ---------------------------------------------------------------------------------------

    def mention(self, text: str, d: Detection, link: Link) -> str:
        span = text[d.start:d.end]
        if link.birth:
            return self.birth_date(span, self.persona(link.subject) if link.subject else None)
        if d.category not in PERSON_BOUND or link.subject is None:
            return self.engine.replace(d.category, span)
        p = self.persona(link.subject, _title_sex(text, d.start) if d.category == "PERSON" else None)
        if d.category == "PERSON" and "\n" in span:  # a model span over a line break: each line is a name
            return "\n".join(p.replace("PERSON", line) for line in span.split("\n"))
        if d.category == "PERSON" and len(span.split()) == 1 and span[:1].isalpha():
            return self._name_part(p, link.subject, span, titled(text, d.start))
        return p.replace(d.category, span)

    def _name_part(self, p: Persona, subject: str, word: str, has_title: bool) -> str:
        """A lone name in the role the tables give it: Lopez is a surname even if it looks like a first name."""
        bare = word[:-2] if word.endswith(("'s", "’s")) else word
        tail = word[len(bare):]
        key = normalize(bare)
        if key in self.known.last.get(subject, ()) or (has_title and key not in self.known.first.get(subject, ())):
            return fmt.match_case(p.last, bare) + tail
        if key in self.known.first.get(subject, ()):
            return fmt.match_case(p.first, bare) + tail
        return p.replace("PERSON", word)

    def birth_date(self, text: str, p: Persona | None) -> str:
        day = parse_date(text)
        if day is None:
            return (p or self.engine).replace("DATE", text)
        if p is None:  # nobody known: a persona for the date itself, conditioned on the age it implies
            p = self.engine.persona_for(f"\0birth:{day.isoformat()}", {"birth_date": day})
        new = self._birth(p)
        return shift_dates(text, (new - day).days)[0]

    def _birth(self, p: Persona) -> date:
        s = self.engine.vault.stream(self.engine.namespace, "birth", p.id)
        return date(p.birth_year, 1, 1) + timedelta(days=s.below(365))

    # -- cells --------------------------------------------------------------------------------------

    def cell(self, role: str, value: object, subject: str | None) -> object:
        if role in ("keep", "sex", "text") or missing(value) or isinstance(value, bool):
            return value
        if isinstance(value, (date, datetime)):
            return self._date_value(role, value, subject)
        s = str(value)
        category = ROLE_CATEGORY[role]
        if role in ("id", "financial", "secret", "network"):
            out = self.engine.replace(category, s)
        elif subject is None:
            out = self.birth_date(s, None) if role == "dob" else self.engine.replace(category, s)
        else:
            p = self.persona(subject)
            if role == "dob":
                out = self.birth_date(s, p)
            elif role in ("first_name", "last_name") and len(s.split()) == 1:
                out = fmt.match_case(p.first if role == "first_name" else p.last, s)
            else:
                out = p.replace(category, s)
        return _same_type(value, out)

    def _date_value(self, role: str, value: date, subject: str | None) -> date:
        is_dt = isinstance(value, datetime)
        day = value.date() if is_dt else value
        if role == "dob":
            p = self.persona(subject) if subject else self.engine.persona_for(f"\0birth:{day}", {"birth_date": day})
            new = self._birth(p)
        elif role == "date":
            shift = self.persona(subject).shift_days if subject else self.engine.persona_for("\0dates").shift_days
            new = day + timedelta(days=shift)
        else:
            return value
        return value + (new - day) if is_dt else new


TITLE_SEX = {"mr": "M", "sir": "M", "mrs": "F", "ms": "F", "miss": "F", "madam": "F"}


def _title_sex(text: str, start: int) -> str | None:
    """'M' or 'F' when a gendered title stands right before `start` ('Mr Lasse Lilja')."""
    m = re.search(r"(\w+)\.?\s+$", text[max(0, start - 8):start])
    return TITLE_SEX.get(m.group(1).lower()) if m else None


def _same_type(original: object, out: str) -> object:
    """Numbers stay numbers when the replacement is still a number (an age, a numeric id)."""
    try:
        if isinstance(original, int):
            return int(out)
        if isinstance(original, float):
            return float(out)
    except ValueError:
        pass
    return out


__all__ = ["ROLES", "ROLE_CATEGORY", "Edit", "Replacer", "infer", "missing", "rebuild"]

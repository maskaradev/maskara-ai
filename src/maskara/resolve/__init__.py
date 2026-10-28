"""Evidence-aware mention ownership.

Table keys establish row identities. Unique known values and unambiguous context can
link text to those identities. Competing candidates abstain instead of choosing by
sort order. Names without a known identity form provisional, document-local groups;
name equality alone never establishes cross-document identity.

Subjects and candidate keys hold originals in memory; API audit output uses only
opaque persona ids, counts and fixed evidence codes.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from ..detect.base import Detection
from ..detect.known import Known, KnownValues
from ..persona.formats import parse_date
from ..vault import normalize

TITLES = {"mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "madam", "rev"}
PERSON_ROLES = ("name", "first_name", "last_name")
# Categories whose replacement is drawn from the owner's persona. The rest are keyed on the value
# (ids, card numbers), which keeps join keys equal across tables and texts.
PERSON_BOUND = ("PERSON", "CONTACT", "ADDRESS", "LOCATION", "DATE", "DEMOGRAPHIC")


def subject_key(value: object, scope: str = "") -> str:
    return f"subject:{scope}:{value}" if scope else f"subject:{value}"


@dataclass
class Link:
    """Who a detection refers to. `subject` None means nobody known: replaced keyed on its value."""

    subject: str | None
    how: str            # row | known | context | name | value
    birth: bool = False  # a birth date, generalized to the persona's birth year instead of shifted
    name: tuple[str, ...] = ()  # normalized name tokens of an unlinked person, for clustering
    resolution: str = "resolved"  # resolved | provisional | ambiguous | unresolved
    evidence: tuple[str, ...] = ()
    candidates: tuple[str, ...] = ()  # in memory only

    def __post_init__(self):
        if self.subject is None and self.resolution == "resolved":
            self.resolution = "unresolved"


class Resolver:
    def __init__(self, known: KnownValues, birth_dates: dict[str, set[date]]):
        self.known = known
        self.birth_dates = birth_dates

    def link(self, text: str, detections: list[Detection], row: str | None,
             others: list[str] = ()) -> list[Link]:
        """Link only when the available evidence selects one candidate.

        Row, foreign-key subjects and unique strong matches are peers: their order
        must not break ties. Shared values cannot introduce a strong context anchor.
        """
        strong = set()
        for d in detections:
            subjects = {k.subject for k in self._entries(text, d) if k.strong}
            if len(subjects) == 1:
                strong.update(subjects)
        context = set(others) | strong | ({row} if row else set())
        links = [self._link(text, d, row, context) for d in detections]
        # Propagate a resolved repeated name only if every accepted occurrence agrees
        # and no occurrence carries competing candidates. Dates are never propagated.
        groups = defaultdict(list)
        for i, d in enumerate(detections):
            if d.category == "PERSON":
                groups[normalize(text[d.start:d.end])].append(i)
        for indices in groups.values():
            accepted = [links[i] for i in indices if links[i].resolution == "resolved"]
            if len({link.subject for link in accepted}) == 1 and not any(
                    links[i].resolution == "ambiguous" for i in indices):
                for i in indices:
                    links[i] = accepted[0]
        return links

    @staticmethod
    def choose(subjects: set[str], context: set[str], row: str | None, *,
               unique: bool = True, evidence: str = "known_value") -> Link:
        candidates = tuple(sorted(subjects))
        selected = subjects & context
        if len(subjects) == 1 and unique:
            selected = subjects
        if len(selected) == 1:
            subject = next(iter(selected))
            return Link(subject, "row" if subject == row else "known", evidence=(evidence,
                        "unique_candidate" if len(subjects) == 1 else "unique_context"), candidates=candidates)
        if len(subjects) > 1:
            return Link(None, "value", resolution="ambiguous", evidence=(evidence, "multiple_candidates"),
                        candidates=candidates)
        return Link(None, "value", evidence=(evidence, "insufficient_context"), candidates=candidates)

    def _link(self, text: str, d: Detection, row: str | None, context: set[str]) -> Link:
        span = text[d.start:d.end]
        if d.category in ("DATE", "DEMOGRAPHIC"):
            birth = d.label == "birth_date"
            if d.category == "DATE" and (day := parse_date(span)):
                births = {s for s in context if day in self.birth_dates.get(s, ())}
                if births:
                    link = self.choose(births, context, row, evidence="known_birth_date")
                    link.birth = True
                    return link
            link = self.choose(context, context, row, evidence="document_owner")
            if link.subject and link.subject != row:
                link.how = "context"
            link.birth = birth
            return link
        entries = self._entries(text, d)
        if d.category == "PERSON" and not entries:
            entries = self._name_parts(span)
        if entries:
            unique = any(k.strong for k in entries) or (d.category == "PERSON" and (
                titled(text, d.start) or all(k.role == "first_name" for k in entries)))
            return self.choose({k.subject for k in entries}, context, row, unique=unique)
        if d.category == "PERSON":
            return Link(None, "name", name=_name_tokens(span), evidence=("name_only",))
        return Link(None, "value", evidence=("no_known_owner",))

    def _entries(self, text: str, d: Detection) -> list[Known]:
        span = text[d.start:d.end]
        roles = {"PERSON": PERSON_ROLES, "CONTACT": ("email", "phone"),
                 "ADDRESS": ("address", "zip"), "LOCATION": ("city",),
                 "ID": ("id",), "FINANCIAL": ("financial",)}.get(d.category, ())
        if d.category == "CONTACT" and "@" not in span:
            return [Known(s, "phone", True) for s in sorted(self.known.phone(span))]
        entries = self.known.lookup(_strip_name(span) if d.category == "PERSON" else span)
        entries = [k for k in entries if k.role in roles]
        if not entries and d.category in ("ADDRESS", "LOCATION"):
            parts = re.split(r",|\n", span)
            entries = self.known.lookup(parts[0]) or (self.known.lookup(parts[-1].split()[-1])
                       if re.search(r"\d{5}\s*$", span) else [])
            entries = [k for k in entries if k.role in ("address", "zip", "city")]
        return entries

    def _name_parts(self, span: str) -> list[Known]:
        """'Maria L. Lopez' or "Maria Lopez's" from a model: first and last token of one subject."""
        tokens = _name_tokens(span)
        if len(tokens) < 2:
            return []
        firsts = {k.subject for k in self.known.lookup(tokens[0]) if k.role == "first_name"}
        lasts = {k.subject for k in self.known.lookup(tokens[-1]) if k.role == "last_name"}
        return [Known(s, "name", True) for s in sorted(firsts & lasts)]

    @staticmethod
    def cluster(links: list[list[Link]], scopes: list[str] | None = None) -> None:
        """Provisional name groups within each document; never a verified identity.

        A short alias can join one local full name. Multiple local candidates abstain.
        Scope is the source/row/column location in the API, or the document index here.
        """
        if scopes is not None and len(scopes) != len(links):
            raise ValueError("one name scope is required per document")
        for i, text_links in enumerate(links):
            scope = scopes[i] if scopes is not None else str(i)
            local = defaultdict(set)
            for link in text_links:
                if link.how == "name" and len(link.name) >= 2:
                    # Keep middle names: first+last equality is not identity evidence.
                    link.subject = "name:" + " ".join(link.name) + "\0" + scope
                    link.resolution = "provisional"
                    for token in (link.name[0], link.name[-1]):
                        local[token].add(link.subject)
            for link in text_links:
                if link.how != "name" or link.subject or not link.name:
                    continue
                candidates = local.get(link.name[0], set())
                link.candidates = tuple(sorted(candidates))
                if len(candidates) > 1:
                    link.resolution = "ambiguous"
                    link.evidence = ("name_only", "multiple_local_names")
                else:
                    link.subject = next(iter(candidates)) if candidates else "name:" + link.name[0] + "\0" + scope
                    link.resolution = "provisional"
                    link.evidence = ("name_only", "local_alias" if candidates else "local_name")


def titled(text: str, start: int) -> bool:
    """A title ('Ms.', 'Dr') right before `start`."""
    m = re.search(r"(\w+)\.?\s+$", text[max(0, start - 8):start])
    return bool(m and m.group(1).lower() in TITLES)


def _strip_name(span: str) -> str:
    """'Ms. Lopez's' -> 'Lopez': the form names are indexed in."""
    s = re.sub(r"['’]s$", "", span.strip())
    words = s.split()
    while len(words) > 1 and words[0].rstrip(".").lower() in TITLES:
        words.pop(0)
    return " ".join(words)


def _name_tokens(span: str) -> tuple[str, ...]:
    words = [w for w in re.findall(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", _strip_name(span))]
    if "," in span and len(words) >= 2:  # 'Lopez, Maria'
        words = words[1:] + words[:1]
    return tuple(normalize(w) for w in words if w.lower() not in TITLES and len(w) > 1 or len(words) == 1)

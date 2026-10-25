"""Mention -> subject: whose data each detected span is.

Subjects come from tables: a row's subject is its value in the subject key column(s) the caller names
(`subjects={"users": "user_id"}`), so every table that carries `user_id` points at the same person.
Free text is linked to those subjects through known values (`detect.known`), preferring, when a value
is ambiguous (two customers named Maria), the subject of the text's own row and then subjects with a
strong match elsewhere in the same text.

Person mentions that match no table are clustered by normalized name over the whole run, so 'Maria
Garcia' in two documents gets one persona and 'Ms. Garcia' joins her when that is unambiguous.

Subject keys are internal strings ('subject:C042', 'name:maria garcia'); they hold originals and stay
in memory. Only persona ids, which are keyed hashes, reach any output.
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
    how: str            # 'row' | 'known' | 'context' | 'name' | 'value'
    birth: bool = False  # a birth date, generalized to the persona's birth year instead of shifted
    name: tuple[str, ...] = ()  # normalized name tokens of an unlinked person, for clustering


class Resolver:
    def __init__(self, known: KnownValues, birth_dates: dict[str, set[date]]):
        self.known = known
        self.birth_dates = birth_dates

    def link(self, text: str, detections: list[Detection], row: str | None, others: list[str] = ()) -> list[Link]:
        """One link per detection. Unlinked names get `how='name'` and a subject from `cluster`.

        `row` is the subject of the text's own row; `others` are further subjects that row points to
        (the agent on a ticket). Ambiguous values go to `row` first, then `others`, then subjects
        with a strong match in the same text.
        """
        strong = {k.subject for d in detections for k in self._entries(text, d) if k.strong}
        first = ([row] if row else []) + [s for s in others if s != row]
        context = first + sorted(strong - set(first))
        people = sorted({s for d in detections if d.category == "PERSON"
                         for s in self._candidates(text, d, context)[:1]} | ({row} if row else set()))
        owner = row or (people[0] if len(people) == 1 else None)
        links = [self._link(text, d, row, context, owner) for d in detections]
        # The same value twice in one text is one value: every occurrence takes the link of the first
        # that found an owner (a bare 'Saleh' follows 'Ms. Saleh'), so all get the same replacement.
        best: dict[tuple[str, str], Link] = {}
        for d, link in zip(detections, links):
            key = (d.category, text[d.start:d.end])
            if key not in best or (best[key].subject is None and link.subject is not None):
                best[key] = link
        return [best[(d.category, text[d.start:d.end])] for d in detections]

    def _link(self, text: str, d: Detection, row: str | None, context: list[str], owner: str | None) -> Link:
        span = text[d.start:d.end]
        if d.category in ("DATE", "DEMOGRAPHIC"):
            if d.category == "DATE" and (day := parse_date(span)):
                births = [s for s in context if day in self.birth_dates.get(s, ())]
                if births:
                    return Link(births[0], "known", birth=True)
            return Link(owner, "row" if owner == row and row else "context", birth=d.label == "birth_date") \
                if owner else Link(None, "value", birth=d.label == "birth_date")
        found = self._candidates(text, d, context)
        if found:
            return Link(found[0], "row" if found[0] == row else "known")
        if d.category == "PERSON":
            return Link(None, "name", name=_name_tokens(span))
        return Link(None, "value")

    def _entries(self, text: str, d: Detection) -> list[Known]:
        span = text[d.start:d.end]
        if d.category == "PERSON":
            return self.known.lookup(_strip_name(span))
        if d.category == "CONTACT" and "@" not in span:
            return [Known(s, "phone", True) for s in sorted(self.known.phone(span))]
        entries = self.known.lookup(span)
        if not entries and d.category in ("ADDRESS", "LOCATION"):
            # 'Denver, CO 80216': the city part, then the street line of a longer address.
            parts = re.split(r",|\n", span)
            entries = self.known.lookup(parts[0]) or (self.known.lookup(parts[-1].split()[-1])
                                                      if re.search(r"\d{5}\s*$", span) else [])
        return entries

    def _candidates(self, text: str, d: Detection, context: list[str]) -> list[str]:
        """Subjects this detection can refer to, best first."""
        entries = self._entries(text, d)
        if d.category == "PERSON" and not entries:
            entries = self._name_parts(text[d.start:d.end])
        subjects = sorted({k.subject for k in entries})
        in_context = [s for s in context if s in subjects]
        if in_context:
            return in_context
        if any(k.strong for k in entries):
            return sorted({k.subject for k in entries if k.strong})
        if d.category == "PERSON" and len(subjects) == 1 and (
                titled(text, d.start) or all(k.role == "first_name" for k in entries)):
            return subjects  # 'Ms. Lopez' or 'Handled by Alexis', and only one Lopez or Alexis anywhere
        return []

    def _name_parts(self, span: str) -> list[Known]:
        """'Maria L. Lopez' or "Maria Lopez's" from a model: first and last token of one subject."""
        tokens = _name_tokens(span)
        if len(tokens) < 2:
            return []
        firsts = {k.subject for k in self.known.lookup(tokens[0]) if k.role == "first_name"}
        lasts = {k.subject for k in self.known.lookup(tokens[-1]) if k.role == "last_name"}
        return [Known(s, "name", True) for s in sorted(firsts & lasts)]

    @staticmethod
    def cluster(links: list[list[Link]]) -> None:
        """Give every unlinked name a run-wide cluster key, in place. `links` is one list per text.

        Full names cluster on their first and last token. A lone token joins a full name from the
        same text that contains it, else the one full name in the run that does, else its own cluster.
        """
        by_token: dict[str, set[str]] = defaultdict(set)
        for text_links in links:
            for link in text_links:
                if link.how == "name" and len(link.name) >= 2:
                    link.subject = "name:" + " ".join((link.name[0], link.name[-1]))
                    by_token[link.name[0]].add(link.subject)
                    by_token[link.name[-1]].add(link.subject)
        for text_links in links:
            local: dict[str, set[str]] = defaultdict(set)
            for link in text_links:
                if link.subject and link.how == "name":
                    for tok in (link.name[0], link.name[-1]):
                        local[tok].add(link.subject)
            for link in text_links:
                if link.how != "name" or link.subject or not link.name:
                    continue
                tok = link.name[0]
                candidates = local.get(tok) or by_token.get(tok, set())
                link.subject = min(candidates) if len(candidates) == 1 else f"name:{tok}"


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

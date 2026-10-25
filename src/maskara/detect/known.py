"""Known values: personal data already sitting in the user's tables, found again in free text.

If the customers table says C042 is Maria Lopez <mlopez@gmail.com>, then 'Maria Lopez', 'Ms. Lopez',
'M. Lopez', 'Lopez, Maria', "Maria's" and that address in a ticket are hers, with no model at all.
This gives linked data strong recall and exact attribution at once.

Values are either strong or weak:
  strong  full names, emails, ids, street lines, card numbers: specific enough to match anywhere
  weak    a first or last name alone, a ZIP, a city, a card's last four: matched only for subjects
          already in context, meaning the subject of the text's own row or one with a strong match
          in the same text

Weak name matches also need a capital letter and are skipped when a capitalized word is attached
('Maria Garcia' is someone else; 'Austin Travel Mug' is a product), leaving those to other detectors.

A known first name also matches outside that context when it reads as a name (`base.proper_noun`):
capitalized mid-sentence ('Handled by Alexis.') or alone on its line, as a signature ('-Alexis').
At a sentence start a capital says nothing, so 'Hope you are well' stays, even with a customer named
Hope. Month and weekday names never match this way ('back in May').

The index holds originals in memory for the duration of a run only; nothing here is written out.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from ..bench.types import Category
from ..vault import normalize
from .base import Detection, proper_noun
from .rules import CALENDAR

TOKEN = re.compile(r"[^\W_]+")
NAMEISH = re.compile(r"[A-Z][a-z]+")
LONE_NAME_SCORE = 0.7  # a known first name with nobody in context: below rule shapes, above rule name cues

# Column role -> (category, detection label).
ROLE_CATEGORY: dict[str, tuple[Category, str]] = {
    "name": ("PERSON", "full_name"), "first_name": ("PERSON", "first_name"), "last_name": ("PERSON", "last_name"),
    "email": ("CONTACT", "email"), "phone": ("CONTACT", "phone"), "address": ("ADDRESS", "street_address"),
    "zip": ("ADDRESS", "zip"), "city": ("LOCATION", "city"), "id": ("ID", "id"),
    "financial": ("FINANCIAL", "account_number"),
}


@dataclass(frozen=True)
class Known:
    subject: str
    role: str
    strong: bool


class KnownValues:
    """Normalized value -> the subjects it belongs to, built from table rows that have a subject."""

    def __init__(self):
        self.values: dict[str, list[Known]] = defaultdict(list)
        self.phones: dict[str, set[str]] = defaultdict(set)   # last ten digits -> subjects
        self.first: dict[str, set[str]] = defaultdict(set)    # subject -> its first names (normalized)
        self.last: dict[str, set[str]] = defaultdict(set)
        self.cities: dict[str, set[str]] = defaultdict(set)
        self.max_tokens = 1

    def add(self, subject: str, role: str, value: object) -> None:
        text = str(value).strip() if value is not None else ""
        if not text:
            return
        if role == "name":
            if "," in text:  # 'Lopez, Maria'
                last, given = text.split(",", 1)
                tokens = given.split() + last.split()
            else:
                tokens = text.split()
            if len(tokens) < 2:
                for tok in tokens:
                    self._put(tok, subject, "first_name", False)
                return
            first, last = tokens[0], tokens[-1]
            for form in {" ".join(tokens), f"{first} {last}", f"{last}, {first}", f"{first[0]}. {last}",
                         f"{first[0]} {last}"}:
                self._put(form, subject, "name", True)
            self.add(subject, "first_name", first)
            self.add(subject, "last_name", last)
        elif role in ("first_name", "last_name"):
            for tok in text.split():
                self._put(tok, subject, role, False)
                (self.first if role == "first_name" else self.last)[subject].add(normalize(tok))
        elif role == "email":
            self._put(text, subject, role, "@" in text)
        elif role == "phone":
            digits = re.sub(r"\D", "", text)
            if len(digits) >= 7:
                self.phones[digits[-10:]].add(subject)
        elif role == "address":
            street = re.split(r",|\n", text)[0].strip()
            for form in {text, street}:
                self._put(form, subject, role, len(form.split()) >= 2 and bool(re.search(r"\d", form)))
        elif role in ("id", "financial"):
            digits = sum(c.isdigit() for c in text)
            if digits and (len(text) >= 5 or (len(text) >= 4 and digits < len(text))):
                self._put(text, subject, role, True)
            elif role == "financial" and len(text) == 4 and text.isdigit():
                self._put(text, subject, role, False)  # card last four
        elif role == "zip":
            self._put(text[:5], subject, role, False)
        elif role == "city":
            self._put(text, subject, role, False)
            self.cities[normalize(text)].add(subject)

    def _put(self, form: str, subject: str, role: str, strong: bool) -> None:
        key = normalize(form)
        entry = Known(subject, role, strong)
        if key and entry not in self.values[key]:
            self.values[key].append(entry)
            self.max_tokens = max(self.max_tokens, len(TOKEN.findall(key)))

    def lookup(self, text: str) -> list[Known]:
        return self.values.get(normalize(text), [])

    def phone(self, text: str) -> set[str]:
        digits = re.sub(r"\D", "", text)
        return self.phones.get(digits[-10:], set()) if len(digits) >= 7 else set()


class KnownValueDetector:
    """Finds known values in text. `context` is the set of subjects weak values may match for."""

    name = "known"

    def __init__(self, known: KnownValues):
        self.known = known

    def detect(self, text: str, context: Iterable[str] = ()) -> list[Detection]:
        tokens = list(TOKEN.finditer(text))
        strong = self._scan(text, tokens, None)
        subjects = set(context) | {k.subject for _, _, entries in strong for k in entries if k.strong}
        out = []
        for start, end, entries in self._scan(text, tokens, subjects):
            best = next((k for k in entries if k.subject in subjects), entries[0])
            category, label = ROLE_CATEGORY[best.role]
            if best.role == "financial" and not best.strong:
                label = "card_last4"
            score = 1.0 if best.strong else 0.8 if best.subject in subjects else LONE_NAME_SCORE
            out.append(Detection(start, end, category, label, score, "known"))
        return out

    def _scan(self, text: str, tokens: list[re.Match], context: set[str] | None):
        """Leftmost-longest matches over token runs. `context` None means strong values only."""
        i, found = 0, []
        while i < len(tokens):
            for n in range(min(self.known.max_tokens, len(tokens) - i), 0, -1):
                start, end = tokens[i].start(), tokens[i + n - 1].end()
                entries = [k for k in self.known.values.get(normalize(text[start:end]), ())
                           if k.strong or (context is not None and k.subject in context)]
                if not entries and context is not None and n == 1:
                    entries = self._lone_first_name(text, start, end)
                if entries and all(not k.strong for k in entries) and not self._weak_ok(text, start, end, entries):
                    entries = []
                if entries:
                    found.append((start, end, entries))
                    i += n
                    break
            else:
                i += 1
        return found

    def _lone_first_name(self, text: str, start: int, end: int) -> list[Known]:
        """Known first names of subjects not in context, where the word reads as a name on its own."""
        entries = [k for k in self.known.values.get(normalize(text[start:end]), ()) if k.role == "first_name"]
        return entries if entries and text[start:end] not in CALENDAR and proper_noun(text, start, end) else []

    def _weak_ok(self, text: str, start: int, end: int, entries: list[Known]) -> bool:
        if not any(k.role in ("first_name", "last_name", "city") for k in entries):
            return True
        if not text[start].isupper():
            return False
        # A capitalized word right before or after means a longer name or title this value is part of.
        after = NAMEISH.match(text, end + 1) if text[end:end + 1] == " " else None
        before = re.search(r"([A-Z][a-z]+) $", text[max(0, start - 30):start])
        return after is None and (before is None or before.group(1) in ("Hi", "Hello", "Hey", "Dear", "Thanks"))

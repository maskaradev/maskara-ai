"""What every detector returns, and how overlapping results from several detectors are reconciled.

Offsets are Python string indices (code points), end-exclusive, the same unit as `bench.types.Span`.
A detection says only *what* a span is. *Who* it refers to is decided later by `maskara.resolve`, so
swapping a detector never turns one person into another.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from typing import Protocol, runtime_checkable

from ..bench.types import Category


@dataclass(frozen=True)
class Detection:
    start: int
    end: int
    category: Category
    label: str      # the detector's own finer label: 'email', 'first_name', 'birth_date', 'private_person'
    score: float    # 0..1; exact known values are 1.0
    detector: str   # 'known', 'rules', or a model name


@runtime_checkable
class Detector(Protocol):
    """Anything with a `name` and `detect(text)` that returns detections on code-point offsets."""

    name: str

    def detect(self, text: str) -> list[Detection]: ...


# Ties on score and length go to the detector that is more often exactly right about boundaries.
RANK = {"known": 0, "rules": 1}


def merge(found: list[Detection]) -> list[Detection]:
    """Non-overlapping detections, chosen greedily: highest score, then longest, then detector rank.

    Deterministic for a given input set regardless of order: the last tie-breakers are the offsets.
    """
    kept: list[Detection] = []
    for d in sorted(found, key=lambda d: (-d.score, -(d.end - d.start), RANK.get(d.detector, 2), d.start,
                                          d.category, d.label)):
        if d.end > d.start and all(d.end <= k.start or d.start >= k.end for k in kept):
            kept.append(d)
    return sorted(kept, key=lambda d: d.start)


# Values worth finding again wherever they repeat in the same text: they identify on their own. Dates,
# ages and places are left to their own rules, since the same number or word means other things too.
REPEAT_CATEGORIES = ("PERSON", "CONTACT", "ID", "FINANCIAL", "CREDENTIAL", "NETWORK")
MIN_REPEAT = 4  # shortest repeated value other than a name word: a card's last four
OPENERS = " \t\"'(*•-–—"  # what may sit between a sentence or line start and its first word
LINE_END = re.compile(r"[,.!?]?[ \t]*(?:\n|$)")
# Capitalized words that come before a surname without being a given name ('Thanks Saleh', 'Mr Saleh').
NOT_GIVEN = {"The", "A", "An", "This", "That", "These", "Those", "My", "Our", "Your", "His", "Her", "Their", "Its",
             "And", "But", "Or", "Nor", "If", "When", "Then", "As", "At", "In", "On", "For", "With", "From", "To",
             "By", "Of", "Per", "Via", "Re", "Fwd", "Fw", "Cc", "Customer", "Client", "Patient", "Caller", "Agent",
             "Rep", "Member", "User", "Applicant", "Mr", "Mrs", "Ms", "Miss", "Mx", "Dr", "Prof", "Sir", "Madam",
             "Rev", "Saint", "St", "Team", "Case", "Ticket", "Order", "Account"}
NEXT_NAME = re.compile(r" ([A-Z][a-z]+(?:[-'’][A-Z][a-z]+)?)\b")


def proper_noun(text: str, start: int, end: int) -> bool:
    """Whether the word at `start:end` is capitalized because it is a name.

    Mid-sentence, a capital letter says so ('Handled by Alexis.'). At the start of a sentence or line it
    says nothing ('Hope you are well'), so there the word must stand alone on its line, as a signature
    does ('Thanks,\\nAlexis', '... Closed. -Alexis').
    """
    if not text[start:start + 1].isupper():
        return False
    i = start
    while i > 0 and text[i - 1] in OPENERS:
        i -= 1
    return not (i == 0 or text[i - 1] in ".!?\n") or bool(LINE_END.match(text, end))


def repeats(text: str, found: list[Detection]) -> list[Detection]:
    """Every other occurrence of a detected value in the same text, as the same detection.

    Once a text names a value, the same string elsewhere in it is the same value ('card ending in
    3780' ... 'Caller: 3780'), so it gets the same replacement. Matches are exact and whole-token. A
    lone name word repeats where it reads as a name (`proper_noun`), and takes in up to two capitalized
    words right before it that are not greetings or function words (`NOT_GIVEN`), or the capitalized
    word after it ('Mr. Bouchard' ... 'Norman Bouchard', 'Hi Joseph' ... 'Joseph Banter'), so no part
    of a full name is left behind. Before a street word or two capitalized words that do not end in a
    surname it is a place or a product ('Austin Street', 'Austin Travel Mug'), not a repeat. Pass the result through `merge` with
    `found`, which settles overlaps with other detections.
    """
    from . import rules  # rules builds on this module

    taken = {(d.start, d.end) for d in found}
    first = {}
    for d in found:
        if d.category in REPEAT_CATEGORIES:
            first.setdefault(text[d.start:d.end], d)
    out = []
    for value, d in first.items():
        word = d.category == "PERSON" and re.fullmatch(r"[^\W\d_]{2,}", value) is not None
        if value != value.strip() or not (word or len(value) >= MIN_REPEAT):
            continue
        for m in re.finditer(rf"(?<!\w)(?<!\d[-./]){re.escape(value)}(?!\w)(?![-./]\d)", text):
            start, end = m.span()
            for _ in range(2 if word else 0):  # 'John Harding Price', 'Veenaben Saleh': the given names
                before = re.search(r"\b([A-Z][a-z]+) $", text[max(0, start - 30):start])
                if not before or before.group(1) in NOT_GIVEN or before.group(1) in rules.NOT_GIVEN:
                    break
                start -= len(before.group(0))
            if word and (after := NEXT_NAME.match(text, end)):
                third = NEXT_NAME.match(text, after.end())
                if after.group(1) in rules.NOT_GIVEN or (third and not rules._last(third.group(1))):
                    continue  # a place or a product: 'Austin Street', 'the Austin Travel Mug'
                if start == m.start():
                    end = (third or after).end()  # 'Joseph Banter', 'Mary Ann Smith'
            whole = (start, end) != m.span()  # a full name now: its capitals say enough
            if (start, end) not in taken and (not word or whole or proper_noun(text, start, end)):
                out.append(replace(d, start=start, end=end, label="person" if whole else d.label))
    return out

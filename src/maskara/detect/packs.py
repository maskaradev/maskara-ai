"""User patterns: identifier formats of one domain, kept out of the core rules and added on request.

    maskara.mask(texts=..., patterns="legal-echr")                       # a bundled pack
    maskara.mask(texts=..., patterns=[{"regex": r"\\bEMP-\\d{5}\\b", "label": "employee_id"}])

The core rules cover formats that mean the same thing everywhere (emails, phones, card numbers). A
format like '12345/67' is a case number before the European Court of Human Rights and a date or a
fraction elsewhere, so it is a pattern a user turns on, not a default. In a TOML config:

    patterns = ["legal-echr", { regex = '\\bEMP-\\d{5}\\b', label = "employee_id" }]

or `maskara mask --pattern legal-echr`. A pattern's `group` picks the capture group holding the value
when the regex also matches a cue ('application no. 12345/67'); 0 takes the whole match.
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import get_args

from ..bench.types import Category
from .base import Detection

CATEGORIES = get_args(Category)


@dataclass(frozen=True)
class Pattern:
    regex: re.Pattern
    category: Category = "ID"
    label: str = "custom"
    score: float = 0.86  # the score of the core cue rules: above names and bare numbers, below exact shapes
    group: int = 0

    def detect(self, text: str) -> Iterator[Detection]:
        for m in self.regex.finditer(text):
            if m.end(self.group) > m.start(self.group):
                yield Detection(m.start(self.group), m.end(self.group), self.category, self.label, self.score, "rules")


def pattern(regex: str | re.Pattern, category: Category = "ID", label: str = "custom", score: float = 0.86,
            group: int = 0) -> Pattern:
    """A checked `Pattern`: a known category, a score in 0..1 and a group the regex has."""
    compiled = re.compile(regex) if isinstance(regex, str) else regex
    if category not in CATEGORIES:
        raise ValueError(f"unknown category {category!r} for pattern {compiled.pattern!r}; expected one of {CATEGORIES}")
    if not 0 < score <= 1:
        raise ValueError(f"pattern score must be in (0, 1], got {score}")
    if not 0 <= group <= compiled.groups:
        raise ValueError(f"pattern {compiled.pattern!r} has no group {group}")
    return Pattern(compiled, category, label, score, group)


PACKS: dict[str, tuple[Pattern, ...]] = {
    # ECHR application numbers ('application no. 12345/67'), behind a cue: alone they read as dates.
    "legal-echr": (
        pattern(r"(?i:\b(?:applications?|application no|case no|file no|docket))\b"
                r"(?i:[\s:*|=#(.]+|\b(?:is|was|are|number|no|nos|code)\b){1,8}(\d{3,6}/\d{2,4})(?![\w@])",
                "ID", "case_number", group=1),
    ),
}


def patterns_for(spec) -> list[Pattern]:
    """Patterns from a pack name, a `Pattern`, a mapping of `pattern()` arguments, or a list of these."""
    if spec is None:
        return []
    if isinstance(spec, Pattern):
        return [spec]
    if isinstance(spec, str):
        if spec not in PACKS:
            raise ValueError(f"unknown pattern pack {spec!r}; packs: {', '.join(sorted(PACKS))}")
        return list(PACKS[spec])
    if isinstance(spec, Mapping):
        unknown = set(spec) - {"regex", "category", "label", "score", "group"}
        if unknown or "regex" not in spec:
            raise ValueError(f"a pattern needs 'regex' and may have category, label, score, group; got {sorted(spec)}")
        return [pattern(**spec)]
    return [p for item in spec for p in patterns_for(item)]

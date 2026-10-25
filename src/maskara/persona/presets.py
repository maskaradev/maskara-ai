"""Attribute-preservation presets (v0-design §3.1): how closely a persona matches its original.

Matching more attributes keeps more utility but turns the persona itself into a quasi-identifier
(ZIP + birth date + sex identifies most Americans), so this is a dial the user picks.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Preset:
    name: str
    age_band: int  # resample age within this many years (aligned bands); 0 keeps the exact age
    region: Literal["region", "state", "state+size"]  # Census region / state / state and city size tier
    education: bool    # condition on the broad education level
    occupation: bool   # condition on the exact occupation
    cohort_names: bool  # first names follow sex x birth decade; otherwise sex only
    max_shift_days: int  # per-subject date shift is drawn from [-max, -1] or [1, max]


PRESETS = {
    "strict": Preset("strict", 10, "region", False, False, False, 180),
    "balanced": Preset("balanced", 5, "state", True, False, True, 30),
    "max_utility": Preset("max_utility", 0, "state+size", True, True, True, 30),
}

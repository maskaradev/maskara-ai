"""Bundled persona assets, loaded lazily from package data (no downloads at runtime).

Built by `maskara.data.build` from Nemotron-Personas-USA (NVIDIA, CC BY 4.0) and SSA baby names
(US government, public domain). Attribution is in the NOTICE file next to this module.

Nemotron writes surnames the way the Census surname list stores them, upper-cased and stripped of
inner capitals, apostrophes and hyphens, then title-cased: 'Mccormick', 'Oconnor', 'Lopezsantiago'.
The source has no better form to rebuild from (it writes 'Mccormick' 36 times per 'McCormick' 0), so
`surname_case` restores the usual spelling when surnames are loaded, deterministically:

    Mc + name          'Mccormick' -> 'McCormick'
    Mac + a known name 'Macdonald' -> 'MacDonald'   ('Machado', 'Mackey' stay: 'hado', 'key' are not)
    O + an Irish root  'Oconnor' -> "O'Connor"      (a fixed list: 'Ocampo', 'Olson' stay)
    two surnames       'Lopezsantiago' -> 'Lopez-Santiago', when both halves are surnames at least
                       COMPOUND_RATIO times as common as the whole and end like Spanish surnames do
                       (a vowel, s, z or n; the second not in e), so 'Woodward', 'Beckmann' and
                       'Greenhouse' stay whole
"""

from __future__ import annotations

import csv
import gzip
import io
from collections import Counter
from dataclasses import dataclass
from functools import cache
from importlib import resources

SOURCES = {
    "personas": {
        "name": "Nemotron-Personas-USA v1.1",
        "url": "https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA",
        "revision": "5b4cd35ab46490c1da1bd2b5a2324d6f871be180",
        "license": "CC BY 4.0",
    },
    "first_names": {
        "name": "SSA baby names, national, 1910-2025",
        "url": "https://www.ssa.gov/oact/babynames/limits.html",
        "mirror": "https://huggingface.co/datasets/nkrishnaswami/us-ssa-baby-names-national",
        "revision": "b10af862de8b3bb8d315b2e11d1a334813b3ed8d",
        "license": "public domain (US government work); mirror is CC0 1.0",
    },
}


COMPOUND_RATIO = 20
IRISH_O = {"Banion", "Bannon", "Boyle", "Brian", "Brien", "Bryan", "Bryant", "Byrne", "Callaghan", "Carroll",
           "Connell", "Conner", "Connor", "Dea", "Donnell", "Donoghue", "Donohue", "Donovan", "Dowd",
           "Driscoll", "Farrell", "Flaherty", "Gara", "Gorman", "Grady", "Halloran", "Hara", "Hare", "Hearn",
           "Hern", "Keefe", "Keeffe", "Kelley", "Kelly", "Laughlin", "Leary", "Loughlin", "Malley", "Mara",
           "Meara", "Neal", "Neil", "Neill", "Quinn", "Reilly", "Riordan", "Rourke", "Shaughnessy", "Shea",
           "Sullivan", "Toole"}


@dataclass(frozen=True)
class Row:
    """One synthetic person from Nemotron-Personas-USA (no name: names are drawn separately)."""

    sex: str         # 'F' or 'M'
    age: int
    state: str       # USPS code, including DC, PR
    zip: str
    city: str
    size: str        # city size tier by population share: 'L', 'M', 'S'
    education: str   # less_than_9th, 9th_12th_no_diploma, high_school, some_college, associates, ...
    occupation: str  # snake_case, e.g. 'registered_nurse'


@dataclass(frozen=True)
class Names:
    first: dict[tuple[str, int], tuple[list[str], list[int]]]  # (sex, decade) -> names, cumulative counts
    last: tuple[list[str], list[int]]                          # surnames, cumulative counts
    first_freq: dict[str, float]  # name -> share of all first-name records (for telling first from last)
    last_freq: dict[str, float]
    first_sex: dict[str, str]     # first name -> the sex it is more often given to


def _read(name: str) -> list[dict]:
    raw = resources.files(__name__).joinpath(name).read_bytes()
    return list(csv.DictReader(io.StringIO(gzip.decompress(raw).decode())))


@cache
def personas() -> tuple[Row, ...]:
    return tuple(Row(r["sex"], int(r["age"]), r["state"], r["zip"], r["city"], r["size"], r["education"],
                     r["occupation"]) for r in _read("personas.csv.gz"))


@cache
def names() -> Names:
    first: dict[tuple[str, int], tuple[list[str], list[int]]] = {}
    last: tuple[list[str], list[int]] = ([], [])
    counts: dict[str, Counter] = {"first": Counter(), "last": Counter()}
    by_sex: dict[str, Counter] = {"F": Counter(), "M": Counter()}
    for r in _read("names.csv.gz"):
        name, n = r["name"], int(r["count"])
        if r["kind"] == "first":
            names_, cum = first.setdefault((r["sex"], int(r["decade"])), ([], []))
            by_sex[r["sex"]][name] += n
            names_.append(name)
            cum.append((cum[-1] if cum else 0) + n)
        counts[r["kind"]][name] += n
    for name, n in counts["last"].items():  # file order, so draws stay as before the casing fix
        last[0].append(surname_case(name, counts["last"], counts["first"]))
        last[1].append((last[1][-1] if last[1] else 0) + n)
    freq = {}
    for kind, c in counts.items():
        total = c.total()
        freq[kind] = {name: n / total for name, n in c.items()}
    # Surnames are looked up in both spellings: 'McCormick' as written in text, 'Mccormick' as stored.
    freq["last"].update({fixed: freq["last"][name] for name, fixed in zip(counts["last"], last[0])})
    first_sex = {name: "F" if by_sex["F"][name] >= by_sex["M"][name] else "M" for name in counts["first"]}
    return Names(first, last, freq["first"], freq["last"], first_sex)


def surname_case(name: str, last: Counter, first: Counter) -> str:
    """The usual spelling of a Census-style surname (see the module docstring); `last` and `first` are
    name counts, used to tell 'Macdonald' from 'Machado' and 'Lopezsantiago' from 'Woodward'."""
    if name.startswith("Mc") and len(name) > 3:
        return "Mc" + name[2:].capitalize()
    if name.startswith("Mac") and len(name) >= 7 and (rest := name[3:].capitalize()) in last.keys() | first.keys():
        return "Mac" + rest
    if name.startswith("O") and name[1:].capitalize() in IRISH_O:
        return "O'" + name[1:].capitalize()
    n = last[name]
    for i in range(4, len(name) - 3):
        a, b = name[:i], name[i:].capitalize()
        if a[-1] in "aeiouszn" and b[-1] in "aiouszn" and min(last[a], last[b]) >= COMPOUND_RATIO * n:
            return f"{a}-{b}"
    return name

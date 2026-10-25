"""People for maskara-linked, taken from NVIDIA Nemotron-Personas-USA (CC BY 4.0).

Only name, sex, age and home location are used. The dataset has no name column: every persona text
opens with the person's full name, so the name is the run of capitalized words that the `persona`,
`professional_persona` and `sports_persona` texts all start with. Only two-word names are kept, so
first and last name are unambiguous.

The dataset also has children (about a fifth of the rows at this revision); they are skipped,
because the generated world is customers of an online store.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

REVISION = "5b4cd35ab46490c1da1bd2b5a2324d6f871be180"
SHARD = "train-00000-of-00011.parquet"
SHA256 = "af5d3e1c0ca2ca9cd12b5bcfc6ca5a850cdc6b7d6c24eb89ce948b23bed9c7e7"
URL = f"https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA/resolve/{REVISION}/data/{SHARD}"

NAME_TEXTS = ("persona", "professional_persona", "sports_persona")
NAME_WORD = re.compile(r"[^\W\d_]+(?:['’-][^\W\d_]+)*")


@dataclass(frozen=True)
class Person:
    uuid: str
    first: str
    last: str
    sex: str        # "Female" or "Male", as in the dataset
    age: int
    city: str
    state: str      # two-letter code
    zipcode: str


def extract_name(texts: list[str]) -> tuple[str, str] | None:
    """(first, last) when every text opens with the same two-word name, else None."""
    words: list[str] = []
    for column in zip(*(t.split() for t in texts)):
        clean = {w.rstrip(",") for w in column}
        if len(clean) != 1:
            break
        word = clean.pop()
        if not (word[:1].isupper() and NAME_WORD.fullmatch(word)):
            break
        words.append(word)
        if any(w.endswith(",") for w in column):
            break
    return (words[0], words[1]) if len(words) == 2 else None


def load(n: int) -> list[Person]:
    """The first `n` adults with a clean name and a surname not yet taken, in a fixed hash order."""
    import pyarrow.parquet as pq  # optional dependency: maskara[bench]

    from ..corpora._fetch import fetch  # imported here: the corpora package imports this one

    table = pq.read_table(fetch(URL, f"nemotron-personas-usa/{SHARD}", SHA256),
                          columns=["uuid", *NAME_TEXTS, "sex", "age", "city", "state", "zipcode"])
    uuids = table["uuid"].to_pylist()
    order = sorted(range(len(uuids)), key=lambda i: hashlib.sha1(uuids[i].encode()).hexdigest())
    people: list[Person] = []
    surnames: set[str] = set()
    for i in order:
        row = table.slice(i, 1).to_pylist()[0]
        if row["age"] < 18:
            continue
        name = extract_name([row[c] for c in NAME_TEXTS])
        # Distinct surnames keep "Ms. Lopez" pointing at one person across the corpus.
        if name is None or name[1].lower() in surnames:
            continue
        surnames.add(name[1].lower())
        people.append(Person(row["uuid"], name[0], name[1], row["sex"], row["age"], row["city"],
                             row["state"], row["zipcode"]))
        if len(people) == n:
            break
    return people

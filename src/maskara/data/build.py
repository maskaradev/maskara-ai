"""Rebuilds the bundled persona assets: `uv run --extra bench python -m maskara.data.build`.

Downloads pinned source files (about 2.7 GB, cached under ~/.cache/maskara/data), checks their
sha256, and writes two small gzip CSVs next to this file:

    personas.csv.gz  a hash-ordered sample of Nemotron-Personas-USA rows: sex, age, state, zip, city,
                     city size, education, occupation. The joint distribution the sampler draws from.
    names.csv.gz     first names by sex and birth decade (SSA baby names) and surnames (extracted
                     from the Nemotron persona text, which has no name columns). The text spells
                     surnames Census-style ('Mccormick', 'Lopezsantiago'); they are kept as written
                     and re-cased at load time by `maskara.data.surname_case`.

Nemotron's own first names barely track birth year (its top names for women born in the 1990s
include Linda and Patricia), so first names come from SSA birth records instead. ssa.gov refuses
scripted downloads, so the SSA file is a pinned CC0 mirror on the Hugging Face Hub.

Needs pyarrow. The runtime never imports this module.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import os
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

NEMOTRON_REVISION = "5b4cd35ab46490c1da1bd2b5a2324d6f871be180"
NEMOTRON_URL = f"https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA/resolve/{NEMOTRON_REVISION}/data/"
NEMOTRON_SHARDS = {  # file -> sha256, from the Hub's LFS pointers at the revision
    "train-00000-of-00011.parquet": "af5d3e1c0ca2ca9cd12b5bcfc6ca5a850cdc6b7d6c24eb89ce948b23bed9c7e7",
    "train-00001-of-00011.parquet": "bce1f98e9aaff5f115dee7f12fa115599381ccb1b4d7594c6d72ce627a617010",
    "train-00002-of-00011.parquet": "dabeb21e9de465ef26f5852b0e2d4a9fbbc5d513b4699db601cd632aa2705a9c",
    "train-00003-of-00011.parquet": "06fcc5536b191777cadd056bcac93058c7d976195cc16353fa51a9548035c782",
    "train-00004-of-00011.parquet": "a0db243958664adfbe824a79616aa804ed247ecaaca00a3a94d8b77f1b573dc9",
    "train-00005-of-00011.parquet": "d9676be60167f8ef94fcbaad35613e8057fb92c15bdf3d99847372c793c9064c",
    "train-00006-of-00011.parquet": "ac86eedbffce275c92b80f1e7bb2128116e8621c15d4252b0f408ca457bce946",
    "train-00007-of-00011.parquet": "85c07ea71ef44eb288dd2714593cb6b4b7592dcea88907fdcc7d395d8941397b",
    "train-00008-of-00011.parquet": "04905f56ef5cf35be55d9a0a4a5e577fb9d8908168933ee0e5b414ae8d27f83b",
    "train-00009-of-00011.parquet": "e2c01cd32073abd6e231ac17ef8530513f22b6473803acbd5fa2c917f6ee844d",
    "train-00010-of-00011.parquet": "2026d1f82d3c1534a2aaf98b0d7c2a9cff2f8f9b161ff55ff51cf929a37bc0d2",
}
SSA_REVISION = "b10af862de8b3bb8d315b2e11d1a334813b3ed8d"
SSA_URL = (f"https://huggingface.co/datasets/nkrishnaswami/us-ssa-baby-names-national/resolve/{SSA_REVISION}"
           "/names_ranks_counts.parquet")
SSA_SHA256 = "8fce8b3f26d836ac93f82e171bc3cd340d3d7590b9d72ae912a944fc61d05f52"

ROWS = 150_000         # persona rows kept; enough for every state x sex x age band
FIRST_PER_CELL = 500   # most common first names kept per (sex, birth decade)
MIN_LAST = 3           # a surname must appear this often among the 1M personas
FIRST_DECADE = 1910    # SSA coverage before ~1937 is thin; older cohorts share the 1910s names
REFERENCE_YEAR = 2025  # the dataset's ages are as of its release year
NAME_TOKEN = re.compile(r"^[A-Z][a-z]+(?:['-][A-Z]?[a-z]+)*$")


def cache_dir() -> Path:
    return Path(os.environ.get("MASKARA_CACHE", Path.home() / ".cache" / "maskara")) / "data"


def fetch(url: str, name: str, sha256: str) -> Path:
    path = cache_dir() / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}", file=sys.stderr)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    if h.hexdigest() != sha256:
        raise RuntimeError(f"{path} has sha256 {h.hexdigest()}, expected {sha256}; delete it to download again")
    return path


def leading_name(text: str) -> list[str]:
    """Capitalized words at the start of a persona text, up to the first comma: 'Mary Alberti, a ...'."""
    out = []
    for tok in text.split():
        stop = tok.endswith(",")
        tok = tok.rstrip(",")
        if not tok[:1].isupper():
            break
        out.append(tok)
        if stop:
            break
    return out


def extract_name(persona: str, professional: str) -> tuple[str, str] | None:
    """(first, last) when both persona texts open with the same two-word name, else None.

    Texts that open differently ('Energetic yet pragmatic, Ana ...', 'Dr. Ling Wan') are skipped;
    requiring agreement between the two texts keeps the extraction precise (~92% of rows pass).
    """
    a = leading_name(persona)
    if len(a) != 2 or a != leading_name(professional) or not all(NAME_TOKEN.match(t) for t in a):
        return None
    return a[0], a[1]


def personas_and_surnames() -> tuple[str, str]:
    import pyarrow.parquet as pq  # optional dependency: maskara[bench]

    columns = ["uuid", "persona", "professional_persona", "sex", "age", "education_level", "occupation",
               "city", "state", "zipcode"]
    rows, lasts, cities = [], Counter(), Counter()
    for name, sha in NEMOTRON_SHARDS.items():
        path = fetch(NEMOTRON_URL + name, f"nemotron-personas-usa/{name}", sha)
        for r in pq.read_table(path, columns=columns).to_pylist():
            cities[(r["state"], r["city"])] += 1
            if got := extract_name(r["persona"], r["professional_persona"]):
                lasts[got[1]] += 1
            # ZIPs are stored without leading zeros ('601' is 00601).
            rows.append((hashlib.sha1(r["uuid"].encode()).hexdigest(), r["sex"][0], r["age"], r["state"],
                         r["zipcode"].zfill(5), r["city"], r["education_level"], r["occupation"]))
        print(f"{name}: {len(rows)} rows", file=sys.stderr)

    # City size tiers by population share: the largest cities holding the first third of people are
    # 'L', the next third 'M', the rest 'S'. Record counts track population since the data is
    # census-grounded.
    size, total, seen = {}, sum(cities.values()), 0
    for city, n in cities.most_common():
        size[city] = "L" if seen < total / 3 else "M" if seen < 2 * total / 3 else "S"
        seen += n

    rows.sort()  # by hashed uuid: a fixed pseudo-random sample
    rows = sorted(rows[:ROWS], key=lambda r: (r[3], r[4], r[1], r[2]))  # grouped rows gzip better
    personas = _csv(["sex", "age", "state", "zip", "city", "size", "education", "occupation"],
                    ([sex, age, st, z, city, size[(st, city)], edu, occ]
                     for _, sex, age, st, z, city, edu, occ in rows))
    surnames = [["last", "", "", last, n] for last, n in sorted(lasts.items()) if n >= MIN_LAST]
    return personas, surnames


def first_names() -> list[list]:
    import pyarrow.parquet as pq

    table = pq.read_table(fetch(SSA_URL, "ssa-baby-names/names_ranks_counts.parquet", SSA_SHA256),
                          columns=["name", "sex", "year", "count"])
    cells: dict[tuple[str, int], Counter] = defaultdict(Counter)
    for r in table.to_pylist():
        if r["year"] >= FIRST_DECADE:
            cells[(r["sex"], r["year"] // 10 * 10)][r["name"]] += r["count"]
    return [["first", sex, decade, name, n]
            for (sex, decade), names in sorted(cells.items())
            for name, n in sorted(names.most_common(FIRST_PER_CELL))]


def build(out: Path) -> None:
    personas, surnames = personas_and_surnames()
    _write(out / "personas.csv.gz", personas)
    _write(out / "names.csv.gz", _csv(["kind", "sex", "decade", "name", "count"], first_names() + surnames))


def _csv(header: list[str], rows) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


def _write(path: Path, text: str) -> None:
    # No file name and mtime=0 keep the gzip bytes identical across rebuilds.
    with open(path, "wb") as raw, gzip.GzipFile("", "wb", 9, raw, mtime=0) as f:
        f.write(text.encode())
    print(f"wrote {path} ({path.stat().st_size / 1e6:.2f} MB)", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=Path(__file__).parent)
    build(ap.parse_args().out)


if __name__ == "__main__":
    main()

"""Inputs and outputs of `mask()`: rows in, rows out, in the caller's own container type.

Tables: a list of dicts, a CSV or JSONL path, or a pandas DataFrame.
Texts:  a list of strings, a pandas Series, a .txt path (one text), or a JSONL path whose lines are
        strings or objects with a "text" field (other fields are treated as table columns).

pandas is never imported here: a DataFrame or Series is recognized by its type and rebuilt through
its own class, so the package keeps working without it.
"""

from __future__ import annotations

import csv
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

TEXT = "text"  # the column a text collection's strings live in


@dataclass
class Source:
    name: str
    kind: str          # 'table' | 'texts'
    form: str          # 'records' | 'strings' | 'csv' | 'jsonl' | 'txt' | 'dataframe' | 'series'
    rows: list[dict]
    original: object = field(repr=False, default=None)
    path: Path | None = None
    json_strings: bool = False  # JSONL texts given as bare strings rather than objects

    @property
    def columns(self) -> list[str]:
        seen: dict[str, None] = {}
        for row in self.rows:
            seen.update(dict.fromkeys(row))
        return list(seen)


def _pandas(obj: object, cls: str) -> bool:
    return type(obj).__module__.startswith("pandas") and type(obj).__name__ == cls


def _path(obj: object) -> Path | None:
    return Path(obj) if isinstance(obj, (str, os.PathLike)) else None


def _jsonl(path: Path) -> list:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_table(name: str, obj: object) -> Source:
    if _pandas(obj, "DataFrame"):
        return Source(name, "table", "dataframe", obj.to_dict("records"), obj)
    if (path := _path(obj)) is not None:
        if path.suffix.lower() == ".csv":
            with path.open(newline="", encoding="utf-8") as f:
                return Source(name, "table", "csv", list(csv.DictReader(f)), path=path)
        if path.suffix.lower() in (".jsonl", ".ndjson"):
            rows = _jsonl(path)
            if not all(isinstance(r, dict) for r in rows):
                raise ValueError(f"{path}: every line of a table must be a JSON object")
            return Source(name, "table", "jsonl", rows, path=path)
        raise ValueError(f"{path}: tables must be .csv or .jsonl")
    if isinstance(obj, list) and all(isinstance(r, dict) for r in obj):
        return Source(name, "table", "records", [dict(r) for r in obj], obj)
    raise TypeError(f"table {name!r}: expected a list of dicts, a .csv/.jsonl path or a DataFrame, "
                    f"got {type(obj).__name__}")


def load_texts(name: str, obj: object) -> Source:
    if _pandas(obj, "Series"):
        return Source(name, "texts", "series", [{TEXT: v} for v in obj.tolist()], obj)
    if (path := _path(obj)) is not None:
        if path.suffix.lower() == ".txt":
            return Source(name, "texts", "txt", [{TEXT: path.read_text(encoding="utf-8")}], path=path)
        if path.suffix.lower() in (".jsonl", ".ndjson"):
            lines = _jsonl(path)
            strings = all(isinstance(x, str) for x in lines)
            if not strings and not all(isinstance(x, dict) and TEXT in x for x in lines):
                raise ValueError(f'{path}: each line must be a string or an object with a "{TEXT}" field')
            rows = [{TEXT: x} if strings else x for x in lines]
            return Source(name, "texts", "jsonl", rows, path=path, json_strings=strings)
        raise ValueError(f"{path}: texts must be .txt or .jsonl")
    if isinstance(obj, list) and all(isinstance(x, str) for x in obj):
        return Source(name, "texts", "strings", [{TEXT: x} for x in obj], obj)
    raise TypeError(f"texts {name!r}: expected a list of strings, a .txt/.jsonl path or a Series, "
                    f"got {type(obj).__name__}")


def restore(src: Source, rows: list[dict]) -> object:
    """Masked rows in the input's container: DataFrame for DataFrame, list of str for list of str."""
    if src.form == "dataframe":
        return type(src.original)(rows, columns=src.original.columns, index=src.original.index)
    if src.form == "series":
        return type(src.original)([r[TEXT] for r in rows], index=src.original.index, name=src.original.name)
    if src.kind == "texts" and (src.form in ("strings", "txt") or src.json_strings):
        return [r[TEXT] for r in rows]
    return rows


def write(src: Source, masked: object, directory: Path) -> Path:
    """Write one masked input into `directory`, named and formatted like its input."""
    if src.path is not None:
        target = directory / src.path.name
    else:
        target = directory / f"{src.name}.{'csv' if src.form == 'dataframe' else 'jsonl'}"
    if target.suffix == ".csv":
        rows = masked.to_dict("records") if src.form == "dataframe" else masked
        with target.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=src.columns)
            w.writeheader()
            w.writerows(rows)
    elif target.suffix == ".txt":
        target.write_text(masked[0], encoding="utf-8")
    else:
        items = masked.tolist() if src.form == "series" else masked
        with target.open("w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False, default=str) + "\n")
    return target

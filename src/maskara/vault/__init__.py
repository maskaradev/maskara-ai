"""Secret key + local state that make persona assignment deterministic and stable across runs.

Threat model. Originals are never written: the vault stores only HMAC(key, ...) lookups and the
synthetic values assigned to them, so a leaked output or vault database reveals no original value.
Whoever holds the key file and the vault can still test guesses ("is subject 'jane@x.com' in here?"),
so keep the key 0600 and out of git. Seed mode derives the key from a public string and is for
reproducible demos and benchmarks only. Nothing here protects against an attacker inside the process.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import unicodedata
from collections.abc import Callable
from pathlib import Path

SCHEMA_VERSION = "1"
MAX_ATTEMPTS = 1000

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- One row per subject: HMAC of the subject key -> the persona assigned to it (synthetic fields only).
CREATE TABLE IF NOT EXISTS subjects (
    namespace TEXT NOT NULL, subject TEXT NOT NULL, name TEXT NOT NULL, persona TEXT NOT NULL,
    PRIMARY KEY (namespace, subject), UNIQUE (namespace, name)
);
-- Value-keyed replacements (ids, card numbers, orgs) that must stay distinct so joins survive.
CREATE TABLE IF NOT EXISTS vals (
    namespace TEXT NOT NULL, kind TEXT NOT NULL, lookup TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (namespace, kind, lookup), UNIQUE (namespace, kind, value)
);
"""


def normalize(text: str) -> str:
    """The form a key is hashed in: NFKC, case-folded, whitespace collapsed."""
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


class Stream:
    """Deterministic draws from HMAC-SHA256 in counter mode, independent of Python's `random`."""

    def __init__(self, seed: bytes):
        self._seed, self._n = seed, 0

    def _u64(self) -> int:
        self._n += 1
        return int.from_bytes(hmac.digest(self._seed, self._n.to_bytes(8, "big"), "sha256")[:8], "big")

    def below(self, n: int) -> int:
        return self._u64() % n  # bias < n / 2**64, irrelevant here

    def between(self, lo: int, hi: int) -> int:
        """Uniform integer in [lo, hi]."""
        return lo + self.below(hi - lo + 1)

    def pick(self, seq):
        return seq[self.below(len(seq))]

    def weighted(self, items: list, cum_weights: list[int]):
        """Pick from `items` with cumulative integer weights (last entry is the total)."""
        r, lo, hi = self.below(cum_weights[-1]), 0, len(cum_weights) - 1
        while lo < hi:  # first index whose cumulative weight exceeds r
            mid = (lo + hi) // 2
            if cum_weights[mid] > r:
                hi = mid
            else:
                lo = mid + 1
        return items[lo]


class Vault:
    """Holds the secret key and the SQLite file of assignments.

    `Vault(path)` opens (or creates) `path` and a key file next to it (`<path>.key`, mode 0600).
    `Vault.from_seed(seed)` and `Vault.ephemeral()` keep everything in memory.
    """

    def __init__(self, path: str | os.PathLike, key_path: str | os.PathLike | None = None):
        path = Path(path)
        self.path = path
        self.key_path = Path(key_path) if key_path else path.with_name(path.name + ".key")
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not path.exists():
            os.close(os.open(path, os.O_CREAT | os.O_WRONLY, 0o600))
        self._init(_load_or_create_key(self.key_path), str(path))

    @classmethod
    def from_seed(cls, seed: str) -> Vault:
        """Public, reproducible mode: anyone with the seed can recompute every persona."""
        return cls._memory(hashlib.sha256(b"maskara-public-seed\0" + seed.encode()).digest())

    @classmethod
    def ephemeral(cls) -> Vault:
        """Random key, nothing on disk: consistent within one process, different on the next run."""
        return cls._memory(secrets.token_bytes(32))

    @classmethod
    def _memory(cls, key: bytes) -> Vault:
        self = cls.__new__(cls)
        self.path = self.key_path = None
        self._init(key, ":memory:")
        return self

    def _init(self, key: bytes, db: str) -> None:
        # Separate keys per purpose, so the lookups stored on disk say nothing about generation.
        self._lookup_key = hmac.digest(key, b"lookup", "sha256")
        self._persona_key = hmac.digest(key, b"persona", "sha256")
        key_id = hmac.digest(key, b"key-id", "sha256").hex()[:16]
        self._db = sqlite3.connect(db)
        self._db.executescript(SCHEMA)
        with self._db:
            for k, v in (("schema_version", SCHEMA_VERSION), ("key_id", key_id)):
                self._db.execute("INSERT OR IGNORE INTO meta VALUES (?, ?)", (k, v))
        stored = dict(self._db.execute("SELECT key, value FROM meta"))
        if stored["key_id"] != key_id:
            raise ValueError(f"{db} was created with a different key than {self.key_path}")

    def lookup(self, *parts: str) -> str:
        """Keyed hash of normalized parts: what the vault stores in place of an original."""
        msg = "\0".join(normalize(p) for p in parts).encode()
        return hmac.digest(self._lookup_key, msg, "sha256").hex()

    def stream(self, *parts: str) -> Stream:
        """A deterministic draw stream for already-hashed or synthetic parts."""
        return Stream(hmac.digest(self._persona_key, "\0".join(parts).encode(), "sha256"))

    # -- subjects -----------------------------------------------------------------------------------

    def subject(self, namespace: str, subject: str, make: Callable[[int], dict]) -> dict:
        """Return the stored persona for `subject`, or create one with `make(attempt)`.

        `make` is called with attempt 0, 1, ... until it returns a persona whose `name` is not
        taken by another subject in the namespace.
        """
        row = self._db.execute("SELECT persona FROM subjects WHERE namespace = ? AND subject = ?",
                               (namespace, subject)).fetchone()
        if row:
            return json.loads(row[0])
        for attempt in range(MAX_ATTEMPTS):
            persona = make(attempt)
            try:
                with self._db:
                    self._db.execute("INSERT INTO subjects VALUES (?, ?, ?, ?)",
                                     (namespace, subject, persona["name"].casefold(), json.dumps(persona)))
                return persona
            except sqlite3.IntegrityError:
                continue
        raise RuntimeError(f"no free persona name after {MAX_ATTEMPTS} attempts")

    def value(self, namespace: str, kind: str, lookup: str, make: Callable[[int], str]) -> str:
        """Same as `subject` for a single value: distinct lookups always get distinct values."""
        row = self._db.execute("SELECT value FROM vals WHERE namespace = ? AND kind = ? AND lookup = ?",
                               (namespace, kind, lookup)).fetchone()
        if row:
            return row[0]
        for attempt in range(MAX_ATTEMPTS):
            value = make(attempt)
            try:
                with self._db:
                    self._db.execute("INSERT INTO vals VALUES (?, ?, ?, ?)", (namespace, kind, lookup, value))
                return value
            except sqlite3.IntegrityError:
                continue
        raise RuntimeError(f"no free {kind} value after {MAX_ATTEMPTS} attempts; the format is too short")

    def close(self) -> None:
        self._db.close()


def _load_or_create_key(path: Path) -> bytes:
    if path.exists():
        if os.name == "posix" and path.stat().st_mode & 0o077:
            raise PermissionError(f"{path} is readable by other users; run `chmod 600 {path}`")
        return bytes.fromhex(path.read_text().strip())
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    key = secrets.token_bytes(32)
    with os.fdopen(fd, "w") as f:
        f.write(key.hex() + "\n")
    return key

"""Downloads pinned corpus files into the local cache and checks their hashes."""

from __future__ import annotations

import hashlib
import os
import sys
import urllib.request
from pathlib import Path


def cache_dir() -> Path:
    return Path(os.environ.get("MASKARA_CACHE", Path.home() / ".cache" / "maskara")) / "bench"


def fetch(url: str, name: str, sha256: str) -> Path:
    path = cache_dir() / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}", file=sys.stderr)
        tmp = path.with_suffix(path.suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != sha256:
        raise RuntimeError(f"{path} has sha256 {digest}, expected {sha256}; delete it to download again")
    return path

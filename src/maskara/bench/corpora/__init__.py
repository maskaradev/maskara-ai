"""Benchmark corpora, each loaded into the shared `Document` shape.

Results are always reported per corpus. The corpora differ in how real they are, and no single
one is enough on its own: see each module's INFO for its caveats.
"""

from __future__ import annotations

from types import ModuleType

from ..types import Document
from . import abcd, linked, nemotron_pii, tab

CORPORA: dict[str, ModuleType] = {m.INFO["name"]: m for m in (tab, abcd, nemotron_pii, linked)}


def load(name: str, limit: int | None = None) -> list[Document]:
    """Loads a corpus; `limit` takes the first documents (each corpus has its own default)."""
    module = CORPORA[name]
    return module.load(limit=limit) if limit else module.load()

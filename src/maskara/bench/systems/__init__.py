"""Systems under test. Each maps documents to outputs that record their edits."""

from __future__ import annotations

import importlib.util
from collections.abc import Callable

from ..types import Document, Output

System = Callable[[list[Document]], dict[str, Output]]


def get(name: str) -> System:
    if name in ("none", "oracle-redact"):
        from . import baseline

        return baseline.SYSTEMS[name]
    if name.startswith("presidio-"):
        from . import presidio

        return presidio.SYSTEMS[name]
    if name in ("opf-redact", "gliner2-redact"):
        from . import detectors

        return detectors.SYSTEMS[name]
    if name.startswith("maskara"):
        from . import engine

        return engine.SYSTEMS[name]
    raise KeyError(f"unknown system {name!r}; known: {', '.join(NAMES)}")


NAMES = ["none", "oracle-redact", "presidio-redact", "presidio-fake", "presidio-fake-consistent", "opf-redact",
         "gliner2-redact", "maskara", "maskara-text"]
# maskara with a model on top, listed only when that model's package is installed.
NAMES += [f"maskara-{m}" for m in ("gliner2", "opf") if importlib.util.find_spec(m) is not None]
NAMES += ["maskara-gliner2+echr"] if importlib.util.find_spec("gliner2") is not None else []

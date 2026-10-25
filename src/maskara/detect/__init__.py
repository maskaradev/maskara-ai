"""PII detection: spans with a category, a label and a score, on code-point offsets.

    from maskara.detect import RulesDetector, merge
    spans = merge(RulesDetector().detect("Call Maria at (312) 867-5309"))

Detectors only say what a span is; `maskara.resolve` decides whose it is. `mask()` always runs the
rules and, when tables are given, the known-value detector; `detector=` picks the model on top:

    'auto'      the default model if installed (see `models.DEFAULT`), else none, with a notice
    'rules'     no model: rules and known values only
    'gliner2', 'opf'
    any object with `name` and `detect(text)`, or a list of names and objects

Domain formats (court case numbers, a company's employee ids) are not core rules; `patterns=` adds
them from a pack or as regexes (`detect.packs`). After detection, every repeat of a detected value in
the same text is found too (`repeats`).
"""

from __future__ import annotations

from .base import Detection, Detector, merge, repeats
from .known import KnownValueDetector, KnownValues
from .packs import PACKS, Pattern, pattern, patterns_for
from .rules import RulesDetector

NO_MODEL_NOTICE = ("maskara: no PII model installed, using rules and known table values only; names in free text "
                   "that are not in your tables may be missed (pip install 'maskara-ai[gliner]' adds a model)")


def models_for(spec) -> tuple[list[Detector], str | None]:
    """The model detectors `spec` asks for, and a notice to show when `auto` found none."""
    from . import models

    if spec is None or spec == "auto":
        if models.available(models.DEFAULT):
            return [models.load(models.DEFAULT)], None
        return [], NO_MODEL_NOTICE
    if spec == "rules":
        return [], None
    if isinstance(spec, str):
        return [models.load(spec)], None
    if isinstance(spec, Detector):
        return [spec], None
    out: list[Detector] = []
    for item in spec:
        out += models_for(item)[0]
    return out, None


__all__ = [
    "NO_MODEL_NOTICE",
    "PACKS",
    "Detection",
    "Detector",
    "KnownValueDetector",
    "KnownValues",
    "Pattern",
    "RulesDetector",
    "merge",
    "models_for",
    "pattern",
    "patterns_for",
    "repeats",
]

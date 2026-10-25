"""Shared plumbing so detectors differ only in what they detect."""

from __future__ import annotations

from collections.abc import Callable

from ..types import Document, Edit, Output, make_output

# (start, end, label, score)
Detection = tuple[int, int, str, float]
Detector = Callable[[str], list[Detection]]


def non_overlapping(found: list[Detection]) -> list[Detection]:
    """Highest score first, then longest; drops anything overlapping a span already kept."""
    kept: list[Detection] = []
    for d in sorted(found, key=lambda d: (-d[3], -(d[1] - d[0]), d[0])):
        if d[1] > d[0] and all(d[1] <= k[0] or d[0] >= k[1] for k in kept):
            kept.append(d)
    return sorted(kept)


def redact_with(detect: Detector) -> Callable[[list[Document]], dict[str, Output]]:
    """A system that replaces each detection with <LABEL>."""

    def run(docs: list[Document]) -> dict[str, Output]:
        out = {}
        for d in docs:
            spans = non_overlapping(detect(d.text))
            out[d.id] = make_output(d.text, [Edit(s, e, f"<{label.upper()}>") for s, e, label, _ in spans])
        return out

    return run

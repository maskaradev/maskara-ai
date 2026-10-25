"""Reference points that need no model.

none           changes nothing; checks the scorer's floor.
oracle-redact  replaces every gold direct or quasi span with [CATEGORY]. It reads the answer key, so
               it is the best that placeholder redaction can do, not a real system.
"""

from __future__ import annotations

from ..types import Document, Edit, Output, make_output


def none(docs: list[Document]) -> dict[str, Output]:
    return {d.id: make_output(d.text, []) for d in docs}


def oracle_redact(docs: list[Document]) -> dict[str, Output]:
    out = {}
    for d in docs:
        # Union of every annotator's spans, merged where they overlap.
        spans = sorted((s.start, s.end, s.category) for a in d.annotations.values() for s in a
                       if s.tier != "none")
        merged: list[list] = []
        for start, end, category in spans:
            if merged and start < merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], end)
            else:
                merged.append([start, end, category])
        out[d.id] = make_output(d.text, [Edit(s, e, f"[{c}]") for s, e, c in merged])
    return out


SYSTEMS = {"none": none, "oracle-redact": oracle_redact}

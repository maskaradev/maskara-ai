"""maskara itself. Each corpus is masked in one `mask()` call, with one vault, so a person keeps one
persona across documents, the way a user would run it over a dataset.

maskara           balanced preset, rules + known values, no model. On a corpus that comes with
                  structured data (linked: customers, agents, orders, tickets), the tables are passed
                  too and each document is a row of its ticket, as in a support-desk export; ticket ids
                  are marked `keep`, as a user who knows they are internal would. Elsewhere the documents
                  are plain texts.
maskara-text      the same, without tables, to show what known values add (differs on linked only)
maskara-gliner2   maskara plus the GLiNER2 PII model
maskara-opf       maskara plus OpenAI Privacy Filter
maskara-gliner2+echr
                  maskara-gliner2 with the `legal-echr` pattern pack (ECHR application numbers), as a
                  user masking court judgments would run it; for TAB
"""

from __future__ import annotations

from ...api import mask
from ...vault import Vault
from ..types import Document, Edit, Output, make_output

SEED = "maskara-bench"


def _inputs(docs: list[Document], with_tables: bool) -> dict:
    if not (with_tables and docs and "ticket" in docs[0].meta):
        return {"texts": {"docs": [d.text for d in docs]}}
    from ..corpora import linked

    tables = linked.tables()
    tickets = {t["key"]: t for t in tables["tickets"]}
    rows = [{**tickets[d.meta["ticket"]], "doc": d.id, "text": d.text} for d in docs]
    return {
        "tables": {**tables, "docs": rows},
        "subjects": {"customers": "key", "agents": "key", "orders": "customer", "tickets": "customer",
                     "docs": "customer"},
        # Ticket ids are internal record numbers, not personal data (the corpus leaves them unannotated).
        "columns": {"docs": {"doc": "keep", "key": "keep", "text": "text"}, "tickets": {"key": "keep"}},
    }


def system(detector: str, with_tables: bool = True, patterns: str | None = None):
    def run(docs: list[Document]) -> dict[str, Output]:
        result = mask(**_inputs(docs, with_tables), vault=Vault.from_seed(SEED), detector=detector, patterns=patterns)
        edits: dict[int, list[Edit]] = {i: [] for i in range(len(docs))}
        for m in result.mentions:
            if m.source == "docs" and m.column == "text" and m.start is not None:
                edits[m.row].append(Edit(m.start, m.end, m.replacement))
        return {d.id: make_output(d.text, edits[i]) for i, d in enumerate(docs)}

    return run


SYSTEMS = {"maskara": system("rules"), "maskara-text": system("rules", with_tables=False),
           "maskara-gliner2": system("gliner2"), "maskara-opf": system("opf"),
           "maskara-gliner2+echr": system("gliner2", patterns="legal-echr")}

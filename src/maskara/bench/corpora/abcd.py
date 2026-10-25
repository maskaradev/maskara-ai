"""Action-Based Conversations Dataset (Chen et al., 2021): customer-service chats. MIT.

Humans wrote the chats, playing a customer from a scenario card. The corpus has no span labels, so
the gold spans here are found by searching each chat for its scenario's values (name, phone,
email, ...). PII that is not on the card, such as an agent's own name, is not in the gold.
"""

from __future__ import annotations

import gzip
import json
import re

from ..types import Document, Span
from ._fetch import fetch

COMMIT = "6b8700ce67c6b37b062dd7a60abc76d7ef832a97"
SHA256 = "2bdf53ac359543dcdc38d55bc6513e78df120363f8f44870716e909f4606de15"

# Scenario field -> (category, tier).
FIELDS = {
    "personal.customer_name": ("PERSON", "direct"),
    "personal.email": ("CONTACT", "direct"),
    "personal.phone": ("CONTACT", "direct"),
    "personal.username": ("ID", "direct"),
    "personal.account_id": ("ID", "direct"),
    "personal.order_id": ("ID", "direct"),
    "order.order_id": ("ID", "direct"),
    "personal.pin_number": ("CREDENTIAL", "direct"),
    "personal.security_answer": ("CREDENTIAL", "direct"),
    "personal.password": ("CREDENTIAL", "direct"),
    "order.street_address": ("ADDRESS", "direct"),
    "order.zip_code": ("ADDRESS", "quasi"),
    "order.city": ("LOCATION", "quasi"),
}

INFO = {
    "name": "abcd",
    "source": "https://github.com/asappresearch/abcd",
    "license": "MIT",
    "realism": "human-written role-play chats; identities come from scenario cards",
    "caveats": "gold spans are derived by searching for scenario values; PII not on the card is missing",
}


def _find_literal(text: str, value: str) -> list[tuple[int, int]]:
    pattern = r"(?<![\w@])" + re.escape(value) + r"(?![\w@])"
    return [(m.start(), m.end()) for m in re.finditer(pattern, text, re.IGNORECASE)]


def _find_digits(text: str, value: str) -> list[tuple[int, int]]:
    """Finds a number however it is punctuated: (741) 062-3341, 741-062-3341, 7410623341."""
    digits = re.sub(r"\D", "", value)
    hits = []
    for m in re.finditer(r"\(?\d[\d()\-.\s]*\d", text):
        if re.sub(r"\D", "", m.group()) == digits:
            hits.append((m.start(), m.end()))
    return hits


def _spans(convo_id: str, text: str, scenario: dict) -> list[Span]:
    found: list[Span] = []
    for key, (category, tier) in FIELDS.items():
        section, name = key.split(".")
        value = str(scenario.get(section, {}).get(name) or "").strip()
        if not value:
            continue
        entity = f"{convo_id}:{name}"
        if name == "phone":
            hits = _find_digits(text, value)
        else:
            hits = _find_literal(text, value)
        if name == "customer_name":
            # People also say just their first or last name.
            for part in value.split():
                if len(part) > 1:
                    hits += _find_literal(text, part)
        found += [Span(s, e, name, category, tier, entity) for s, e in hits]
    # Keep the longest span where matches overlap (a full name over its first name).
    kept: list[Span] = []
    for sp in sorted(found, key=lambda s: (-(s.end - s.start), s.start)):
        if all(sp.end <= k.start or sp.start >= k.end for k in kept):
            kept.append(sp)
    return sorted(kept, key=lambda s: s.start)


def load(split: str = "test", limit: int | None = None) -> list[Document]:
    url = f"https://github.com/asappresearch/abcd/raw/{COMMIT}/data/abcd_v1.1.json.gz"
    raw = json.loads(gzip.decompress(fetch(url, "abcd/abcd_v1.1.json.gz", SHA256).read_bytes()))
    docs = []
    for convo in raw[split]:
        convo_id = str(convo["convo_id"])
        text = "\n".join(f"{speaker}: {utterance}" for speaker, utterance in convo["original"])
        spans = _spans(convo_id, text, convo["scenario"])
        docs.append(Document(id=convo_id, text=text, annotations={"derived": spans},
                             meta={"flow": convo["scenario"]["flow"]}))
    return docs[:limit]

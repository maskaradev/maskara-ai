"""Controlled identity-replacement ablation, not a comparison of independent products.

Run maskara ONCE, freeze its detections, resolved owners, and keep/replace decisions, then vary
only changed PERSON and CONTACT spans. All dates, IDs, addresses, quasi-identifiers and missed
spans remain exactly as maskara produced them. Baselines therefore get the same tables, resolver,
date shifting and format-preserving IDs: an advantage cannot come from better detection or from
making a baseline's dates unparseable. Gold labels are used only by the scorers, never to replace.

value-faker   one deterministic fake per normalized original value, across documents and calls
entity-token  stable typed tokens, using maskara's resolved owner when available
entity-faker  generic Faker identities, using the same resolved owner when available
persona       maskara's original output

This isolates name/contact rendering. It does NOT measure the value of maskara's address,
demographic or temporal policy, independently validate its resolver, or measure re-identification
risk. In particular, entity baselines inherit resolution errors. Stable tokens are a useful control,
not a penalty: their placeholder share is descriptive, not a utility score.

Seeds are public for reproducible benchmarks, NOT keys for production pseudonymization. Faker
outputs are not guaranteed to be fictional, unique, or different from originals; the scorer records
collisions and accidental original matches. Hold Faker's version fixed when reproducing a run.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass

from ..api import MaskResult, Mention, mask
from ..vault import Vault, normalize
from .systems.engine import SEED, _inputs
from .types import Document, Edit, Output, make_output

VARIANTS = ("value-faker", "entity-token", "entity-faker", "persona")
SCHEMA = "maskara.replacement-study/1"


def _digest(*parts: object) -> str:
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


@dataclass(frozen=True)
class FrozenMention:
    start: int
    end: int
    replacement: str
    kind: str | None  # name, email, phone; None means shared, unmodified control
    value_key: str
    owner: str | None
    name_form: str  # first / last / name, inferred from the common renderer (not gold)


@dataclass
class Prepared:
    mentions: dict[str, list[FrozenMention]]
    manifest: dict


def _freeze(m: Mention, text: str, result: MaskResult) -> FrozenMention:
    original = text[m.start:m.end]
    kind = None
    if m.changed:
        if m.category == "PERSON":
            kind = "name"
        elif m.category == "CONTACT":
            kind = "email" if "@" in original else "phone"
    form = "name"
    if kind == "name":
        name = result._personas.get(m.persona, {}).get("name", "").split()
        rendered = normalize(m.replacement)
        if name and rendered == normalize(name[0]):
            form = "first"
        elif name and rendered == normalize(name[-1]):
            form = "last"
    return FrozenMention(m.start, m.end, m.replacement, kind,
                         _digest(m.category, normalize(original)), m.persona, form)


def prepare(docs: list[Document], *, detector: str = "rules", preset: str = "balanced",
            seed: str = SEED, with_tables: bool = True, patterns=None) -> Prepared:
    if len({d.id for d in docs}) != len(docs):
        raise ValueError("replacement study requires unique document ids")
    # Strip annotation and evaluation metadata before entering the system under test. A ticket key
    # is operational input to the existing linked-table adapter, not a gold person/entity label.
    inputs = _inputs([Document(d.id, d.text, {}, {"ticket": d.meta["ticket"]} if "ticket" in d.meta else {})
                      for d in docs], with_tables)
    started = time.perf_counter()
    result = mask(**inputs, detector=detector, preset=preset, vault=Vault.from_seed(seed), patterns=patterns)
    seconds = time.perf_counter() - started
    frozen: dict[str, list[FrozenMention]] = {d.id: [] for d in docs}
    for m in result.mentions:
        if m.source == "docs" and m.column == "text" and m.start is not None:
            d = docs[m.row]
            frozen[d.id].append(_freeze(m, d.text, result))
    for mentions in frozen.values():
        mentions.sort(key=lambda m: (m.start, m.end))
    positions = [(doc, m.start, m.end, m.kind, m.owner, m.name_form)
                 for doc, ms in frozen.items() for m in ms]
    manifest = {
        "schema": SCHEMA, "seed": seed, "preset": preset, "detectors": result.detectors,
        "patterns": patterns, "with_tables": "tables" in inputs,
        "input_sha256": _digest(inputs), "plan_sha256": _digest(positions),
        "document_sha256": {d.id: _digest(d.text) for d in docs},
        "shared_preparation_seconds": round(seconds, 3),
        "spans": len(positions), "identity_spans": sum(m.kind is not None for ms in frozen.values() for m in ms),
        "varied": "changed PERSON and CONTACT rendering only",
        "shared": "input tables, detected spans, resolved owners, keep decisions, dates, IDs, addresses, "
                  "locations, demographics and all other output",
        "gold_used_for_replacement": False,
        "not_measured": ["re-identification and attribute inference", "cross-release linkage",
                         "independent entity-resolution quality", "training utility or external-corpus QA",
                         "address/geography/demographic rendering benefit"],
    }
    return Prepared(frozen, manifest)


class _Identities:
    def __init__(self, seed: str):
        from faker import Faker

        self.fake = Faker("en_US")
        self.seed = seed
        self.values: dict[tuple[str, str], dict[str, str]] = {}

    def get(self, scope: str, key: str) -> dict[str, str]:
        k = (scope, key)
        if k not in self.values:
            digest = _digest("maskara-replacements-v1", self.seed, scope, key)
            self.fake.seed_instance(int(digest, 16))
            first, last = self.fake.first_name(), self.fake.last_name()
            self.values[k] = {"first": first, "last": last, "name": f"{first} {last}",
                              "email": self.fake.safe_email(), "phone": self.fake.phone_number(),
                              "token": digest[:16]}
        return self.values[k]


def render(docs: list[Document], prepared: Prepared) -> dict[str, dict[str, Output]]:
    """All variants reuse one plan; no detectors or annotations are consulted here."""
    if set(prepared.mentions) != {d.id for d in docs}:
        raise ValueError("documents do not match the prepared replacement plan")
    if any(prepared.manifest["document_sha256"][d.id] != _digest(d.text) for d in docs):
        raise ValueError("document text changed after preparing the replacement plan")
    identities = _Identities(prepared.manifest["seed"])
    outputs: dict[str, dict[str, Output]] = {v: {} for v in VARIANTS}
    for d in docs:
        edits: dict[str, list[Edit]] = {v: [] for v in VARIANTS}
        for m in prepared.mentions[d.id]:
            values = dict.fromkeys(VARIANTS, m.replacement)
            if m.kind:
                by_value = identities.get("value", m.value_key)
                by_entity = identities.get("owner", m.owner) if m.owner else by_value
                field = m.name_form if m.kind == "name" and m.owner else m.kind
                values["value-faker"] = by_value[m.kind]
                values["entity-faker"] = by_entity[field]
                label = "PERSON" if m.kind == "name" else m.kind.upper()
                suffix = f"_{field.upper()}" if m.kind == "name" and field != "name" else ""
                values["entity-token"] = f"[{label}_{by_entity['token']}{suffix}]"
            for variant, replacement in values.items():
                edits[variant].append(Edit(m.start, m.end, replacement))
        for variant in VARIANTS:
            outputs[variant][d.id] = make_output(d.text, edits[variant])
    return outputs

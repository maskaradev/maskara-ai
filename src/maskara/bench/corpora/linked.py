"""maskara-linked: a generated store support desk where the answer to "who is who" is known.

People come from NVIDIA Nemotron-Personas-USA (CC BY 4.0, pinned shard); everything else is drawn
from a fixed seed with no model calls: customers, orders and tickets as linked tables, and the
emails, chats, phone transcripts and agent notes those tickets produced. Every mention carries a
gold entity id that holds across documents, so a system can be scored on whether it keeps one
person one person (see `maskara.bench.linked.docs` for the id scheme).

Three views of the same world, all deterministic for a given limit:
  load()       free-text documents, the shape the scorer consumes
  tables()     the structured side: customers, agents, orders, tickets, with foreign keys
  questions()  Entity QA questions with gold answers (`maskara.bench.linked.qa` explains the runner)

Documents come grouped by customer, then by date, so `limit` keeps whole customers where it can;
`questions(limit)` drops questions whose evidence falls outside the first `limit` documents.
"""

from __future__ import annotations

from functools import cache

from ..linked import docs as _docs
from ..linked import people as _people
from ..linked import qa as _qa
from ..linked import world as _world
from ..types import Document

SEED = 0
CUSTOMERS = 120

INFO = {
    "name": "linked",
    "source": f"generated from https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA @ {_people.REVISION[:7]}",
    "license": "CC BY 4.0 (people from Nemotron-Personas-USA)",
    "realism": "synthetic: template-written support tickets about real-looking US people; gold is exact by construction",
    "caveats": "templates, not human or model writing, so phrasing repeats and detectors may find it easy; "
               "US adults only, one store, English; contact details and ids are random; names are two words "
               "with distinct surnames; entity ids hold across documents, and the scorer pairs mentions "
               "across documents",
    # Entity ids mean the same thing in every document, not just within one.
    "entity_scope": "corpus",
}


@cache
def world(seed: int = SEED, customers: int = CUSTOMERS) -> _world.World:
    return _world.generate(_people.load(customers + _world.AGENTS), seed)


@cache
def _all_documents(seed: int = SEED) -> list[Document]:
    return _docs.documents(world(seed), seed)


def load(limit: int | None = None) -> list[Document]:
    return _all_documents()[:limit]


def tables() -> dict[str, list[dict]]:
    return world().tables()


def questions(limit: int | None = None) -> list[_qa.Question]:
    kept = {d.id for d in load(limit)}
    return [q for q in _qa.questions(world(), _all_documents(), SEED) if kept.issuperset(q.evidence)]

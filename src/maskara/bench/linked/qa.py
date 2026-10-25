"""Entity QA for maskara-linked: questions that need one person linked across documents.

A question names its subject through anchors, mentions in specific documents ("the customer who
placed order {a}"). To ask it of a system's output, write each anchor as what that mention became
in the output (`pose`). Under consistent pseudonyms the question still points at the right person
in the masked documents; under placeholder redaction it reads "the customer named [PERSON]" and
the link is gone. Answers are never personal data (an issue, a product, a count, a number of days,
yes/no), so the same gold answer holds for the original and every masked version.

How a runner uses this (`maskara.bench.qa_runner` is one):
  1. Load the documents and `questions()` with the same limit; run the system on the documents.
  2. For each question, give the model the system's output text of the question's `evidence`
     documents plus some distractor documents (other customers' tickets; mixing in the documents
     where the subject is only mentioned in passing makes it harder), then `pose(q, docs, outputs)`.
     When `options` is not empty, list them and ask for one; otherwise ask for a bare integer.
  3. Score exact match after lowercasing and trimming; report accuracy per `kind` and overall,
     with the original documents (`outputs=None`) as the ceiling.

Kinds
  ticket_count   How many tickets did {a} open?              needs every ticket of a person linked
  ticket_gap     Days between {a}'s first and second ticket   needs dates kept consistent per person
  earlier_issue  What was the previous ticket of the customer who placed order {a} about?
  last_product   Which product was {a}'s most recent ticket about?
  same_person    Is {a} the same customer who placed order {b}?   half yes, half no
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ..types import Document, Edit, Output
from .world import ISSUES, PRODUCTS, Ticket, World

PER_KIND = 50


@dataclass(frozen=True)
class Anchor:
    doc: str
    start: int
    end: int


@dataclass(frozen=True)
class Question:
    id: str
    kind: str
    template: str                   # "{a}", "{b}" mark the anchors
    anchors: dict[str, Anchor]
    answer: str
    options: tuple[str, ...]        # empty: the answer is an integer
    evidence: tuple[str, ...]       # documents that together contain the answer, anchors included
    subject: str                    # customer key, for analysis; not part of the question


def _surrogate(text: str, a: Anchor, edits: list[Edit]) -> str:
    """What text[a.start:a.end] became, given a system's edits."""
    parts, pos = [], a.start
    for e in sorted(edits, key=lambda e: e.start):
        if e.start < a.end and e.end > a.start:
            parts.append(text[pos:e.start] if e.start > pos else "")
            parts.append(e.replacement)
            pos = max(pos, e.end)
    if pos < a.end:
        parts.append(text[pos:a.end])
    return "".join(parts)


def fills(q: Question, docs: dict[str, Document], outputs: dict[str, Output] | None = None) -> dict[str, str]:
    """Each anchor as written in the original or in a system's output."""
    fill = {}
    for name, a in q.anchors.items():
        text = docs[a.doc].text
        fill[name] = text[a.start:a.end] if outputs is None else _surrogate(text, a, outputs[a.doc].edits)
    return fill


def pose(q: Question, docs: dict[str, Document], outputs: dict[str, Output] | None = None) -> str:
    """The question text, with each anchor as written in the original or in a system's output."""
    return q.template.format(**fills(q, docs, outputs))


def _anchor(doc: Document, label: str, entity: str) -> Anchor:
    span = next(s for s in doc.annotations["gold"] if s.label == label and s.entity == entity)
    return Anchor(doc.id, span.start, span.end)


def questions(world: World, docs: list[Document], seed: int = 0) -> list[Question]:
    """Up to PER_KIND questions of each kind, sampled with a fixed seed."""
    by_id = {d.id: d for d in docs}
    conv = lambda t: by_id[f"{t.key}-{t.channel}"]
    name = lambda t: _anchor(conv(t), "full_name", f"{t.customer}/name")
    order = lambda t: _anchor(conv(t), "order_id", f"{t.order}/id")
    # Pools of candidate questions; same_person has a yes and a no pool so its answers come out balanced.
    pools: dict[str, list[tuple]] = {k: [] for k in ("ticket_count", "ticket_gap", "earlier_issue", "last_product",
                                                     "same_person:yes", "same_person:no")}
    with_order = [t for t in world.tickets if t.order]
    rng = random.Random(seed)
    for c in world.customers:
        tickets: list[Ticket] = world.tickets_of(c)
        ev = tuple(conv(t).id for t in tickets)
        pools["ticket_count"].append((
            "How many separate support tickets has {a} opened?", {"a": name(tickets[0])},
            str(len(tickets)), (), ev, c))
        if len(tickets) >= 2:
            first, second = tickets[:2]
            pools["ticket_gap"].append((
                "How many days passed between the first and second support tickets of {a}?",
                {"a": name(tickets[-1])}, str((second.opened - first.opened).days), (),
                tuple(dict.fromkeys(ev[:2] + ev[-1:])), c))
            # Only when the anchor's own ticket is about another product, so one document is not enough.
            product = lambda t: world.orders[t.order].product if t.order else None
            if tickets[-1].order and product(tickets[-1]) != product(tickets[0]):
                pools["last_product"].append((
                    "{a} has contacted support more than once. Which product was their most recent ticket about?",
                    {"a": name(tickets[0])}, product(tickets[-1]), tuple(PRODUCTS), ev, c))
            later, earlier = tickets[-1], tickets[-2]
            if later.order and earlier.order != later.order:
                pools["earlier_issue"].append((
                    ("The customer who placed order {a} had contacted support before. "
                     "What was their previous ticket about?"),
                    {"a": order(later)}, earlier.issue, ISSUES, (conv(earlier).id, conv(later).id), c))
        # A name anchor against an order anchor from another ticket, theirs or someone else's.
        same = "Is the customer named {a} the same person who placed order {b}?"
        mine = [t for t in tickets[1:] if t.order and t.order != tickets[0].order]
        others = [t for t in with_order if t.customer != c]
        for answer, candidates in (("yes", mine), ("no", others)):
            if candidates:
                other = rng.choice(candidates)
                pools[f"same_person:{answer}"].append((
                    same, {"a": name(tickets[0]), "b": order(other)}, answer, ("yes", "no"),
                    (conv(tickets[0]).id, conv(other).id), c))

    picked: dict[str, list[tuple]] = {}
    for pool_name, pool in pools.items():
        n = PER_KIND // 2 if ":" in pool_name else PER_KIND
        picked.setdefault(pool_name.split(":")[0], []).extend(
            sorted(rng.sample(pool, min(n, len(pool))), key=lambda p: p[-1]))
    # Mix the yes and no pools, so a reader cannot learn the answer from the position.
    rng.shuffle(picked["same_person"])
    return [Question(f"{kind}-{i:02d}", kind, *p) for kind, items in picked.items() for i, p in enumerate(items)]

"""Entity QA on maskara-linked: can a downstream user still link one person across documents?

Each question (`maskara.bench.linked.qa`) is posed against a system's output and answered by one
of two readers. Gold answers are never personal data, so the same answer key holds for every
system; the original documents (system `none`) give the ceiling.

linking  Deterministic, no model. A downstream user with the masked corpus who joins documents on
         equal strings. It is given each conversation's structure, not its content: where the gold
         mentions are and which of them name the ticket's own customer, as a perfect tagger would
         find them. Every value it compares or computes with is read from the output text:
           owner   what the customer's full-name mentions became   (the join key for people)
           orders  what the order-number mentions became           (the join key for orders)
           date    the ticket date as written, if it still parses as a date
           product the catalog product named in the text
           issue   the issue whose sentence template still matches the text
         A person is the set of conversations whose owner string equals the question's name, after
         lowercasing and collapsing spaces, the scorer's consistency key. Placeholders get no special
         treatment: "[PERSON]" joins every customer into one. Questions that need ticket order
         are unanswered when any of the person's ticket dates no longer parses. Internal notes are
         left out, so a ticket counts once.
llm      An `Ask` callable (prompt -> reply), given the output text of the question's evidence
         documents plus distractor documents from other customers, in a seeded order. Adapters for
         an OpenAI-compatible endpoint and the Anthropic Messages API use only the standard library.

  python -m maskara.bench.qa_runner [--system ...] [--reader linking|llm]

reads `runs/linked--<system>.json` and `.outputs.jsonl`, written by `maskara bench`, and writes
`runs/linked--<system>.qa-<reader>.json`.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from .linked.docs import DATE_PARSE, ISSUE_TEXT, SLOT
from .linked.qa import Question, fills, pose
from .linked.world import PRODUCTS
from .score import _norm, _surrogate
from .types import Document, Edit, Output, make_output

Ask = Callable[[str], str]

KINDS = ("ticket_count", "ticket_gap", "earlier_issue", "last_product", "same_person")

DATE_FORMATS = (*DATE_PARSE, "%b. %d, %Y", "%d %b %Y", "%B %d %Y", "%Y/%m/%d", "%m-%d-%Y")
ISSUE_PATTERNS = [(issue, re.compile(".+?".join(re.escape(part) for part in SLOT.split(t)[::2])))
                  for issue, templates in ISSUE_TEXT.items() for t in templates]
PRODUCT_PATTERN = re.compile("|".join(re.escape(p) for p in sorted(PRODUCTS, key=len, reverse=True)))


def _parse_date(s: str) -> date | None:
    s = s.strip(" .,")
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


@dataclass(frozen=True)
class Ticket:
    """What the linking reader sees of one conversation in a system's output."""

    doc: str
    owner: frozenset[str]
    orders: frozenset[str]
    date: date | None
    product: str | None
    issue: str | None


def _ticket(doc: Document, out: Output) -> Ticket:
    spans = doc.annotations["gold"]
    became = lambda label, keep=lambda s: True: [_surrogate(doc.text, s, out.edits) for s in spans
                                                 if s.label == label and keep(s)]
    dates = became("ticket_date")
    product = PRODUCT_PATTERN.search(out.text)
    return Ticket(
        doc=doc.id,
        owner=frozenset(map(_norm, became("full_name", lambda s: s.entity == f"{doc.meta['customer']}/name"))),
        orders=frozenset(map(_norm, became("order_id"))),
        date=_parse_date(dates[0]) if dates else None,
        product=product.group() if product else None,
        issue=next((issue for issue, p in ISSUE_PATTERNS if p.search(out.text)), None),
    )


def _by_date(tickets: list[Ticket]) -> list[Ticket] | None:
    """Oldest first, or None when some date no longer parses."""
    if any(t.date is None for t in tickets):
        return None
    return sorted(tickets, key=lambda t: t.date)


def _link(q: Question, fill: dict[str, str], tickets: list[Ticket]) -> str | None:
    key = {k: _norm(v) for k, v in fill.items()}
    owned_by = lambda names: [t for t in tickets if t.owner & names]
    if q.kind == "same_person":
        return "yes" if any(key["a"] in t.owner and key["b"] in t.orders for t in tickets) else "no"
    if q.kind == "earlier_issue":
        placed = _by_date([t for t in tickets if key["a"] in t.orders])
        if not placed:
            return None
        later = placed[-1]
        own = _by_date(owned_by(frozenset().union(*(t.owner for t in placed))))
        before = [t for t in own or [] if t.date < later.date]
        return before[-1].issue if before else None
    own = owned_by({key["a"]})
    if q.kind == "ticket_count":
        return str(len(own))
    own = _by_date(own)
    if not own:
        return None
    if q.kind == "ticket_gap":
        return str((own[1].date - own[0].date).days) if len(own) >= 2 else None
    if q.kind == "last_product":
        return own[-1].product
    raise ValueError(f"unknown question kind {q.kind!r}")


def linking_answers(docs: list[Document], outputs: dict[str, Output], qs: list[Question]) -> dict[str, str | None]:
    by_id = {d.id: d for d in docs}
    tickets = [_ticket(d, outputs[d.id]) for d in docs if d.meta["type"] != "note"]
    return {q.id: _link(q, fills(q, by_id, outputs), tickets) for q in qs}


PROMPT = """Below are support documents from an online store, some of them with personal details replaced.
Read them and answer the question.

{documents}

Question: {question}
{instruction}"""


def _parse_reply(reply: str, q: Question) -> str | None:
    reply = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL).strip().lower().rstrip(".")
    if not q.options:
        m = re.search(r"-?\d+", reply)
        return m.group() if m else None
    found = [o for o in q.options if o.lower() == reply] or [o for o in q.options if o.lower() in reply]
    return found[0] if len(found) == 1 else None


def llm_answers(docs: list[Document], outputs: dict[str, Output], qs: list[Question], ask: Ask,
                distractors: int = 4, seed: int = 0) -> dict[str, str | None]:
    by_id = {d.id: d for d in docs}
    answers = {}
    for q in qs:
        rng = random.Random(f"{seed}:{q.id}")
        others = [d.id for d in docs if d.meta.get("customer") != q.subject]
        ids = list(q.evidence) + rng.sample(others, min(distractors, len(others)))
        rng.shuffle(ids)
        documents = "\n\n".join(f"<document>\n{outputs[i].text}\n</document>" for i in ids)
        instruction = (f"Answer with exactly one of: {', '.join(q.options)}." if q.options
                       else "Answer with a single integer and nothing else.")
        prompt = PROMPT.format(documents=documents, question=pose(q, by_id, outputs), instruction=instruction)
        answers[q.id] = _parse_reply(ask(prompt), q)
    return answers


def _post(url: str, body: dict, headers: dict) -> dict:
    req = urllib.request.Request(url, json.dumps(body).encode(), {"content-type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def openai_compatible(base_url: str, model: str, api_key: str | None = None) -> Ask:
    """Any /v1/chat/completions server: vLLM, Ollama, llama.cpp, OpenAI."""
    headers = {"authorization": f"Bearer {api_key}"} if api_key else {}

    def ask(prompt: str) -> str:
        body = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0,
                "max_tokens": 256}
        return _post(f"{base_url.rstrip('/')}/chat/completions", body, headers)["choices"][0]["message"]["content"]

    return ask


def anthropic(api_key: str, model: str) -> Ask:
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}

    def ask(prompt: str) -> str:
        body = {"model": model, "max_tokens": 256, "temperature": 0,
                "messages": [{"role": "user", "content": prompt}]}
        reply = _post("https://api.anthropic.com/v1/messages", body, headers)
        return "".join(b["text"] for b in reply["content"] if b["type"] == "text")

    return ask


def ask_from_env() -> tuple[str, Ask] | None:
    """(reader description, ask) from MASKARA_QA_BASE_URL / MASKARA_QA_MODEL, or ANTHROPIC_API_KEY."""
    model = os.environ.get("MASKARA_QA_MODEL")
    if base := os.environ.get("MASKARA_QA_BASE_URL"):
        if not model:
            raise SystemExit("MASKARA_QA_BASE_URL is set but MASKARA_QA_MODEL is not")
        return f"llm:{model}", openai_compatible(base, model, os.environ.get("MASKARA_QA_API_KEY"))
    if key := os.environ.get("ANTHROPIC_API_KEY"):
        model = model or "claude-haiku-4-5"
        return f"llm:{model}", anthropic(key, model)
    return None


def _same(answer: str | None, gold: str) -> bool:
    return answer is not None and answer.strip().lower() == gold.lower()


def accuracy(qs: list[Question], answers: dict[str, str | None]) -> dict:
    def summary(group: list[Question]) -> dict:
        correct = sum(_same(answers[q.id], q.answer) for q in group)
        return {"questions": len(group), "correct": correct, "unanswered": sum(answers[q.id] is None for q in group),
                "accuracy": round(correct / len(group), 4) if group else None}

    kinds = dict.fromkeys(q.kind for q in qs)
    return {**summary(qs), "by_kind": {k: summary([q for q in qs if q.kind == k]) for k in kinds}}


def load_run(runs: Path, corpus: str, system: str) -> tuple[dict, list[Document], dict[str, Output]]:
    """A saved `maskara bench` run: its result row, the documents it covered and the system's outputs."""
    from . import corpora

    stem = runs / f"{corpus}--{system}"
    row = json.loads(stem.with_suffix(".json").read_text())
    docs = corpora.load(corpus, row["documents"])
    edits = {}
    with stem.with_suffix(".outputs.jsonl").open() as f:
        for line in f:
            rec = json.loads(line)
            edits[rec["id"]] = [Edit(s, e, r) for s, e, r in rec["edits"]]
    return row, docs, {d.id: make_output(d.text, edits[d.id]) for d in docs}


def evaluate(runs: Path, corpus: str, system: str, ask: Ask | None = None, reader: str = "linking") -> dict:
    """Entity QA on a saved run: the linking reader, or the LLM reader when `ask` is given."""
    from . import corpora

    _, docs, outputs = load_run(runs, corpus, system)
    qs = corpora.CORPORA[corpus].questions(len(docs))
    answers = linking_answers(docs, outputs, qs) if ask is None else llm_answers(docs, outputs, qs, ask)
    return {"corpus": corpus, "system": system, "reader": reader, "documents": len(docs), **accuracy(qs, answers),
            "answers": answers}


def systems_with_outputs(runs: Path, corpus: str) -> list[str]:
    return sorted(p.name[len(corpus) + 2:-len(".outputs.jsonl")] for p in runs.glob(f"{corpus}--*.outputs.jsonl"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m maskara.bench.qa_runner")
    parser.add_argument("--corpus", default="linked")
    parser.add_argument("--system", nargs="+", help="default: every system with saved outputs")
    parser.add_argument("--reader", choices=("linking", "llm"), default="linking")
    parser.add_argument("--runs", default="runs")
    args = parser.parse_args(argv)
    runs = Path(args.runs)
    reader, ask = args.reader, None
    if reader == "llm":
        found = ask_from_env()
        if found is None:
            raise SystemExit("--reader llm needs MASKARA_QA_BASE_URL and MASKARA_QA_MODEL, or ANTHROPIC_API_KEY")
        reader, ask = found
    cell = lambda s: f"{100 * s['accuracy']:5.1f}% ({s['correct']}/{s['questions']})"
    print(" | ".join(["system", "reader", "all", *KINDS]))
    for system in args.system or systems_with_outputs(runs, args.corpus):
        r = evaluate(runs, args.corpus, system, ask, reader)
        (runs / f"{args.corpus}--{system}.qa-{args.reader}.json").write_text(json.dumps(r, indent=2))
        print(" | ".join([system, reader, cell(r), *(cell(r["by_kind"][k]) for k in KINDS)]))
        print(f"{args.corpus} / {system}: {r['questions']} questions", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

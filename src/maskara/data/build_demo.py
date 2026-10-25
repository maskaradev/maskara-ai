"""Builds the bundled demo dataset (`maskara demo`) from the maskara-linked world.

    uv run --extra bench python -m maskara.data.build_demo

A small online store: customers, support agents, orders, tickets with their conversation transcript,
and internal notes as free text with no key column. Names, sexes, ages and home towns come from
Nemotron-Personas-USA (CC BY 4.0, see NOTICE); everything else is generated from a fixed seed.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from ..bench.linked import docs as linked_docs
from ..bench.linked import people, world

OUT = Path(__file__).with_name("demo")
CUSTOMERS = 60
SEED = 7


def _phone(p: str) -> str:
    return f"({p[:3]}) {p[3:6]}-{p[6:]}"


def _csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    w = world.generate(people.load(CUSTOMERS + world.AGENTS), SEED)
    docs = {d.id: d for d in linked_docs.documents(w, SEED)}
    OUT.mkdir(exist_ok=True)
    _csv(OUT / "customers.csv", [{
        "customer_id": c.customer_id, "first_name": c.first, "last_name": c.last, "gender": c.sex,
        "birth_date": c.birth_date.isoformat(), "email": c.email, "phone": _phone(c.phone), "street": c.street,
        "city": c.city, "state": c.state, "zip": c.zipcode, "customer_since": c.since,
    } for c in w.customers.values()])
    _csv(OUT / "agents.csv", [{"agent_id": a.key, "first_name": a.first, "last_name": a.last}
                              for a in w.agents.values()])
    _csv(OUT / "orders.csv", [{
        "order_number": o.number, "customer_id": w.customers[o.customer].customer_id, "product": o.product,
        "amount": o.amount, "placed_on": o.placed.isoformat(),
    } for o in w.orders.values()])
    _csv(OUT / "tickets.csv", [{
        "ticket_id": t.key, "customer_id": w.customers[t.customer].customer_id,
        "order_number": w.orders[t.order].number if t.order else "", "agent_id": t.agent, "channel": t.channel,
        "issue": t.issue, "opened_on": t.opened.isoformat(), "transcript": docs[f"{t.key}-{t.channel}"].text,
    } for t in w.tickets])
    with (OUT / "notes.jsonl").open("w", encoding="utf-8") as f:
        for t in w.tickets:
            if t.note:
                f.write(json.dumps({"text": docs[f"{t.key}-note"].text}) + "\n")
    for path in sorted(OUT.iterdir()):
        print(f"{path.name}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()

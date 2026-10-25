"""Writes the free-text documents of maskara-linked, with a gold span for every mention.

Each ticket becomes one conversation (a customer email, a chat transcript or a phone transcript)
and, for about half the tickets, an internal agent note. Documents are assembled line by line from
short templates with randomized slots, so one person shows up as a full name, a first name,
"Ms. Lopez", an email address, a phone number in one of several formats, and so on.

Gold entity ids are shared across documents:
  C007/name, C007/email, ...    a customer's name (every form of it) and each of their attributes
  A2/name                       a support agent
  O1234567/id, O1234567/date    an order's number and the day it was placed
  T48213/date                   the day a ticket was opened
  city:Denver,CO  state:CO  zip:80216   places, shared by everyone who lives there
The part before "/" says whose attribute a mention is, so per-person views (date gaps, linkage) can
be built from the gold alone. The store's email is annotated with tier "none" (keep as written);
ticket ids, products, prices and the store's name are not annotated.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass

from ..types import Category, Document, Span, Tier
from .world import STORE, STORE_EMAIL, Customer, Ticket, World

SLOT = re.compile(r"\{(\w+)\}")

# Each document picks one style per field. All date styles parse with one of DATE_PARSE.
DATE_STYLES = (
    lambda d: f"{d:%B} {d.day}, {d.year}", lambda d: f"{d.month}/{d.day}/{d.year}", lambda d: f"{d:%m/%d/%Y}",
    lambda d: d.isoformat(), lambda d: f"{d.day} {d:%B} {d.year}", lambda d: f"{d:%b} {d.day}, {d.year}",
)
DATE_PARSE = ("%B %d, %Y", "%m/%d/%Y", "%Y-%m-%d", "%d %B %Y", "%b %d, %Y")
PHONE_STYLES = (
    lambda p: f"({p[:3]}) {p[3:6]}-{p[6:]}", lambda p: f"{p[:3]}-{p[3:6]}-{p[6:]}",
    lambda p: f"{p[:3]}.{p[3:6]}.{p[6:]}", lambda p: p, lambda p: f"+1 {p[:3]} {p[3:6]} {p[6:]}",
    lambda p: f"1-{p[:3]}-{p[3:6]}-{p[6:]}",
)
ORDER_STYLES = (lambda n: f"#{n}", lambda n: n, lambda n: f"ORD-{n}")

SUBJECTS = {
    "damaged item": ["Damaged {product}", "Order {order} arrived broken", "Broken item", "Problem with my {product}"],
    "late delivery": ["Where is my order?", "Order {order} not delivered", "Late delivery - {product}"],
    "wrong item": ["Wrong item received", "Not what I ordered (order {order})"],
    "missing part": ["Missing part", "{product} incomplete"],
    "refund request": ["Refund request", "Return and refund for order {order}"],
    "billing error": ["Double charge", "Billing problem on order {order}"],
    "cancel order": ["Cancel my order", "Please cancel order {order}"],
    "account access": ["Can't log in", "Account locked"],
    "address change": ["New address", "Update shipping address"],
}
ISSUE_TEXT = {
    "damaged item": [
        "The {product} I ordered on {odate} showed up with a cracked base.",
        "When I opened the box, the {product} was dented and one corner was smashed in.",
        "My {product} (order {order}) arrived damaged, looks like it was dropped in transit.",
        "the {product} came broken. like, in pieces.",
    ],
    "late delivery": [
        "I placed order {order} on {odate} and it still hasn't arrived.",
        "Tracking for my {product} hasn't moved in over a week.",
        "It's been weeks since I ordered the {product} and nothing has shown up.",
    ],
    "wrong item": [
        "I ordered the {product} but got something completely different.",
        "The package for order {order} had someone else's item in it, not my {product}.",
        "I received the wrong model instead of the {product} I paid for.",
    ],
    "missing part": [
        "The {product} came without the power cord, so I can't use it.",
        "Half the screws for the {product} are missing from the box.",
        "My {product} arrived but the instructions and one piece are missing.",
    ],
    "refund request": [
        "I'd like to return the {product} and get my ${amount} back.",
        "The {product} isn't what I expected. Can I get a refund for order {order}?",
        "Please refund the {product}. I ordered it on {odate} and changed my mind.",
    ],
    "billing error": [
        "My card ending in {card} was charged twice for order {order}.",
        "I see two charges of ${amount} for the {product} on my statement.",
        "You billed me ${amount} for the {product} but the sale price was lower.",
    ],
    "cancel order": [
        "Please cancel order {order} for the {product} before it ships.",
        "I ordered a {product} on {odate} by mistake, can you cancel it?",
        "I need to cancel the {product}, I found it cheaper elsewhere.",
    ],
    "account access": [
        "I can't log in, and the reset link never reaches {email}.",
        "My account got locked after too many password attempts.",
        "The site keeps saying {email} isn't registered, but I've shopped with you since {since}.",
    ],
    "address change": [
        "I moved recently. Please update my address to {street}, {city}, {state} {zip}.",
        "My new shipping address is {street}, {city}, {state} {zip}; the old one is out of date.",
        "Can you change the address on my account? It should be {street} in {city}.",
    ],
}
RESOLUTIONS = {
    "damaged item": ["I've sent a replacement {product}; it should arrive within 5 business days.",
                     "I've refunded ${amount} to your card ending in {card}."],
    "late delivery": ["The carrier shows a delay, so I've upgraded the shipping for free.",
                      "I've reshipped order {order} with express delivery."],
    "wrong item": ["I'll email a prepaid return label to {email} and ship the right item today.",
                   "The correct {product} is on its way; keep the other one."],
    "missing part": ["I've shipped the missing piece separately.", "A replacement kit for the {product} is on the way."],
    "refund request": ["Your refund of ${amount} is processed and should post in 3 to 5 days.",
                       "I've emailed a return label to {email}; the refund goes out once we receive it."],
    "billing error": ["I've credited ${amount} back to the card ending in {card}.",
                      "The billing error is fixed and the difference has been credited back to you."],
    "cancel order": ["Order {order} is cancelled and you won't be charged.", "Done, the {product} order is cancelled."],
    "account access": ["I've unlocked your account and sent a reset link to {email}.",
                       "Your password has been reset; check {email} for the link."],
    "address change": ["Your address is updated.", "All set, future orders will ship to {street}."],
}
SUMMARIES = {
    "damaged item": ["{product} arrived damaged", "item damaged in shipping"],
    "late delivery": ["order not delivered", "package stuck in transit"],
    "wrong item": ["received the wrong item", "wrong product shipped"],
    "missing part": ["{product} missing parts", "parts missing from box"],
    "refund request": ["wants a refund", "requested return and refund"],
    "billing error": ["charged twice", "billing discrepancy"],
    "cancel order": ["asked to cancel", "cancellation request"],
    "account access": ["locked out of account", "can't log in"],
    "address change": ["address change", "updated shipping address"],
}
RELATION_TEXT = {
    "gift": ["It was a gift for {b_full}, so it shipped to {b_hon} {b_last}'s address at {b_street}, {b_city}, {b_state}.",
             "I had it sent to my friend {b_first} at {b_street} in {b_city}."],
    "misdirected": ["Also, I got an order confirmation for {b_full} ({b_email}) in my inbox, which seems like a privacy problem.",
                    "Unrelated, but your system sent me a receipt meant for {b_full} at {b_email}."],
    "referral": ["My coworker {b_full} recommended your store, so I hope this gets sorted.",
                 "{b_hon} {b_last} from my church swears by you, which is why I ordered."],
    "similar case": ["Same problem as {b_full} ({b_cid}) last month; reuse that fix.",
                     "Similar to the case for {b_hon} {b_last}, customer {b_cid}."],
}
ORDER_REFS = ["Order number: {order}.", "For reference, the order number is {order}.", "(Order {order}, placed {odate}.)",
              "It was order {order}."]
PRODUCT_REFS = ["It's the {product}.", "(The item is the {product}.)", "This is about the {product} I bought."]
INTROS = ["My name is {full}.", "This is {full}, customer ID {cid}.", "I'm writing about a recent order.",
          "I've been a customer since {since} and never had a problem until now.", "Hope you're doing well.",
          "My name is {full} and I live in {city}, {state}.", "{first} here, hoping you can help."]
EXTRAS = ["You can reach me at {phone}.", "Best number to call is {phone}, after 5pm.",
          "My date of birth is {dob} if you need to verify me.",
          "I'm {age} and not great with websites, so please keep it simple.",
          "My zip code is {zip}, in case you need it.", "The card on file ends in {card}.",
          "The shipping address on the account is {street}, {city}, {state} {zip}."]
GREETINGS = ["Hi,", "Hello,", "Hi there,", "Dear Support Team,", "To whom it may concern,", "Hey team,"]
CLOSINGS = ["Thanks,", "Thank you,", "Best,", "Regards,", "Thanks in advance,", "Cheers,"]
SIGNATURES = ["{full}", "{full}\n{phone}", "{full}\n{street}\n{city}, {state} {zip}", "{first}", "{first}\n{email}",
              "- {first}"]
FOLLOWUPS = ["Replacement shipped.", "Refund approved.", "Waiting on the carrier.", "Escalated to billing.",
             "Closed.", "Customer asked for a callback at {phone}.", "Sent a return label to {email}.",
             "Follow up in a week if no response."]
NOTES = ["{agent_full}: {hon} {last} ({cid}) - {summary}. {followup}",
         "Customer: {full} | ID {cid} | {summary}. {followup}",
         "Handled by {agent}. {full} reported {summary}. {followup}",
         "{tdate} - spoke to {first} ({cid}) about {summary}. {followup} -{agent}"]


@dataclass(frozen=True)
class Value:
    """A slot value that is personal data, written with its gold span."""

    text: str
    label: str
    category: Category
    tier: Tier
    entity: str


class Writer:
    """Fills templates and records where each personal value lands in the text."""

    def __init__(self, slots: dict[str, Value | str]):
        self.slots = slots
        self.parts: list[str] = []
        self.spans: list[Span] = []
        self.size = 0
        self.used: set[str] = set()   # slot names written so far

    def _raw(self, s: str) -> None:
        self.parts.append(s)
        self.size += len(s)

    def write(self, template: str) -> None:
        pos = 0
        for m in SLOT.finditer(template):
            self._raw(template[pos:m.start()])
            value = self.slots[m.group(1)]
            self.used.add(m.group(1))
            if isinstance(value, Value):
                start = self.size
                self._raw(value.text)
                self.spans.append(Span(start, self.size, value.label, value.category, value.tier, value.entity))
            else:
                self._raw(value)
            pos = m.end()
        self._raw(template[pos:])

    def line(self, template: str = "") -> None:
        self.write(template + "\n")

    def has(self, label: str, entity: str) -> bool:
        return any(s.label == label and s.entity == entity for s in self.spans)

    def text(self) -> str:
        return "".join(self.parts).rstrip("\n")


def _person(c: Customer, rng: random.Random, prefix: str = "") -> dict[str, Value | str]:
    date, phone = rng.choice(DATE_STYLES), rng.choice(PHONE_STYLES)
    k, p = c.key, prefix
    return {
        f"{p}full": Value(f"{c.first} {c.last}", "full_name", "PERSON", "direct", f"{k}/name"),
        f"{p}first": Value(c.first, "first_name", "PERSON", "direct", f"{k}/name"),
        f"{p}last": Value(c.last, "last_name", "PERSON", "direct", f"{k}/name"),
        f"{p}hon": "Ms." if c.sex == "Female" else "Mr.",
        f"{p}email": Value(c.email, "email", "CONTACT", "direct", f"{k}/email"),
        f"{p}phone": Value(phone(c.phone), "phone", "CONTACT", "direct", f"{k}/phone"),
        f"{p}street": Value(c.street, "street_address", "ADDRESS", "direct", f"{k}/street"),
        f"{p}city": Value(c.city, "city", "LOCATION", "quasi", f"city:{c.city},{c.state}"),
        f"{p}state": Value(c.state, "state", "LOCATION", "quasi", f"state:{c.state}"),
        f"{p}zip": Value(c.zipcode, "zipcode", "ADDRESS", "quasi", f"zip:{c.zipcode}"),
        f"{p}cid": Value(c.customer_id, "customer_id", "ID", "direct", f"{k}/customer_id"),
        f"{p}dob": Value(date(c.birth_date), "birth_date", "DATE", "quasi", f"{k}/birth_date"),
        f"{p}age": Value(str(c.age), "age", "DEMOGRAPHIC", "quasi", f"{k}/age"),
        f"{p}card": Value(c.card_last4, "card_last4", "FINANCIAL", "direct", f"{k}/card"),
        f"{p}since": str(c.since),
    }


def _slots(world: World, t: Ticket, rng: random.Random) -> dict[str, Value | str]:
    agent = world.agents[t.agent]
    date = rng.choice(DATE_STYLES)
    slots: dict[str, Value | str] = {
        **_person(world.customers[t.customer], rng),
        "agent": Value(agent.first, "first_name", "PERSON", "direct", f"{agent.key}/name"),
        "agent_full": Value(f"{agent.first} {agent.last}", "full_name", "PERSON", "direct", f"{agent.key}/name"),
        "tid": t.key, "tdate": Value(date(t.opened), "ticket_date", "DATE", "quasi", f"{t.key}/date"),
        # The store's own address is not personal: annotated so that masking it counts as a kept span changed.
        "store": STORE, "store_email": Value(STORE_EMAIL, "store_email", "CONTACT", "none", "store/email"),
    }
    if t.related:
        slots.update(_person(world.customers[t.related], rng, "b_"))
    if t.order:
        o = world.orders[t.order]
        slots.update({
            "order": Value(rng.choice(ORDER_STYLES)(o.number), "order_id", "ID", "direct", f"{o.key}/id"),
            "odate": Value(date(o.placed), "order_date", "DATE", "quasi", f"{o.key}/date"),
            "product": o.product, "amount": o.amount,
        })
    return slots


def _issue(rng: random.Random, t: Ticket) -> str:
    return rng.choice(ISSUE_TEXT[t.issue])


def _relation(rng: random.Random, t: Ticket) -> str | None:
    """The customer's own sentence about the second person, if the ticket has one."""
    if t.relation and t.relation != "similar case":
        return rng.choice(RELATION_TEXT[t.relation])
    return None


def _email(w: Writer, rng: random.Random, t: Ticket) -> None:
    subject = rng.choice(SUBJECTS[t.issue])
    header = rng.randrange(3)
    if header == 0:
        w.line("From: {full} <{email}>")
        w.line("To: {store_email}")
        w.line("Date: {tdate}")
        w.line("Subject: " + subject)
    elif header == 1:
        w.line("Subject: " + subject)
        w.line("Sent: {tdate}")
        w.line("From: {email}")
    else:
        w.line("On {tdate}, {full} <{email}> wrote:")
        subject = ""  # a quoted email shows no subject
    w.line()
    w.line(rng.choice(GREETINGS))
    body = [rng.choice(INTROS), _issue(rng, t)]
    if t.order and not any("{order}" in s for s in [subject, *body]):
        body.append(rng.choice(ORDER_REFS))
    if t.order and not any("{product}" in s for s in [subject, *body]):
        body.append(rng.choice(PRODUCT_REFS))
    if relation := _relation(rng, t):
        body.append(relation)
    body += rng.sample(EXTRAS, rng.randint(0, 2))
    w.line(" ".join(body))
    w.line()
    w.line(rng.choice(CLOSINGS))
    owner = w.slots["full"].entity
    if w.has("full_name", owner):
        w.line(rng.choice(SIGNATURES))
    else:
        w.line(rng.choice(SIGNATURES[:3]))
    if rng.random() < 0.4:
        w.line()
        w.line("----- Reply from {agent_full}, {store} Support -----")
        w.line(rng.choice(["Hi {first},", "Dear {hon} {last},", "Hello {full},"]))
        w.line(rng.choice(RESOLUTIONS[t.issue]))
        w.line(rng.choice(["{agent}", "{agent_full}", "{agent} at {store}"]))


def _chat(w: Writer, rng: random.Random, t: Ticket) -> None:
    w.line(rng.choice(["Chat transcript · {tdate} · {tid}", "Live chat {tid} started {tdate}"]))
    a, c = rng.choice([("Agent ({agent})", "Customer"), ("{agent}", "{first}"), ("{store}", "{full}")])
    say = lambda who, s: w.line(f"{who}: {s}")
    say(a, rng.choice(["Hi, you're chatting with {agent} at {store}. Can I get your name and the email on your account?",
                       "Hello! This is {agent}. Who am I chatting with, and what's your account email?",
                       "Welcome to {store} support, {agent} here. Name and email please?"]))
    say(c, rng.choice(["sure, {full}, {email}", "{full}. email is {email}", "hi! it's {full} ({email})",
                       "Hi {agent}, I'm {full} and my email is {email}"]))
    say(a, rng.choice(["Thanks, {first}! How can I help today?", "Thank you, {hon} {last}. What can I do for you?",
                       "Got it, I see your account ({cid}). What's going on?"]))
    issue = _issue(rng, t)
    say(c, issue)
    if t.order and "{order}" not in issue:
        say(a, rng.choice(["I see order {order} for the {product}, placed {odate}. Is that the one?",
                           "Is this about order {order}?"]))
        say(c, rng.choice(["yes, that one", "Yep.", "correct"]))
    if t.order and "product" not in w.used:
        say(a, rng.choice(["That's the {product}, right?", "Okay, the {product}. Let me take a look."]))
    if relation := _relation(rng, t):
        say(c, relation)
    if rng.random() < 0.4:
        say(a, "Can you confirm the phone number on file?")
        say(c, "{phone}")
    say(a, rng.choice(RESOLUTIONS[t.issue]))
    say(c, rng.choice(["great, thanks", "ok thank you {agent}", "Perfect, appreciate it!", "thanks. bye"]))
    say(a, rng.choice(["Anything else I can help with, {first}?", "Have a great day!",
                       "Thanks for contacting {store}, {hon} {last}."]))


def _call(w: Writer, rng: random.Random, t: Ticket) -> None:
    w.line(rng.choice(["Phone call · {tdate} · {tid} · agent: {agent_full}", "Call transcript ({tid}), {tdate}"]))
    a, c = rng.choice([("AGENT", "CALLER"), ("Rep", "Caller"), ("{agent}", "{first}")])
    say = lambda who, s: w.line(f"{who}: {s}")
    say(a, rng.choice(["Thank you for calling {store}, this is {agent}. May I have your name?",
                       "{store} support, {agent} speaking. Who am I talking to?"]))
    say(c, rng.choice(["Yes, it's {full}.", "Hi, this is {full}.", "{full}. I'm calling about a problem."]))
    question, answer = rng.choice([("can you give me your date of birth?", "{dob}"),
                                   ("what's the phone number on the account?", "{phone}"),
                                   ("what's your zip code?", "{zip}"),
                                   ("can I get the last four digits of the card on file?", "{card}"),
                                   ("what's the email address on the account?", "{email}")])
    say(a, "Thanks, {hon} {last}. To verify the account, " + question)
    say(c, answer)
    say(a, "Perfect. What can I help you with?")
    issue = _issue(rng, t)
    say(c, issue)
    if t.order and "{order}" not in issue:
        say(c, rng.choice(["The order number is {order}.", "It's order {order}, from {odate}."]))
    if t.order and "product" not in w.used:
        say(a, rng.choice(["And that was the {product}?", "I see the {product} on that order."]))
    if relation := _relation(rng, t):
        say(c, relation)
    say(a, rng.choice(RESOLUTIONS[t.issue]))
    say(c, rng.choice(["Okay, thank you so much.", "Great, thanks.", "Alright. Thanks for your help, {agent}."]))
    say(a, rng.choice(["Thanks for calling, {first}. Bye now.", "You're welcome, {hon} {last}. Take care."]))


def _note(w: Writer, rng: random.Random, t: Ticket) -> None:
    w.line(rng.choice(["Internal note · {tid}", "INTERNAL - {tid} - {tdate}"]))
    template = rng.choice(NOTES).replace("{summary}", rng.choice(SUMMARIES[t.issue]))
    w.line(template.replace("{followup}", rng.choice(FOLLOWUPS)))
    if t.order and rng.random() < 0.7:
        w.line(rng.choice(["Order {order}.", "Re: order {order} ({product})."]))
    if t.relation == "similar case":
        w.line(rng.choice(RELATION_TEXT["similar case"]))


CONVERSATIONS = {"email": _email, "chat": _chat, "call": _call}


def documents(world: World, seed: int = 0) -> list[Document]:
    """One conversation per ticket, plus a note where the ticket has one; by customer, then date."""
    docs = []
    for t in world.tickets:
        # entity_scope tells the scorer that entity ids hold across documents.
        meta = {"ticket": t.key, "customer": t.customer, "order": t.order, "issue": t.issue,
                "date": t.opened.isoformat(), "related": t.related, "relation": t.relation, "entity_scope": "corpus"}
        # A generator per ticket keeps each document stable when other tickets change.
        rng = random.Random(f"{seed}:{t.key}")
        for kind in [t.channel] + (["note"] if t.note else []):
            w = Writer(_slots(world, t, rng))
            (_note if kind == "note" else CONVERSATIONS[kind])(w, rng, t)
            docs.append(Document(f"{t.key}-{kind}", w.text(), {"gold": w.spans}, {"type": kind, **meta}))
    return docs

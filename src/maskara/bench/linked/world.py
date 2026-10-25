"""The synthetic world behind maskara-linked: an online store's customers, orders and tickets.

Customers keep their persona's name, sex, age and home city; the store-side details (email, phone,
street, customer id, card, birth date) are drawn here. Every ticket belongs to one customer and,
for most issues, one of that customer's orders. Some tickets also involve a second customer (a gift
recipient, a misdirected email, a referral, a similar case), which puts two people in one document.

Everything comes from one `random.Random(seed)` and the people list, in a fixed order, so the same
inputs always give the same world.
"""

from __future__ import annotations

import random
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date, timedelta

from .people import Person

STORE = "Lumen Goods"
STORE_EMAIL = "support@lumengoods.com"
AGENTS = 6
TODAY = date(2025, 12, 31)  # persona ages are taken as of this day

# A few products carry first names or place names, as real catalogs do; they are not PII.
PRODUCTS = {
    "Aurora 6-Cup Blender": "89.99", "Nimbus Wireless Earbuds": "129.00", "Trailhead 40L Backpack": "74.50",
    "Orbit Smart Thermostat": "199.00", "Pulse Fitness Tracker": "59.95", "Summit Rain Jacket": "112.00",
    "Breeze Tower Fan": "64.99", "Glacier Water Bottle": "24.00", "Ember Electric Kettle": "45.00",
    "Atlas Standing Desk": "449.00", "Harbor Coffee Grinder": "79.00", "Terra Yoga Mat": "38.00",
    "Cascade Air Purifier": "229.00", "Vortex Robot Vacuum": "319.99", "Willow Baby Monitor": "149.00",
    "Mosaic Puzzle Set": "29.99", "Hudson Desk Chair": "289.00", "Stella Floor Lamp": "119.00",
    "Georgia Wool Throw": "68.00", "Austin Travel Mug": "22.50", "Beckett Leather Wallet": "54.00",
    "Ivy Ceramic Planter": "31.00", "Jackson Cast Iron Skillet": "42.00", "Florence Linen Sheet Set": "139.00",
}
# Issues that concern an order come first; the last two concern the account only.
ISSUES = ("damaged item", "late delivery", "wrong item", "missing part", "refund request", "billing error",
          "cancel order", "account access", "address change")
ORDER_ISSUES = ISSUES[:7]
CHANNELS = ("email", "chat", "call")
RELATIONS = ("gift", "misdirected", "referral", "similar case")

STREETS = ("Oak", "Maple", "Cedar", "Pine", "Elm", "Washington", "Lake", "Hill", "Park", "Sunset", "Ridge",
           "Highland", "Mill", "Church", "River", "Spring", "Willow", "Main", "Franklin", "Jefferson",
           "Lincoln", "Chestnut", "Walnut", "Meadow", "Forest", "Valley", "Prospect", "Union", "Oak Ridge",
           "Briar Creek", "Fox Hollow", "Stone Gate")
STREET_TYPES = ("St", "Ave", "Rd", "Dr", "Ln", "Ct", "Blvd", "Way", "Pl", "Street", "Avenue", "Road", "Drive")
DOMAINS = ("gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com", "aol.com", "proton.me",
           "comcast.net")


@dataclass(frozen=True)
class Customer:
    key: str            # id used in gold entity ids, e.g. C007; never written into text
    customer_id: str    # what the store calls them, e.g. CUS-482193
    first: str
    last: str
    sex: str
    age: int
    birth_date: date
    email: str
    phone: str          # ten digits; documents format it in several ways
    street: str
    city: str
    state: str
    zipcode: str
    card_last4: str
    since: int          # year the account was opened; written as plain text, not PII


@dataclass(frozen=True)
class Agent:
    key: str
    first: str
    last: str


@dataclass(frozen=True)
class Order:
    key: str            # O + number
    number: str
    customer: str       # Customer.key
    product: str
    amount: str
    placed: date


@dataclass(frozen=True)
class Ticket:
    key: str            # also its visible id, e.g. T48213; ticket ids are not annotated
    customer: str
    order: str | None
    issue: str
    channel: str
    opened: date
    agent: str          # Agent.key
    note: bool          # an internal note document accompanies the conversation
    related: str | None = None   # a second customer mentioned in the ticket
    relation: str | None = None


@dataclass(frozen=True)
class World:
    customers: dict[str, Customer]
    agents: dict[str, Agent]
    orders: dict[str, Order]
    tickets: list[Ticket]   # by customer, then date

    def tables(self) -> dict[str, list[dict]]:
        """Plain rows (dates as ISO strings) with foreign keys: orders/tickets -> customers, tickets -> orders."""
        def rows(items) -> list[dict]:
            return [{k: v.isoformat() if isinstance(v, date) else v for k, v in asdict(x).items()} for x in items]

        return {"customers": rows(self.customers.values()), "agents": rows(self.agents.values()),
                "orders": rows(self.orders.values()), "tickets": rows(self.tickets)}

    def tickets_of(self, customer: str) -> list[Ticket]:
        return [t for t in self.tickets if t.customer == customer]


def _unique(rng: random.Random, used: set[str], make) -> str:
    while (value := make(rng)) in used:
        pass
    used.add(value)
    return value


def _ascii(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if c.isascii() and c.isalnum()).lower()


def _email(rng: random.Random, first: str, last: str, birth: date, used: set[str]) -> str:
    f, la = _ascii(first), _ascii(last)
    local = rng.choice([f"{f}.{la}", f"{f[0]}{la}", f"{f}{la}{birth.year % 100:02d}", f"{la}.{f}",
                        f"{f}_{la}", f"{f}{la[0]}{rng.randint(1, 99)}", f"{f[0]}.{la}{rng.randint(1, 9)}"])
    return _unique(rng, used, lambda r: (local if r.random() < 0.8 else local + str(r.randint(10, 999)))
                   + "@" + r.choice(DOMAINS))


def _customer(rng: random.Random, key: str, p: Person, used: set[str]) -> Customer:
    latest = TODAY.replace(year=TODAY.year - p.age)
    birth = latest - timedelta(days=rng.randrange(365))
    street = f"{rng.randint(1, 9999)} {rng.choice(STREETS)} {rng.choice(STREET_TYPES)}"
    if rng.random() < 0.2:
        street += f" {rng.choice(['Apt', 'Unit', '#'])} {rng.randint(1, 40)}{rng.choice(['', 'A', 'B'])}"
    return Customer(
        key=key,
        customer_id=_unique(rng, used, lambda r: f"CUS-{r.randint(100000, 999999)}"),
        first=p.first, last=p.last, sex=p.sex, age=p.age, birth_date=birth,
        email=_email(rng, p.first, p.last, birth, used),
        phone=_unique(rng, used, lambda r: f"{r.randint(201, 989)}{r.randint(200, 999)}{r.randint(0, 9999):04d}"),
        street=street, city=p.city, state=p.state, zipcode=p.zipcode,
        card_last4=f"{rng.randint(0, 9999):04d}",
        since=rng.randint(min(2024, max(2012, TODAY.year - p.age + 18)), 2024),
    )


def generate(people: list[Person], seed: int = 0) -> World:
    """The first AGENTS people become support agents, the rest customers."""
    if len(people) <= AGENTS + 1:
        raise ValueError(f"need more than {AGENTS + 1} people, got {len(people)}")
    rng = random.Random(seed)
    used: set[str] = set()
    agents = {f"A{i}": Agent(f"A{i}", p.first, p.last) for i, p in enumerate(people[:AGENTS], 1)}
    customers = {}
    for i, p in enumerate(people[AGENTS:], 1):
        customers[f"C{i:03d}"] = _customer(rng, f"C{i:03d}", p, used)

    orders: dict[str, Order] = {}
    tickets: list[Ticket] = []
    keys = list(customers)
    for c in keys:
        mine = []
        for _ in range(rng.randint(1, 4)):
            number = _unique(rng, used, lambda r: str(r.randint(1000000, 9999999)))
            product = rng.choice(list(PRODUCTS))
            placed = date(2024, 9, 1) + timedelta(days=rng.randrange(420))
            mine.append(Order(f"O{number}", number, c, product, PRODUCTS[product], placed))
        mine.sort(key=lambda o: o.placed)
        orders.update((o.key, o) for o in mine)

        days: set[date] = set()
        fresh = list(mine)   # orders not yet complained about, so tickets mostly concern different orders
        drafts = []
        for _ in range(rng.choices([1, 2, 3, 4], weights=[2, 4, 3, 1])[0]):
            issue = rng.choice(ISSUES)
            order = None
            if issue in ORDER_ISSUES:
                order = fresh.pop(rng.randrange(len(fresh))) if fresh else rng.choice(mine)
            while True:
                opened = (order.placed + timedelta(days=rng.randint(1, 30)) if order
                          else date(2024, 9, 1) + timedelta(days=rng.randrange(480)))
                if opened not in days:
                    break
            days.add(opened)
            related = relation = None
            if rng.random() < 0.15:
                related = rng.choice([k for k in keys if k != c])
                relation = rng.choice(RELATIONS if order else ("misdirected", "referral", "similar case"))
            drafts.append(Ticket(
                key=_unique(rng, used, lambda r: f"T{r.randint(10000, 99999)}"), customer=c,
                order=order.key if order else None, issue=issue, channel=rng.choice(CHANNELS), opened=opened,
                agent=rng.choice(list(agents)), note=rng.random() < 0.5 or relation == "similar case",
                related=related, relation=relation,
            ))
        tickets += sorted(drafts, key=lambda t: t.opened)
    return World(customers, agents, orders, tickets)

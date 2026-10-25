"""Microsoft Presidio with its default analyzer (spaCy en_core_web_lg plus pattern recognizers).

presidio-redact           <ENTITY_TYPE>, Presidio's default replace operator.
presidio-fake             a fresh Faker value per mention, as in Presidio's Faker operator sample.
presidio-fake-consistent  one Faker value per (type, text) within a document, as in Presidio's
                          pseudonymization sample. Separates detection misses from replacement
                          choices.
"""

from __future__ import annotations

from functools import cache

from ..types import Document, Edit, Output, make_output
from ._common import Detection, non_overlapping, redact_with


@cache
def _analyzer():
    from presidio_analyzer import AnalyzerEngine

    return AnalyzerEngine()


def _faker():
    from faker import Faker

    fake = Faker("en_US")
    fake.seed_instance(0)
    return fake


FAKE = {
    "PERSON": lambda f: f.name(),
    "EMAIL_ADDRESS": lambda f: f.email(),
    "PHONE_NUMBER": lambda f: f.phone_number(),
    "LOCATION": lambda f: f.city(),
    "DATE_TIME": lambda f: f.date(),
    "URL": lambda f: f.url(),
    "CREDIT_CARD": lambda f: f.credit_card_number(),
    "US_SSN": lambda f: f.ssn(),
    "IP_ADDRESS": lambda f: f.ipv4(),
    "NRP": lambda f: f.country(),
    "US_BANK_NUMBER": lambda f: f.bban(),
    "US_DRIVER_LICENSE": lambda f: f.bothify("?#######").upper(),
    "IBAN_CODE": lambda f: f.iban(),
}


def detect(text: str) -> list[Detection]:
    return [(r.start, r.end, r.entity_type, r.score) for r in _analyzer().analyze(text=text, language="en")]


def _run(docs: list[Document], replace) -> dict[str, Output]:
    out = {}
    for d in docs:
        memo: dict[tuple[str, str], str] = {}
        edits = [Edit(s, e, replace(t, d.text[s:e], memo)) for s, e, t, _ in non_overlapping(detect(d.text))]
        out[d.id] = make_output(d.text, edits)
    return out


def fake(docs: list[Document]) -> dict[str, Output]:
    f = _faker()
    return _run(docs, lambda t, _text, _memo: FAKE.get(t, lambda f: f.bothify("########"))(f))


def fake_consistent(docs: list[Document]) -> dict[str, Output]:
    f = _faker()

    def replace(t: str, text: str, memo: dict) -> str:
        key = (t, " ".join(text.lower().split()))
        if key not in memo:
            memo[key] = FAKE.get(t, lambda f: f.bothify("########"))(f)
        return memo[key]

    return _run(docs, replace)


SYSTEMS = {"presidio-redact": redact_with(detect), "presidio-fake": fake, "presidio-fake-consistent": fake_consistent}

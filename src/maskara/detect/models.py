"""Optional PII models behind the same `Detector` shape. Neither is a dependency of the core package.

gliner2  fastino/gliner2-privacy-filter-PII-multi (Apache-2.0, 1.2 GB), `pip install 'maskara-ai[gliner]'`
opf      OpenAI Privacy Filter (Apache-2.0, 2.8 GB), not on PyPI:
         `pip install 'opf @ git+https://github.com/openai/privacy-filter'`

Both download weights from Hugging Face on first use and run offline afterwards (set HF_HUB_OFFLINE=1
to make sure). Labels are mapped onto maskara's categories; the model's own label is kept in
`Detection.label`.

Models take brand names for people ('Michael Kors Jacket'). `mask()` drops a model's person span
followed by a capitalized word that is no name and no suffix (`not_a_product`), the same cue the name
rules use. The detectors themselves return the model's raw output (the redact baselines score that).
"""

from __future__ import annotations

import importlib.util
from functools import cache

from ..bench.types import Category
from . import rules
from .base import Detection

# The model `auto` picks when it is installed (see docs/research/bench-results.md for the comparison).
DEFAULT = "gliner2"
PACKAGES = {"gliner2": "gliner2", "opf": "opf"}

GLINER2_MODEL = "fastino/gliner2-privacy-filter-PII-multi"
GLINER2_LABELS: dict[str, Category] = {
    "person": "PERSON", "full_name": "PERSON", "first_name": "PERSON", "middle_name": "PERSON",
    "last_name": "PERSON", "date_of_birth": "DATE", "email": "CONTACT", "phone_number": "CONTACT",
    "address": "ADDRESS", "street_address": "ADDRESS", "postal_code": "ADDRESS", "city": "LOCATION",
    "state_or_region": "LOCATION", "country": "LOCATION",
    "government_id": "ID", "national_id_number": "ID", "passport_number": "ID", "drivers_license_number": "ID",
    "license_number": "ID", "tax_id": "ID", "tax_number": "ID", "account_id": "ID", "sensitive_account_id": "ID",
    "bank_account": "FINANCIAL", "account_number": "FINANCIAL", "routing_number": "FINANCIAL", "iban": "FINANCIAL",
    "payment_card": "FINANCIAL", "card_number": "FINANCIAL", "card_expiry": "FINANCIAL", "card_cvv": "FINANCIAL",
    "username": "CREDENTIAL", "password": "CREDENTIAL", "secret": "CREDENTIAL", "api_key": "CREDENTIAL",
    "access_token": "CREDENTIAL", "recovery_code": "CREDENTIAL", "ip_address": "NETWORK",
    "sensitive_date": "DATE", "document_date": "DATE", "expiration_date": "DATE", "transaction_date": "DATE",
}
OPF_LABELS: dict[str, Category] = {
    "private_person": "PERSON", "private_email": "CONTACT", "private_phone": "CONTACT",
    "private_address": "ADDRESS", "private_url": "NETWORK", "private_date": "DATE", "account_number": "ID",
    "secret": "CREDENTIAL",
}


def available(name: str) -> bool:
    return importlib.util.find_spec(PACKAGES[name]) is not None


NAME_SUFFIXES = {"Jr", "Sr", "II", "III", "IV", "MD", "PhD", "Esq"}


def not_a_product(text: str, d: Detection) -> bool:
    """False for a person span right before a capitalized word that is no name: 'Michael Kors Jacket'."""
    if d.category != "PERSON" or not (nxt := rules.NEXT_WORD.match(text, d.end)):
        return True
    word = nxt.group(1)
    return word in NAME_SUFFIXES or rules._first(word) or rules._last(word)


class GLiNER2Detector:
    name = "gliner2"

    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def detect(self, text: str) -> list[Detection]:
        result = _gliner2().extract_entities_long(text, list(GLINER2_LABELS), threshold=self.threshold,
                                                  include_spans=True, include_confidence=True)
        return [Detection(m["start"], m["end"], GLINER2_LABELS[label],
                          "birth_date" if label == "date_of_birth" else label, float(m["confidence"]), self.name)
                for label, matches in result["entities"].items() for m in matches if label in GLINER2_LABELS]


class OPFDetector:
    name = "opf"

    def detect(self, text: str) -> list[Detection]:
        # OPF decodes spans without a confidence; 0.9 ranks it below exact rules and known values.
        return [Detection(s.start, s.end, OPF_LABELS.get(s.label, "OTHER"), s.label, 0.9, self.name)
                for s in _opf().redact(text).detected_spans]


@cache
def _gliner2():
    from gliner2 import GLiNER2

    return GLiNER2.from_pretrained(GLINER2_MODEL)


@cache
def _opf():
    from opf._api import OPF

    return OPF(device="cpu")


def load(name: str):
    if name not in PACKAGES:
        raise ValueError(f"unknown model {name!r}; expected one of {sorted(PACKAGES)}")
    if not available(name):
        hint = "pip install 'maskara-ai[gliner]'" if name == "gliner2" else \
            "pip install 'opf @ git+https://github.com/openai/privacy-filter'"
        raise ImportError(f"the {name} detector is not installed; {hint}")
    return GLiNER2Detector() if name == "gliner2" else OPFDetector()

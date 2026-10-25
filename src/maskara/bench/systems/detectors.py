"""Open PII detection models, each run with placeholder redaction so only detection differs.

opf-redact      OpenAI Privacy Filter (Apache-2.0) through its own package, Viterbi decoding, CPU.
gliner2-redact  fastino/gliner2-privacy-filter-PII-multi (Apache-2.0), all 42 labels, threshold 0.5,
                384-word overlapping chunks for long documents.
"""

from __future__ import annotations

from functools import cache

from ._common import Detection, redact_with

GLINER2_MODEL = "fastino/gliner2-privacy-filter-PII-multi"
GLINER2_LABELS = [
    "person", "full_name", "first_name", "middle_name", "last_name", "date_of_birth",
    "email", "phone_number", "address", "street_address", "city", "state_or_region", "postal_code",
    "country",
    "government_id", "national_id_number", "passport_number", "drivers_license_number",
    "license_number", "tax_id", "tax_number",
    "bank_account", "account_number", "routing_number", "iban", "payment_card", "card_number",
    "card_expiry", "card_cvv",
    "username", "ip_address", "account_id", "sensitive_account_id",
    "password", "secret", "api_key", "access_token", "recovery_code",
    "sensitive_date", "document_date", "expiration_date", "transaction_date",
]


@cache
def _opf():
    from opf._api import OPF

    return OPF(device="cpu")


def opf_detect(text: str) -> list[Detection]:
    result = _opf().redact(text)
    return [(s.start, s.end, s.label, 1.0) for s in result.detected_spans]


@cache
def _gliner2():
    from gliner2 import GLiNER2

    return GLiNER2.from_pretrained(GLINER2_MODEL)


def gliner2_detect(text: str) -> list[Detection]:
    result = _gliner2().extract_entities_long(text, GLINER2_LABELS, threshold=0.5, include_spans=True,
                                              include_confidence=True)
    return [(m["start"], m["end"], label, m["confidence"])
            for label, matches in result["entities"].items() for m in matches]


SYSTEMS = {"opf-redact": redact_with(opf_detect), "gliner2-redact": redact_with(gliner2_detect)}

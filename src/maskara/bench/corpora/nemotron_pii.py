"""Nemotron-PII (NVIDIA, 2025): synthetic documents with span labels. CC BY 4.0.

Wide label coverage (54 labels, 30 domains, structured and free-text documents), but every
document is generated, so a high score here alone says little about real text. The corpus has no
entity ids; mentions with the same category and text in one document are treated as one entity.
"""

from __future__ import annotations

import ast
import hashlib

from ..types import Document, Span
from ._fetch import fetch

REVISION = "b70ffaf5ff39e079776134c5bf4381f00a9fd1ed"
SHA256 = "1a4b0512ecb5370f0992d29d0f9c07351e6de13f0d7ea33bb18cecb984780247"

D, Q = "direct", "quasi"
LABELS = {
    "first_name": ("PERSON", D), "last_name": ("PERSON", D),
    "email": ("CONTACT", D), "phone_number": ("CONTACT", D), "fax_number": ("CONTACT", D),
    "street_address": ("ADDRESS", D), "coordinate": ("LOCATION", D),
    "ssn": ("ID", D), "customer_id": ("ID", D), "employee_id": ("ID", D),
    "medical_record_number": ("ID", D), "health_plan_beneficiary_number": ("ID", D),
    "account_number": ("ID", D), "certificate_license_number": ("ID", D), "license_plate": ("ID", D),
    "vehicle_identifier": ("ID", D), "device_identifier": ("ID", D), "tax_id": ("ID", D),
    "unique_id": ("ID", D), "biometric_identifier": ("ID", D),
    "credit_debit_card": ("FINANCIAL", D), "cvv": ("FINANCIAL", D),
    "bank_routing_number": ("FINANCIAL", D), "swift_bic": ("FINANCIAL", D),
    "password": ("CREDENTIAL", D), "pin": ("CREDENTIAL", D), "api_key": ("CREDENTIAL", D),
    "http_cookie": ("CREDENTIAL", D), "user_name": ("CREDENTIAL", D),
    "ipv4": ("NETWORK", D), "ipv6": ("NETWORK", D), "mac_address": ("NETWORK", D), "url": ("NETWORK", D),
    "date": ("DATE", Q), "date_of_birth": ("DATE", Q), "date_time": ("DATE", Q), "time": ("DATE", Q),
    "city": ("LOCATION", Q), "county": ("LOCATION", Q), "state": ("LOCATION", Q),
    "country": ("LOCATION", Q), "postcode": ("ADDRESS", Q),
    "company_name": ("ORG", Q),
    "occupation": ("DEMOGRAPHIC", Q), "education_level": ("DEMOGRAPHIC", Q),
    "employment_status": ("DEMOGRAPHIC", Q), "gender": ("DEMOGRAPHIC", Q), "age": ("DEMOGRAPHIC", Q),
    "race_ethnicity": ("DEMOGRAPHIC", Q), "religious_belief": ("DEMOGRAPHIC", Q),
    "political_view": ("DEMOGRAPHIC", Q), "sexuality": ("DEMOGRAPHIC", Q),
    "language": ("DEMOGRAPHIC", Q), "blood_type": ("DEMOGRAPHIC", Q),
}

INFO = {
    "name": "nemotron-pii",
    "source": "https://huggingface.co/datasets/nvidia/Nemotron-PII",
    "license": "CC BY 4.0",
    "realism": "synthetic documents, generated labels",
    "caveats": "fully synthetic; entity ids are inferred from equal text within a document",
}


def load(split: str = "test", limit: int | None = 1000) -> list[Document]:
    import pyarrow.parquet as pq  # optional dependency: maskara-ai[bench]

    url = (f"https://huggingface.co/datasets/nvidia/Nemotron-PII/resolve/{REVISION}"
           f"/data/{split}-00000-of-00001.parquet")
    rows = pq.read_table(fetch(url, f"nemotron-pii/{split}.parquet", SHA256),
                         columns=["uid", "domain", "document_type", "document_format", "locale",
                                  "text", "spans"]).to_pylist()
    # English-only scope: the `us` locale. A fixed hash order keeps the sample stable across runs.
    rows = sorted((r for r in rows if r["locale"] == "us"),
                  key=lambda r: hashlib.sha1(r["uid"].encode()).hexdigest())[:limit]
    docs = []
    for r in rows:
        spans = []
        for s in ast.literal_eval(r["spans"]):
            category, tier = LABELS.get(s["label"], ("OTHER", Q))
            surface = " ".join(r["text"][s["start"]:s["end"]].lower().split())
            spans.append(Span(s["start"], s["end"], s["label"], category, tier, f"{category}:{surface}"))
        docs.append(Document(id=r["uid"], text=r["text"], annotations={"generated": spans},
                             meta={"domain": r["domain"], "format": r["document_format"]}))
    return docs

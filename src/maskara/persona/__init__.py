"""Persona engine: swap each real person for one consistent synthetic person.

    from maskara.persona import PersonaEngine
    from maskara.vault import Vault

    engine = PersonaEngine(preset="balanced", vault=Vault(".maskara/vault.db"))
    p = engine.persona_for("user_123", {"sex": "F", "age": 47, "zip": "60614"})
    p.replace("PERSON", "Jane Doe")          # same persona, same output, every run
    p.replace("CONTACT", "(312) 867-5309")   # '(773) 555-0142': local area code, fictional exchange
    engine.replace("ID", "ACCT-88213")       # value-keyed: same id -> same fake everywhere

Contract: inputs are the detected strings (offsets are the caller's concern); categories are
`maskara.bench.types.Category`; outputs keep the input's format and are deterministic under the
vault key. Direct identifiers never come back unchanged. Values that identify no one alone are
kept on purpose: attributes the preset preserves (the state under `balanced`, gender), countries,
times of day, and QUANTITY.
"""

from .engine import CATEGORIES, Persona, PersonaEngine
from .presets import PRESETS, Preset

__all__ = ["CATEGORIES", "PRESETS", "Persona", "PersonaEngine", "Preset"]

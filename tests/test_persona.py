import re
from datetime import date, datetime

import pytest

from maskara import data
from maskara.persona import PersonaEngine
from maskara.persona.formats import luhn_ok, shift_dates
from maskara.persona.geo import AREA_CODES, REGION
from maskara.vault import Vault

ATTRS = {"sex": "F", "age": 47, "zip": "60614", "education": "bachelors"}


def engine(preset="balanced", seed="test", **kw):
    return PersonaEngine(preset, Vault.from_seed(seed), **kw)


def sample_attrs(n):
    """Attribute sets taken from the persona data itself, so every preset can match them."""
    rows = data.personas()
    step = len(rows) // n
    return [{"sex": r.sex, "age": r.age, "state": r.state, "city": r.city, "education": r.education,
             "occupation": r.occupation} for r in rows[::step][:n]]


TEXTS = [("PERSON", "Dr. Jane A. Doe"), ("PERSON", "Doe, Jane"), ("CONTACT", "jane.doe@gmail.com"),
         ("CONTACT", "(312) 867-5309"), ("ADDRESS", "1428 Elm Street, Chicago, IL 60614"),
         ("LOCATION", "Chicago"), ("DATE", "March 3, 2004"), ("ID", "123-45-6789"),
         ("FINANCIAL", "4111 1111 1111 1111"), ("ORG", "Acme Corp."), ("NETWORK", "10.1.2.3")]


def test_same_key_same_personas_across_runs(tmp_path):
    a = engine().persona_for("user_1", ATTRS)
    b = engine().persona_for("user_1", ATTRS)
    assert a == b
    assert [a.replace(c, t) for c, t in TEXTS] == [b.replace(c, t) for c, t in TEXTS]
    assert engine(seed="other").persona_for("user_1", ATTRS) != a
    assert engine(namespace="other").persona_for("user_1", ATTRS) != a

    # A file vault keeps the assignment, and the key alone re-derives it.
    first = PersonaEngine(vault=Vault(tmp_path / "v.db")).persona_for("user_1", ATTRS)
    again = PersonaEngine(vault=Vault(tmp_path / "v.db")).persona_for("user_1", {"sex": "M"})
    assert again == first  # first assignment wins
    (tmp_path / "v.db").unlink()
    assert PersonaEngine(vault=Vault(tmp_path / "v.db")).persona_for("user_1", ATTRS) == first


def test_distinct_subjects_get_distinct_personas():
    e = engine()
    people = [e.persona_for(f"user_{i}", {"sex": "F", "age": 30, "state": "VT"}) for i in range(500)]
    assert len({p.name for p in people}) == 500
    assert len({p.email for p in people}) == 500
    assert len({p.id for p in people}) == 500


@pytest.mark.parametrize("preset", ["strict", "balanced", "max_utility"])
def test_presets_preserve_their_attributes(preset):
    e = engine(preset)
    band = {"strict": 10, "balanced": 5, "max_utility": 0}[preset]
    sizes = {(r.state, r.city): r.size for r in data.personas()}
    for i, attrs in enumerate(sample_attrs(150)):
        p = e.persona_for(f"s{i}", attrs)
        assert p.sex == attrs["sex"]
        if band:
            assert p.age // band == attrs["age"] // band
        else:
            assert p.age == attrs["age"]
        if preset == "strict":
            assert REGION[p.state] == REGION[attrs["state"]]
        else:
            assert p.state == attrs["state"]
        if preset == "max_utility":
            assert p.occupation == attrs["occupation"]
            assert sizes[(p.state, p.city)] == sizes[(attrs["state"], attrs["city"])]


def test_names_follow_birth_cohort():
    e = engine()
    old = [e.persona_for(f"o{i}", {"sex": "F", "age": 95}).first for i in range(300)]
    young = [e.persona_for(f"y{i}", {"sex": "F", "age": 8}).first for i in range(300)]
    hits = lambda names, pool: sum(n in pool for n in names)
    assert hits(old, {"Mary", "Dorothy", "Helen", "Betty", "Margaret"}) > 20
    assert hits(young, {"Mary", "Dorothy", "Helen", "Betty", "Margaret"}) < 5
    assert hits(young, {"Emma", "Olivia", "Ava", "Sophia", "Isabella"}) > 10
    assert hits(old, {"Emma", "Olivia", "Ava", "Sophia", "Isabella"}) < 5
    assert e.persona_for("m", {"sex": "M", "age": 40}).first in data.names().first_sex
    assert data.names().first_sex[e.persona_for("m", {"sex": "M", "age": 40}).first] == "M"


def test_coherence_chain():
    rows = {(r.zip, r.city, r.state) for r in data.personas()}
    e = engine()
    for i, attrs in enumerate(sample_attrs(100)):
        p = e.persona_for(f"c{i}", attrs)
        assert p.email == f"{p.first.lower()}.{re.sub('[^a-z]', '', p.last.lower())}@{p.email.split('@')[1]}"
        assert p.email.split("@")[1] in ("example.com", "example.org", "example.net")
        assert re.fullmatch(r"\((\d{3})\) 555-01\d\d", p.phone)
        assert p.phone[1:4] in AREA_CODES[p.state].split()
        assert (p.zip, p.city, p.state) in rows
        assert p.birth_year == 2025 - p.age


def test_email_domain_option_and_style():
    p = engine(email_domain="corp.test").persona_for("u", ATTRS)
    assert p.replace("CONTACT", "jdoe42@acme.com").endswith("@corp.test")
    out = engine().persona_for("u", ATTRS).replace("CONTACT", "jdoe42@acme.com")
    assert re.fullmatch(r"[a-z]+\d\d@example\.(com|org|net)", out)


def test_person_forms():
    p = engine().persona_for("u", ATTRS)
    assert p.replace("PERSON", "Jane Doe") == f"{p.first} {p.last}"
    assert p.replace("PERSON", "JANE DOE") == f"{p.first} {p.last}".upper()
    assert p.replace("PERSON", "Doe, Jane") == f"{p.last}, {p.first}"
    assert p.replace("PERSON", "Ms. Doe") == f"Ms. {p.last}"
    assert p.replace("PERSON", "J. Doe") == f"{p.first[0]}. {p.last}"
    assert p.replace("PERSON", "J.D.") == f"{p.first[0]}.{p.last[0]}."
    assert p.replace("PERSON", "Jane") == p.first
    assert p.replace("PERSON", "Dr. Jane A. Doe, Jr.") == f"Dr. {p.first} {p.middle[0]}. {p.last}, Jr."
    assert p.replace("PERSON", " Jane Doe's") == f" {p.first} {p.last}'s"


def test_phone_and_address_keep_layout():
    p = engine().persona_for("u", ATTRS)
    area = p.phone[1:4]
    line = p.phone[-4:]
    assert p.replace("CONTACT", "312-867-5309") == f"{area}-555-{line}"
    assert p.replace("CONTACT", "+1 (312) 867 5309") == f"+1 ({area}) 555 {line}"
    assert p.replace("ADDRESS", "60614") == p.zip
    assert re.fullmatch(rf"{p.zip}-\d{{4}}", p.replace("ADDRESS", "60614-1234"))
    out = p.replace("ADDRESS", "1428 Elm St Apt 4B, Chicago, IL 60614")
    assert out.startswith(p.street.rsplit(" ", 1)[0]) and re.search(r" Apt \d[A-Z],", out)
    assert out.endswith(f", {p.city}, {p.state} {p.zip}")
    assert p.replace("LOCATION", "Chicago, IL") == f"{p.city}, {p.state}"


def test_ids_keep_format_with_valid_checksums():
    e = engine()
    p = e.persona_for("u", ATTRS)
    for i in range(200):
        original = f"4{i:03d} 1111 2222 3333"
        card = e.replace("FINANCIAL", original)
        assert re.fullmatch(r"\d{4} \d{4} \d{4} \d{4}", card) and card.startswith("4111 11")
        assert luhn_ok(card.replace(" ", ""))
    amex = e.replace("FINANCIAL", "3782-822463-10005")
    assert re.fullmatch(r"3782-82\d{4}-\d{5}", amex) and luhn_ok(amex.replace("-", ""))
    assert luhn_ok(e.replace("ID", "79927398713"))  # a Luhn-valid id stays valid
    for i in range(200):
        ssn = e.replace("ID", f"{100 + i}-45-6789")
        m = re.fullmatch(r"(\d{3})-(\d{2})-(\d{4})", ssn)
        assert m and m[1].startswith("9") and 1 <= int(m[2]) <= 49 and m[3] != "0000"
    ident = p.replace("ID", "ACCT-88213")
    assert re.fullmatch(r"[A-Z]{4}-\d{5}", ident) and ident != "ACCT-88213"
    assert p.replace("ID", "ACCT-88213") == engine().replace("ID", "ACCT-88213")  # value-keyed


def test_value_keyed_replacements_are_injective():
    e = engine()
    outs = {e.replace("ID", f"{i:02d}") for i in range(100)}
    assert len(outs) == 100  # two-digit ids: the whole space, no collisions
    assert e.replace("ORG", "Acme Corp.") == e.replace("ORG", "Acme Corp.")
    assert e.replace("ORG", "Acme Corp.").endswith(" Corp.")


def test_network_uses_reserved_ranges():
    e = engine()
    assert re.fullmatch(r"(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+", e.replace("NETWORK", "10.1.2.3"))
    assert e.replace("NETWORK", "fe80::1ff:fe23:4567:890a").startswith("2001:db8:")
    mac = e.replace("NETWORK", "00:1A:2B:3C:4D:5E")
    assert re.fullmatch(r"([0-9A-F]{2}:){5}[0-9A-F]{2}", mac) and int(mac[:2], 16) & 0b11 == 0b10
    assert re.fullmatch(r"https://example\.(com|org|net)/.*", e.replace("NETWORK", "https://acme.com/u/1"))


def test_dates_shift_per_subject_preserving_gaps():
    for preset, limit in (("strict", 180), ("balanced", 30)):
        e = engine(preset)
        for i in range(50):
            p = e.persona_for(f"d{i}")
            assert 1 <= abs(p.shift_days) <= limit
            a = p.replace("DATE", "2004-03-03")
            b = p.replace("DATE", "June 1, 2004")
            gap = (date(2004, 6, 1) - date(2004, 3, 3)).days
            assert (datetime.strptime(b, "%B %d, %Y") - datetime.strptime(a, "%Y-%m-%d")).days == gap


@pytest.mark.parametrize("text,expected", [
    ("2004-03-03", "2004-03-13"),
    ("3/3/2004", "3/13/2004"),
    ("03/03/04", "03/13/04"),
    ("March 3, 2004", "March 13, 2004"),
    ("Wed, Mar. 3rd, 2004", "Sat, Mar. 13th, 2004"),
    ("3 MARCH 2004", "13 MARCH 2004"),
    ("2004-02-25T10:00:00Z", "2004-03-06T10:00:00Z"),
    ("Feb 25", "Mar 6"),
    ("25/12/2004", "04/01/2005"),
    ("seen 1/2/2004 and 1/9/2004", "seen 1/12/2004 and 1/19/2004"),
])
def test_date_formats_survive_the_shift(text, expected):
    assert shift_dates(text, 10)[0] == expected


def test_dates_without_a_date_are_kept_or_replaced():
    p = engine().persona_for("u")
    assert p.replace("DATE", "10:30 AM") == "10:30 AM"
    assert p.replace("DATE", "yesterday") == "yesterday"
    assert p.replace("DATE", "Q3 FY24") != "Q3 FY24"


def test_no_original_reaches_the_vault_or_persona(tmp_path):
    originals = ["Jennifer Quackenbush", "jq@zzmail.com", "user-7781", "(312) 867-5309",
                 "1428 Elm Street, Chicago, IL 60614", "123-45-6789", "4111 2222 3333 4444", "Quackco Inc."]
    e = PersonaEngine(vault=Vault(tmp_path / "v.db"))
    p = e.persona_for("user-7781", {"sex": "F", "age": 33, "zip": "60614", "name": "Jennifer Quackenbush"})
    outputs = [p.replace(c, t) for c, t in zip(
        ["PERSON", "CONTACT", "ID", "CONTACT", "ADDRESS", "ID", "FINANCIAL", "ORG"], originals)]
    e.replace("PERSON", "Jennifer Quackenbush")
    e.vault.close()
    blob = (tmp_path / "v.db").read_bytes().lower()
    for o in originals + ["quackenbush", "user-7781", "8675309", "zzmail"]:
        assert o.lower().encode() not in blob, o
    fields = " ".join(str(v) for v in vars(p).values()).lower()
    for out, o in zip(outputs, originals):
        assert out != o and o.lower() not in fields


def test_unknown_inputs_are_rejected():
    e = engine()
    with pytest.raises(ValueError):
        e.persona_for("u", {"gender": "F"})
    with pytest.raises(ValueError):
        e.persona_for("u").replace("EMAIL", "a@b.com")


def test_minors_and_missing_attrs():
    e = engine()
    kid = e.persona_for("kid", {"sex": "M", "age": 7, "state": "TX"})
    assert 5 <= kid.age <= 9 and kid.state == "TX" and kid.birth_year >= 2016
    anyone = e.persona_for("nobody")
    assert anyone.sex in ("F", "M") and anyone.state in AREA_CODES
    assert e.persona_for("by-name", {"name": "Margaret Smith"}).sex == "F"


def test_code_prefixes_are_format_and_digits_are_keyed_alone():
    e = engine()
    out = e.replace("ID", "CUS-575198")
    assert re.fullmatch(r"CUS-\d{6}", out) and out != "CUS-575198"
    assert out[4:] == e.replace("ID", "575198")                  # 'CUS-575198' joins a bare '575198'
    assert e.replace("ID", "ORD-575198")[4:] == out[4:]          # same digits, prefix kept apart
    assert e.replace("ID", "ORD-575198") != out
    assert re.fullmatch(r"T\d{5}", e.replace("ID", "T67592"))
    assert re.fullmatch(r"MRN 00\d{2}-\d{4}|MRN \d{4}-\d{4}", e.replace("ID", "MRN 0042-1234"))
    # Short or mixed-case codes and letters that could be a name are replaced whole, as before.
    for code, letters in (("jdoe1234", "jdoe"), ("LEE-20431", "LEE"), ("ACCT-123", "ACCT")):
        assert not e.replace("ID", code).startswith(letters)


def test_personas_without_an_age_are_adults():
    e = engine()
    ages = [e.persona_for(f"agent {i}", {"name": "Scarlet Hull"}).age for i in range(300)]
    assert min(ages) >= 18 and max(ages) <= 80
    assert len(set(ages)) > 30  # spread over the adult range, not one age
    assert e.persona_for("agent 0", {"name": "Scarlet Hull"}).age == ages[0]  # still deterministic
    assert e.persona_for("kid", {"age": 7}).age < 18  # a known age still wins


@pytest.mark.parametrize("stored, expected", [
    ("Mccormick", "McCormick"), ("Macdonald", "MacDonald"), ("Oconnor", "O'Connor"),
    ("Lopezsantiago", "Lopez-Santiago"), ("Machado", "Machado"), ("Mackey", "Mackey"), ("Ocampo", "Ocampo"),
    ("Woodward", "Woodward"), ("Beckmann", "Beckmann"), ("Greenhouse", "Greenhouse"), ("Smith", "Smith"),
])
def test_surnames_are_re_cased_at_load(stored, expected):
    names = data.names()
    assert expected in names.last[0] and (stored == expected or stored not in names.last[0])
    assert names.last_freq[stored] == names.last_freq[expected]  # looked up in either spelling


def test_personas_share_no_name_with_the_original():
    e = engine()
    for i in range(300):
        p = e.persona_for(f"s{i}", {"name": "James Smith", "sex": "M", "age": 40})
        assert p.first != "James" and p.last != "Smith"
    assert e.persona_for("s0", {"name": "James Smith"}).name == e.persona_for("s0").name  # first use wins


def test_initials_keep_their_shape():
    p = engine().persona_for("u", ATTRS)
    assert re.fullmatch(r"Mr [A-Z]\.[A-Z]\. \w+", p.replace("PERSON", "Mr C.A. Whomersley"))
    assert re.fullmatch(r"[a-z]\.[a-z]\. [a-z]+", p.replace("PERSON", "c.a. whomersley"))

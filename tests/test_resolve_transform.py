from datetime import date

import pytest

from maskara.detect import KnownValueDetector, KnownValues, RulesDetector, merge, repeats
from maskara.persona import PersonaEngine
from maskara.persona.formats import parse_date
from maskara.resolve import Resolver
from maskara.transform import Edit, Replacer, rebuild
from maskara.transform.columns import infer
from maskara.vault import Vault

C1, C2 = "subject:C1", "subject:C2"


def setup():
    k = KnownValues()
    k.add(C1, "name", "Maria Lopez")
    k.add(C1, "email", "mlopez@gmail.com")
    k.add(C2, "name", "Maria Chen")
    births = {C1: {date(1981, 4, 12)}}
    return k, Resolver(k, births)


def links(text, row=None):
    k, resolver = setup()
    spans = merge(RulesDetector().detect(text) + KnownValueDetector(k).detect(text, [row] if row else []))
    return {text[d.start:d.end]: link for d, link in zip(spans, resolver.link(text, spans, row))}


def test_ambiguous_first_name_prefers_the_rows_subject():
    assert links("Maria called again.", row=C2)["Maria"].subject == C2
    assert links("Maria called again.", row=C1)["Maria"].subject == C1
    # No row: a strong match in the same text decides.
    got = links("From mlopez@gmail.com: Maria called. Ms. Chen too.")
    assert got["Maria"].subject == C1 and got["mlopez@gmail.com"].how == "known"
    assert got["Chen"].subject == C2  # a title and a surname only one subject has


def test_birth_dates_are_marked_by_value_or_cue():
    got = links("Born 4/12/1981, she ordered on 5/1/2024.", row=C1)
    assert got["4/12/1981"].birth and got["4/12/1981"].subject == C1
    assert not got["5/1/2024"].birth and got["5/1/2024"].subject == C1
    assert links("DOB: 1/2/1990")["1/2/1990"].birth


def test_unlinked_names_cluster_across_texts():
    _, resolver = setup()
    texts = ["My friend Ana Garcia called.", "Ms. Garcia called back.", "Ana Garcia again. Thanks, Ana."]
    all_links = []
    for t in texts:
        spans = merge(RulesDetector().detect(t))
        all_links.append([(t[d.start:d.end], link) for d, link in zip(spans, resolver.link(t, spans, None))])
    Resolver.cluster([[link for _, link in ls] for ls in all_links])
    subjects = {span: link.subject for ls in all_links for span, link in ls}
    assert subjects["Ana Garcia"] == subjects["Garcia"] == subjects["Ana"] == "name:ana garcia"


def test_a_lone_first_name_links_to_its_only_subject_and_repeats_share_a_link():
    k, resolver = setup()
    k.add("subject:A2", "first_name", "Alexis")
    text = "Handled by Alexis. Ms. Lopez called; I told Lopez that Alexis would call back."
    spans = merge(RulesDetector().detect(text) + KnownValueDetector(k).detect(text))
    spans = merge(spans + repeats(text, spans))
    got = [(text[d.start:d.end], link) for d, link in zip(spans, resolver.link(text, spans, None))]
    assert {link.subject for name, link in got if name == "Alexis"} == {"subject:A2"}
    lopez = [link for name, link in got if name == "Lopez"]
    assert len(lopez) == 2 and lopez[0] is lopez[1]  # 'Lopez' after 'Ms. Lopez' takes the same link


def test_rebuild_reports_output_offsets():
    out, spans = rebuild("Hi Maria, call 555.", [Edit(3, 8, "Jessica"), Edit(15, 18, "1234")])
    assert out == "Hi Jessica, call 1234."
    assert [out[a:b] for a, b in spans] == ["Jessica", "1234"]
    with pytest.raises(ValueError):
        rebuild("abc", [Edit(0, 2, "x"), Edit(1, 3, "y")])


def test_cells_keep_types_and_birth_dates_stay_in_the_age_band():
    k, _ = setup()
    r = Replacer(PersonaEngine("balanced", Vault.from_seed("t")), {C1: {"age": 44, "sex": "F"}}, k)
    p = r.persona(C1)
    assert r.cell("age", 44, C1) == p.age and isinstance(r.cell("age", 44, C1), int)
    assert r.cell("first_name", "MARIA", C1) == p.first.upper()
    assert r.cell("keep", "Lamp", C1) == "Lamp" and r.cell("sex", "F", C1) == "F"
    assert r.cell("id", "CUS-1", C1) == r.cell("id", "CUS-1", C2) != "CUS-1"  # value-keyed: joins survive
    dob = r.cell("dob", "1981-04-12", C1)
    assert parse_date(dob).year == p.birth_year and 40 <= 2025 - p.birth_year <= 44
    assert r.cell("dob", date(1981, 4, 12), C1) == parse_date(dob)
    a, b = r.cell("date", "2024-01-01", C1), r.cell("date", "2024-03-01", C1)
    assert (parse_date(b) - parse_date(a)).days == 60  # gaps within a subject are exact


@pytest.mark.parametrize("header, values, role", [
    ("first", ["Maria"], "first_name"), ("customer_name", ["Maria Lopez", "John Smith"], "name"),
    ("name", ["Aurora 6-Cup Blender"], "keep"), ("product_name", ["Maria Lopez"], "keep"),
    ("note", [True, False], "keep"), ("phone", ["3128675309"], "phone"), ("zipcode", ["80216"], "zip"),
    ("placed", ["2024-01-02"], "date"), ("birth_date", ["1981-04-12"], "dob"), ("since", [2019], "keep"),
    ("card_last4", ["1234"], "financial"), ("x", ["a@b.com", "c@d.org"], "email"),
    ("body", ["hello there, this is a long message about my order that broke"], "text"),
    ("updated_at", ["2024-01-02T10:00:00Z"], "date"), ("gender", ["F"], "sex"), ("user_id", [17], "id"),
])
def test_column_roles(header, values, role):
    assert infer(header, values) == role


def test_a_title_sets_the_sex_of_a_name_no_table_knows():
    import maskara

    for title, sex in (("Mr", "M"), ("Mrs", "F")):
        r = maskara.mask(texts={"t": [f"{title} Lasse Lilja appealed."]}, vault=Vault.from_seed("t"), detector="rules")
        assert {p["sex"] for p in r._personas.values()} == {sex}

import pytest

from maskara.detect import Detection, KnownValueDetector, KnownValues, RulesDetector, merge, repeats
from maskara.detect.base import proper_noun


def found(text, detections=None):
    detections = merge(RulesDetector().detect(text) if detections is None else detections)
    return {(text[d.start:d.end], d.category, d.label) for d in detections}


def test_rules_find_shapes_and_validate_them():
    text = ("Mail maria.lopez88@gmail.com or support@lumengoods.com. Call (312) 867-5309, +1 312 867 5309 or "
            "312.867.5309. SSN 123-45-6789, not 666-12-3456. Card 4111 1111 1111 1111, not 4111 1111 1111 1112. "
            "Server 10.0.0.12. See https://example.org/a. Placed March 3, 2024; DOB: 04/12/1981. "
            "Ship to 1428 Oak Ridge Rd Apt 5B, Denver, CO 80216.")
    got = found(text)
    for expected in [("maria.lopez88@gmail.com", "CONTACT", "email"), ("(312) 867-5309", "CONTACT", "phone"),
                     ("+1 312 867 5309", "CONTACT", "phone"), ("312.867.5309", "CONTACT", "phone"),
                     ("123-45-6789", "ID", "ssn"), ("4111 1111 1111 1111", "FINANCIAL", "card_number"),
                     ("10.0.0.12", "NETWORK", "ip_address"), ("https://example.org/a", "NETWORK", "url"),
                     ("March 3, 2024", "DATE", "date"), ("04/12/1981", "DATE", "birth_date"),
                     ("1428 Oak Ridge Rd Apt 5B", "ADDRESS", "street_address"),
                     ("Denver, CO 80216", "ADDRESS", "place")]:
        assert expected in got
    spans = {s for s, _, _ in got}
    assert "666-12-3456" not in spans          # never-issued SSN area
    assert "4111 1111 1111 1112" not in spans  # fails Luhn
    assert not any("support@" in s for s in spans)  # a shared mailbox identifies no one


def test_urls_and_codes_are_taken_whole():
    got = found("Book at https://sportsevents.com/bookings?id=77&date=2024-08-15 now. Plan AET-8237-4916-75 on file.")
    assert ("https://sportsevents.com/bookings?id=77&date=2024-08-15", "NETWORK", "url") in got
    assert ("AET-8237-4916-75", "ID", "id") in got


def test_rule_names_skip_products_and_greetings():
    got = found("Thanks, OK. My friend Maria Garcia loves the Willow Baby Monitor and the Austin Travel Mug. "
                "Ms. Lopez agreed. Hi, this is Jordan.")
    names = {s for s, c, _ in got if c == "PERSON"}
    assert names == {"Maria Garcia", "Lopez", "Jordan"}
    assert not any(c == "LOCATION" for _, c, _ in got)  # 'Thanks, OK' is not a place in Oklahoma


def test_cue_rules():
    got = found("Account ID: ZPSSKNGUQR. pin is 488005. The password River2023! works. Swift BIC: GLNTUS2PQX5. "
                "| CVV Code | 569 | at 40.71278,-74.17379, application no. 36110/97. Password is strong.")
    assert {s for s, _, _ in got} == {"ZPSSKNGUQR", "488005", "River2023!", "GLNTUS2PQX5", "569",
                                      "40.71278,-74.17379"}  # ECHR numbers are a pack, not a core rule


def test_pattern_packs_and_user_patterns():
    text = "See application no. 36110/97 and EMP-20431, filed 12/97."
    assert "36110/97" not in {s for s, _, _ in found(text)}
    echr = found(text, RulesDetector("legal-echr").detect(text))
    assert ("36110/97", "ID", "case_number") in echr and "12/97" not in {s for s, _, _ in echr}
    mine = RulesDetector(["legal-echr", {"regex": r"\bEMP-(\d{5})\b", "label": "employee_id", "group": 1}])
    assert {("36110/97", "ID", "case_number"), ("20431", "ID", "employee_id")} <= found(text, mine.detect(text))
    for bad in ("no-such-pack", {"regex": "x", "category": "NAME"}, {"regex": "x", "group": 1}, {"label": "x"}):
        with pytest.raises(ValueError):
            RulesDetector(bad)


def known():
    k = KnownValues()
    k.add("subject:C1", "name", "Maria Lopez")
    k.add("subject:C1", "email", "MLopez@Gmail.com")
    k.add("subject:C1", "address", "1428 Elm St, Chicago, IL 60614")
    k.add("subject:C1", "city", "Austin")
    k.add("subject:C2", "first_name", "Maria")
    k.add("subject:C2", "id", "CUS-482193")
    return k


def test_known_values_strong_anywhere_weak_only_in_context():
    det = KnownValueDetector(known())
    text = "Lopez, Maria wrote from mlopez@gmail.com about 1428 Elm St. M. Lopez's order. Maria said hi."
    got = found(text, det.detect(text))
    assert {("Lopez, Maria", "PERSON", "full_name"), ("mlopez@gmail.com", "CONTACT", "email"),
            ("1428 Elm St", "ADDRESS", "street_address"), ("M. Lopez", "PERSON", "full_name"),
            ("Maria", "PERSON", "first_name")} <= got  # 'Maria' alone: C1 is in context via strong matches
    # Without a strong match or row subject, a lone first name is not enough.
    assert det.detect("Maria said hi.") == []
    assert found("Maria said hi.", det.detect("Maria said hi.", ["subject:C2"])) == {
        ("Maria", "PERSON", "first_name")}
    # Weak values need a capital and no attached capitalized word.
    text = "maria said hi. Maria Garcia too. The Austin Travel Mug."
    assert det.detect(text, ["subject:C1", "subject:C2"]) == []
    # Ids match inside a prefixed form, so the digits join with the table's id.
    text = "ref CUS-482193."
    assert found(text, det.detect(text)) == {("CUS-482193", "ID", "id")}


def test_known_first_names_match_alone_where_they_read_as_names():
    k = KnownValues()
    k.add("subject:A2", "first_name", "Alexis")
    k.add("subject:C7", "first_name", "Hope")
    k.add("subject:C8", "first_name", "May")
    det = KnownValueDetector(k)
    text = ("Handled by Alexis. Refund sent. -Alexis\nHope you are well. Alexis will call back in May.\n"
            "Thanks,\nHope\nThe Alexis Lamp is sold out.")
    got = [(text[d.start:d.end], d.start, d.score) for d in det.detect(text)]
    # Mid-sentence and signatures match, below the score of an in-context match; a sentence-initial
    # 'Hope' or 'Alexis' followed by more words, a month, and a product name do not.
    assert got == [("Alexis", 11, 0.7), ("Alexis", 33, 0.7), ("Hope", text.index("Hope\nThe"), 0.7)]
    assert [d.score for d in det.detect("Handled by Alexis.", ["subject:A2"])] == [0.8]


def test_proper_noun_reads_capitalization_in_context():
    for text, word, expected in [("Handled by Alexis.", "Alexis", True), ("Closed. -Alexis\nOrder 1.", "Alexis", True),
                                 ("Hope you are well.", "Hope", False), ("Fine. Hope so.", "Hope", False),
                                 ("Thanks,\nHope", "Hope", True), ("handled by alexis", "alexis", False)]:
        start = text.index(word)
        assert proper_noun(text, start, start + len(word)) is expected, text


def test_repeats_find_every_occurrence_of_a_detected_value():
    text = ("Caller: 3780\nRep: Refunded to your card ending in 3780. Not 37801 or 3780-12. Ms. Saleh agreed.\n"
            "Saleh asked for a receipt; I said Saleh would get one. Ref CUS-575198 (see CUS-575198).")
    spans = merge(RulesDetector().detect(text))
    more = repeats(text, spans)
    got = {(text[d.start:d.end], d.start, d.category, d.label) for d in more}
    assert ("3780", 8, "FINANCIAL", "card_last4") in got  # the bare answer gets the card's detection
    assert ("Saleh", text.index("I said Saleh") + 7, "PERSON", "person") in got
    assert ("CUS-575198", text.rindex("CUS-575198"), "ID", "id") not in got  # already found by the rule
    product = "Ms. Austin bought the Austin Travel Mug on Austin Street."
    assert repeats(product, merge(RulesDetector().detect(product))) == []
    halves = "Veenaben Saleh: hi!\nThanks, Ms. Saleh. Hi Joseph, says Joseph Banter."
    names = [halves[d.start:d.end] for d in repeats(halves, merge(RulesDetector().detect(halves)))]
    assert names == ["Veenaben Saleh", "Joseph Banter"]  # no half of a full name stays behind
    values = [v for v, *_ in got]
    assert values.count("3780") == 1         # not inside 37801 or 3780-12
    assert values.count("Saleh") == 1        # 'Saleh asked' opens a sentence: not taken from the repeat
    assert all(d not in spans for d in more)
    assert merge(spans + more) == sorted(merge(spans + more), key=lambda d: d.start)


def test_merge_is_deterministic_and_prefers_score_then_length():
    a = Detection(0, 5, "PERSON", "first_name", 0.8, "known")
    b = Detection(0, 11, "PERSON", "person", 0.6, "rules")
    c = Detection(6, 11, "PERSON", "last_name", 0.8, "gliner2")
    d = Detection(0, 11, "PERSON", "full_name", 0.8, "gliner2")
    assert merge([a, b, c, d]) == merge([d, c, b, a]) == [d]
    assert merge([a, b, c]) == [a, c]


def test_model_selection_and_label_mapping(monkeypatch):
    from maskara.detect import NO_MODEL_NOTICE, models, models_for

    monkeypatch.setattr(models, "available", lambda name: False)
    assert models_for("auto") == ([], NO_MODEL_NOTICE)
    assert models_for("rules") == ([], None)
    with pytest.raises(ImportError, match="maskara\\[gliner\\]"):
        models_for("gliner2")

    class Fake:
        def extract_entities_long(self, text, labels, **kw):
            return {"entities": {"date_of_birth": [{"start": 4, "end": 12, "confidence": 0.9}],
                                 "full_name": [{"start": 13, "end": 18, "confidence": 0.8}]}}

    monkeypatch.setattr(models, "_gliner2", lambda: Fake())
    got = models.GLiNER2Detector().detect("DOB 1/2/1990 Maria")
    assert [(d.category, d.label, d.detector) for d in got] == [("DATE", "birth_date", "gliner2"),
                                                                ("PERSON", "full_name", "gliner2")]


def test_titled_names_are_taken_whole_with_initials():
    got = found("Mr Lasse Lilja and Mr C.A. Whomersley met Ms. Lopez on Dr. Smith Street. Thank you, Mr. Y. What next?")
    names = {s for s, c, _ in got if c == "PERSON"}
    assert {"Lasse Lilja", "C.A. Whomersley", "Lopez", "Smith"} <= names
    assert not any("What" in s for s in names)  # one initial and a space may end a sentence


def test_model_person_spans_before_a_product_word_are_dropped():
    from maskara.detect.models import not_a_product

    text = "Michael Kors Jacket for John Smith Jr. and Maria Lopez Garcia."
    span = lambda s: Detection(text.index(s), text.index(s) + len(s), "PERSON", "person", 0.9, "gliner2")
    assert not not_a_product(text, span("Michael Kors"))
    assert not_a_product(text, span("John Smith")) and not_a_product(text, span("Maria Lopez"))

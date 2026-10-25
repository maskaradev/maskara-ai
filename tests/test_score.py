from maskara.bench.score import score
from maskara.bench.types import Document, Edit, Span, make_output

TEXT = "Anna Berg met Tom Holt on 3 March 2004. Later Anna Berg called Tom Holt."
#       0    5         14  18     26             41         52         63  67


def _doc() -> Document:
    spans = [
        Span(0, 9, "PERSON", "PERSON", "direct", "anna"),
        Span(14, 22, "PERSON", "PERSON", "direct", "tom"),
        Span(26, 38, "DATETIME", "DATE", "quasi", "d1"),
        Span(46, 55, "PERSON", "PERSON", "direct", "anna"),
        Span(63, 71, "PERSON", "PERSON", "direct", "tom"),
    ]
    assert [TEXT[s.start:s.end] for s in spans] == ["Anna Berg", "Tom Holt", "3 March 2004", "Anna Berg",
                                                      "Tom Holt"]
    return Document("d", TEXT, {"a": spans})


def _run(replacements: dict[int, str]) -> dict:
    doc = _doc()
    spans = doc.annotations["a"]
    edits = [Edit(spans[i].start, spans[i].end, r) for i, r in replacements.items()]
    return score([doc], {"d": make_output(doc.text, edits)})


def test_no_edits_leaks_everything():
    r = _run({})
    assert r["privacy"]["direct"]["leak_full"] == 1.0
    assert r["privacy"]["direct"]["entity_leak"] == 1.0
    assert r["fidelity"]["consistency"] is None


def test_redaction_hides_but_merges_people():
    r = _run({0: "[PERSON]", 1: "[PERSON]", 2: "[DATE]", 3: "[PERSON]", 4: "[PERSON]"})
    assert r["privacy"]["direct"]["leak_full"] == 0.0
    assert r["fidelity"]["placeholder"] == 1.0
    assert r["fidelity"]["consistency"] == 1.0
    assert r["fidelity"]["distinctness"] < 0.7  # Anna and Tom collapse into one [PERSON]


def test_random_fakes_break_consistency():
    r = _run({0: "Kim Lee", 1: "Bo Park", 2: "9 May 2001", 3: "Ana Ruiz", 4: "Ed Fox"})
    assert r["fidelity"]["distinctness"] == 1.0
    assert r["fidelity"]["consistency"] < 0.8


def test_consistent_personas_score_both():
    r = _run({0: "Kim Lee", 1: "Bo Park", 2: "9 March 2004", 3: "Kim Lee", 4: "Bo Park"})
    assert r["fidelity"]["consistency"] == 1.0
    assert r["fidelity"]["distinctness"] == 1.0
    assert r["fidelity"]["placeholder"] == 0.0
    # The date shift keeps "March" and "2004": a partial leak of a quasi identifier, by design.
    assert r["privacy"]["quasi"]["leak_partial"] == 1.0
    assert r["privacy"]["direct"]["leak_full"] == 0.0


def test_keeping_a_first_name_is_a_partial_leak():
    r = _run({0: "Anna Lund", 1: "Bo Park", 3: "Anna Lund", 4: "Bo Park"})
    assert r["privacy"]["direct"]["leak_partial"] == 0.5
    assert r["privacy"]["direct"]["leak_full"] == 0.0


def test_over_masking_counts_words_outside_gold():
    doc = _doc()
    edits = [Edit(10, 13, "[X]")]  # "met"
    r = score([doc], {"d": make_output(doc.text, edits)})
    assert r["fidelity"]["over_masking"] > 0


def test_a_kept_title_is_not_a_leak():
    text = "Mr Anna Berg spoke."
    doc = Document("d", text, {"a": [Span(0, 12, "PERSON", "PERSON", "direct", "anna")]})
    r = score([doc], {"d": make_output(text, [Edit(3, 12, "<PERSON>")])})
    assert r["privacy"]["direct"]["leak_partial"] == 0.0
    assert r["privacy"]["direct"]["leak_full"] == 0.0


def _two_docs(scope: str | None) -> list[Document]:
    meta = {"entity_scope": scope} if scope else {}
    spans = [Span(0, 9, "PERSON", "PERSON", "direct", "anna")]
    return [Document("d1", "Anna Berg wrote.", {"a": spans}, meta),
            Document("d2", "Anna Berg called.", {"a": spans}, meta)]


def _score_two(scope: str | None, names: tuple[str, str], keep_second: bool = False) -> dict:
    docs = _two_docs(scope)
    outputs = {d.id: make_output(d.text, [] if keep_second and d.id == "d2" else [Edit(0, 9, name)])
               for d, name in zip(docs, names)}
    return score(docs, outputs)


def test_a_name_that_changes_between_documents_is_inconsistent_in_corpus_scope():
    r = _score_two("corpus", ("Kim Lee", "Bo Park"))
    assert r["fidelity"]["consistency"] == 0.5
    assert _score_two("corpus", ("Kim Lee", "Kim Lee"))["fidelity"]["consistency"] == 1.0


def test_document_scope_does_not_pair_across_documents():
    # Ids like Nemotron-PII's "category:surface" repeat across unrelated documents.
    assert _score_two(None, ("Kim Lee", "Bo Park"))["fidelity"]["consistency"] == 1.0


def test_corpus_scope_merges_different_people_with_one_placeholder():
    docs = [Document("d1", "Anna Berg wrote.", {"a": [Span(0, 9, "PERSON", "PERSON", "direct", "anna")]},
                     {"entity_scope": "corpus"}),
            Document("d2", "Tom Holt called.", {"a": [Span(0, 8, "PERSON", "PERSON", "direct", "tom")]},
                     {"entity_scope": "corpus"})]
    outputs = {d.id: make_output(d.text, [Edit(0, d.annotations["a"][0].end, "[PERSON]")]) for d in docs}
    assert score(docs, outputs)["fidelity"]["distinctness"] == 0.5
    for d in docs:
        d.meta.clear()
    assert score(docs, outputs)["fidelity"]["distinctness"] == 1.0


def test_corpus_scope_counts_an_entity_once_across_documents():
    r = _score_two("corpus", ("Kim Lee", ""), keep_second=True)
    assert r["privacy"]["direct"]["entity_leak"] == 1.0  # one entity, leaked in d2
    assert _score_two(None, ("Kim Lee", ""), keep_second=True)["privacy"]["direct"]["entity_leak"] == 0.5


def test_format_scaffolding_a_surrogate_writes_back_is_not_a_leak():
    text = "Mail wburns11@gmail.com or visit 134 Legacy Way."
    doc = Document("d", text, {"a": [Span(5, 23, "email", "CONTACT", "direct", "e"),
                                     Span(33, 47, "street_address", "ADDRESS", "direct", "s")]})
    assert text[5:23] == "wburns11@gmail.com" and text[33:47] == "134 Legacy Way"
    r = score([doc], {"d": make_output(text, [Edit(5, 23, "lwang46@example.com"), Edit(33, 47, "9246 Maple Way")])})
    assert r["privacy"]["direct"]["leak_partial"] == 0.0
    kept_domain = score([doc], {"d": make_output(text, [Edit(5, 13, "lwang46"), Edit(33, 47, "9246 Maple Way")])})
    assert kept_domain["privacy"]["direct"]["leak_partial"] == 0.5  # "gmail" survives


def test_a_leading_record_code_is_not_a_leak_but_the_rest_is():
    text = "Order ORD-8713039 for 1-667-604-1966, policy AET-8237-4916-75."
    spans = [Span(6, 17, "order_id", "ID", "direct", "o"), Span(22, 36, "phone", "CONTACT", "direct", "p"),
             Span(45, 61, "health_plan", "ID", "direct", "h")]
    assert [text[s.start:s.end] for s in spans] == ["ORD-8713039", "1-667-604-1966", "AET-8237-4916-75"]
    doc = Document("d", text, {"a": spans})
    edits = [Edit(10, 17, "5924532"), Edit(22, 36, "1-619-555-0193"), Edit(45, 53, "VAD-5266")]
    r = score([doc], {"d": make_output(text, edits)})
    assert r["privacy"]["direct"]["leak_partial"] == round(1 / 3, 4)  # only the policy number keeps "4916-75"

"""`maskara.mask()`: tables and free text in, the same data with every person swapped for a persona out.

    import maskara

    result = maskara.mask(
        tables={"customers": "customers.csv", "orders": orders_rows},
        texts={"notes": ["Maria Lopez called about order 1234567 ..."]},
        subjects={"customers": "customer_id", "orders": "customer_id"},
        preset="balanced",
        vault=".maskara/vault.db",   # None: consistent within this call only
    )
    result.tables["customers"]   # same type as the input: list of dicts, DataFrame, ...
    result.texts["notes"]        # list of str
    result.mentions              # audit record, no original values (see `Mention`)
    result.report.summary()      # privacy and fidelity numbers (see `maskara.report`)

Pipeline: infer column roles -> collect subjects and their known values from tables -> detect spans
in text (rules + known values + optional model, then every repeat of a detected value) -> resolve each span to a subject -> replace from
that subject's persona -> measure the result against the originals still in memory (the report).
Any failure raises; nothing partial is returned.
"""

from __future__ import annotations

import os
import tempfile
import warnings
from collections import Counter
from collections.abc import Mapping
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .detect import KnownValueDetector, KnownValues, RulesDetector, merge, models_for, repeats
from .detect.models import not_a_product
from .persona import PersonaEngine
from .persona.formats import parse_date
from .report import Report, Run, build
from .resolve import PERSON_BOUND, Link, Resolver, subject_key
from .sources import TEXT, Source, load_table, load_texts, restore, write
from .transform import ROLE_CATEGORY, ROLES, Edit, Replacer, infer, missing, rebuild
from .vault import Vault

SAMPLE_ROWS = 200  # rows read per column to infer its role
KNOWN_ROLES = ("name", "first_name", "last_name", "email", "phone", "address", "zip", "city", "id", "financial")
ATTR_ROLES = {"name": "name", "sex": "sex", "age": "age", "dob": "birth_date", "state": "state", "zip": "zip",
              "city": "city"}
ATTR_HEADERS = ("education", "occupation")  # kept as is, but they condition the persona under max_utility
PERSONA_FIELDS = ("name", "sex", "age", "email", "phone", "street", "city", "state", "zip", "occupation")


class MaskingError(RuntimeError):
    """Masking failed part way; no output was produced."""


class MaskaraNotice(UserWarning):
    """Something the user should know about the run that does not stop it (e.g. no model installed)."""


@dataclass(frozen=True)
class Mention:
    """One replaced value: where it was, what it was, whose it was, and what it became.

    Holds no original value, so it can be stored and shared with the masked data. Offsets let a
    holder of the original data recompute anything else (the report module does this locally).

    source        input name, as given in `tables=` or `texts=`
    row           0-based row (or text) index in that input
    column        column name; 'text' for a text collection's strings
    start, end    code-point offsets of the original span within the original cell text;
                  None when the whole cell was replaced by its column role
    out_start, out_end
                  the same span in the masked cell text (None for whole cells)
    category      PERSON, CONTACT, ADDRESS, LOCATION, DATE, ID, FINANCIAL, ... (`bench.types.Category`)
    label         the detector's label ('email', 'first_name', 'birth_date') or the column role
    detector      'column', 'known', 'rules', or a model name
    score         detector confidence, 1.0 for columns and exact known values
    persona       opaque persona id of the person the value belongs to (for an id: the person whose
                  row or text it is in), or None when nobody is known
    link          how the owner was found: 'row' (the row's subject column), 'known' (a value from
                  the tables), 'context' (the only person in that text), 'name' (clustered by name
                  within a document, provisionally), 'value' (no owner)
    changed       False when the policy keeps the value (a state the preset preserves, a country)
    replacement   the text written in its place (also present in the output itself)
    resolution    resolved | provisional | ambiguous | unresolved | not_applicable;
                  evidence states, not calibrated confidence or proof of identity
    evidence      fixed reason codes, never original values or subject keys
    candidate_count
                  number of candidates considered, without exposing their identities
    """

    source: str
    row: int
    column: str
    start: int | None
    end: int | None
    out_start: int | None
    out_end: int | None
    category: str
    label: str
    detector: str
    score: float
    persona: str | None
    link: str
    changed: bool
    replacement: str
    resolution: str = "not_applicable"
    evidence: tuple[str, ...] = ()
    candidate_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class MaskResult:
    tables: dict[str, object]
    texts: dict[str, object]
    mentions: list[Mention]
    columns: dict[str, dict[str, str]]  # input -> column -> role used
    detectors: list[str]
    notices: list[str]
    preset: str
    report: Report | None = None
    _sources: list[Source] = field(default_factory=list, repr=False)  # originals, in memory only
    _personas: dict[str, dict] = field(default_factory=dict, repr=False)  # persona id -> synthetic fields
    _subjects: dict[str, str] = field(default_factory=dict, repr=False)   # input -> its subject column

    @property
    def review(self) -> list[dict]:
        """Identity decisions requiring review: locations and reason codes, no input values.

        Pending decisions still receive replacements. This is a review queue, not an
        approval workflow or a claim that released output is safe.
        """
        return [{k: getattr(m, k) for k in ("source", "row", "column", "start", "end", "category",
                                           "resolution", "evidence", "candidate_count")}
                for m in self.mentions if m.resolution in ("ambiguous", "unresolved", "provisional")]

    def summary(self) -> dict:
        changed = [m for m in self.mentions if m.changed]
        people = [m for m in self.mentions if m.category == "PERSON" and m.start is not None]
        return {
            "preset": self.preset,
            "detectors": self.detectors,
            "rows": {s.name: len(s.rows) for s in self._sources},
            "replaced": len(changed),
            "kept_by_policy": len(self.mentions) - len(changed),
            "by_category": dict(sorted(Counter(m.category for m in changed).items())),
            "by_detector": dict(sorted(Counter(m.detector for m in changed).items())),
            "personas": len({m.persona for m in self.mentions if m.persona}),
            "identity_review": len(self.review),
            "text_names_linked_to_tables": round(sum(m.resolution == "resolved" and m.link in ("row", "known")
                                                       for m in people) / len(people), 4)
            if people else None,
        }

    def save(self, out: str | os.PathLike) -> list[Path]:
        """Write every masked input, `mentions.jsonl`, `review.json`, and the
        report as `report.json` and `report.html`.

        Files are written to a temporary directory first and moved into `out` only when all of them
        were written, so a failure leaves no half-written output behind.
        """
        import json

        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        written = []
        with tempfile.TemporaryDirectory(dir=out, prefix=".maskara-") as tmp:
            staged = []
            for src in self._sources:
                masked = (self.tables if src.kind == "table" else self.texts)[src.name]
                staged.append(write(src, masked, Path(tmp)))
            names = [p.name for p in staged]
            if len(set(names)) != len(names):
                raise ValueError(f"two inputs would be written to the same file name: {sorted(names)}")
            reserved = {"mentions.jsonl", "review.json", "report.json", "report.html"}
            if collisions := set(names) & reserved:
                raise ValueError(f"input output names conflict with audit files: {sorted(collisions)}")
            mentions = Path(tmp) / "mentions.jsonl"
            with mentions.open("w", encoding="utf-8") as f:
                for m in self.mentions:
                    f.write(json.dumps(m.to_dict(), ensure_ascii=False) + "\n")
            staged.append(mentions)
            review = Path(tmp) / "review.json"
            review.write_text(json.dumps({"schema": "maskara.identity-review/1", "items": self.review},
                                         indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            staged.append(review)
            if self.report is not None:
                staged.append(Path(tmp) / "report.json")
                self.report.to_json(staged[-1])
                staged.append(Path(tmp) / "report.html")
                self.report.to_html(staged[-1])
            for path in staged:
                target = out / path.name
                os.replace(path, target)
                written.append(target)
        return written


def mask(
    tables: Mapping[str, object] | None = None,
    texts: Mapping[str, object] | None = None,
    *,
    subjects: Mapping[str, str | tuple[str, str]] | None = None,
    preset: str = "balanced",
    vault: str | os.PathLike | Vault | None = None,
    detector: object = "auto",
    columns: Mapping[str, Mapping[str, str]] | None = None,
    namespace: str = "default",
    email_domain: str | None = None,
    patterns: object = None,
) -> MaskResult:
    """Mask `tables` and `texts` together, so one person is one persona across all of them.

    subjects  input name -> the column holding the person's key, e.g. {"orders": "customer_id"}.
              Rows of different inputs with the same key value are the same person. Use a
              (column, scope) pair when two inputs' keys could collide but mean different people
              ({"staff": ("id", "staff")}). A text collection given as JSONL objects can have one too.
    preset    'strict' | 'balanced' | 'max_utility' (see `maskara.persona.presets`)
    vault     path to a vault file (created with a 0600 key file next to it), a `Vault`, or None
              for an ephemeral key: personas then differ on the next run
    detector  'auto' | 'rules' | 'gliner2' | 'opf' | a Detector | a list of them (`maskara.detect`)
    columns   input name -> {column: role} to override inferred roles; roles are in
              `maskara.transform.ROLES` ('keep' leaves a column alone, 'text' masks free text)
    patterns  extra identifier formats for the rules: a pack name ('legal-echr'), a `Pattern`, a
              {"regex", "category", "label", "score", "group"} mapping, or a list of them
              (see `maskara.detect.packs`)

    Raises ValueError/TypeError for bad arguments and MaskingError if masking itself fails.
    """
    sources = [load_table(n, o) for n, o in (tables or {}).items()] + \
        [load_texts(n, o) for n, o in (texts or {}).items()]
    _check(sources, subjects or {}, columns or {})
    if isinstance(vault, (str, os.PathLike)):
        vault = Vault(vault)
    engine = PersonaEngine(preset, vault, namespace=namespace, email_domain=email_domain)
    rules = RulesDetector(patterns)
    models, notice = models_for(detector)
    notices = [notice] if notice else []
    if notice:
        warnings.warn(notice, MaskaraNotice, stacklevel=2)
    try:
        return _run(sources, subjects or {}, columns or {}, engine, rules, models, notices)
    except Exception as e:
        raise MaskingError(f"masking failed, no output produced: {type(e).__name__}: {e}") from e


def _check(sources: list[Source], subjects: Mapping, columns: Mapping) -> None:
    names = [s.name for s in sources]
    if len(set(names)) != len(names):
        raise ValueError(f"input names must be unique across tables and texts: {names}")
    by_name = {s.name: s for s in sources}
    for name, spec in {**subjects, **columns}.items():
        if name not in by_name:
            raise ValueError(f"{name!r} is not one of the inputs {names}")
    for name, spec in subjects.items():
        column = spec if isinstance(spec, str) else spec[0]
        if column not in by_name[name].columns:
            raise ValueError(f"subject column {column!r} not found in {name!r} (columns: {by_name[name].columns})")
    for name, overrides in columns.items():
        for column, role in overrides.items():
            if role not in ROLES:
                raise ValueError(f"unknown role {role!r} for {name}.{column}; roles: {', '.join(ROLES)}")


def _roles(sources: list[Source], subjects: Mapping, columns: Mapping) -> dict[str, dict[str, str]]:
    roles: dict[str, dict[str, str]] = {}
    for src in sources:
        overrides = columns.get(src.name, {})
        key = _subject_spec(subjects.get(src.name))[0]
        roles[src.name] = {}
        for col in src.columns:
            forced = "id" if col == key else "text" if src.kind == "texts" and col == TEXT else None
            values = [r.get(col) for r in src.rows[:SAMPLE_ROWS]]
            roles[src.name][col] = overrides.get(col) or forced or infer(col, values)
    # A column whose values all appear in some id column is a foreign key: mask it the same way.
    ids = {str(r.get(c)) for s in sources for c, role in roles[s.name].items() if role == "id"
           for r in s.rows if not missing(r.get(c))}
    for src in sources:
        for col, role in roles[src.name].items():
            values = [r.get(col) for r in src.rows if not missing(r.get(col))]
            if role == "keep" and col not in columns.get(src.name, {}) and values and \
                    not any(isinstance(v, bool) for v in values) and all(str(v) in ids for v in values):
                roles[src.name][col] = "id"
    return roles


def _subject_spec(spec) -> tuple[str | None, str]:
    if spec is None:
        return None, ""
    return (spec, "") if isinstance(spec, str) else (spec[0], spec[1])


def _run(sources, subjects, columns, engine, rules, models, notices) -> MaskResult:
    roles = _roles(sources, subjects, columns)
    known, attrs, births = KnownValues(), {}, {}
    row_subjects: dict[str, list[str | None]] = {}
    row_links: dict[str, list[Link]] = {}
    # Subject key value -> subject, so a row's other keys (the ticket's agent) can be recognized.
    keys_of: dict[str, set[str]] = {}
    for s in sources:
        column, scope = _subject_spec(subjects.get(s.name))
        for r in s.rows if column else ():
            if not missing(r.get(column)):
                keys_of.setdefault(str(r[column]), set()).add(subject_key(r[column], scope))
    # Raw keys colliding across declared scopes cannot infer a foreign-key owner.
    key_of = {value: next(iter(keys)) for value, keys in keys_of.items() if len(keys) == 1}

    def collect(src: Source, i: int, subject: str, *, index: bool = True) -> None:
        row, r = src.rows[i], roles[src.name]
        a = attrs.setdefault(subject, {})
        if full := _full_name(row, r):
            if index:
                known.add(subject, "name", full)
            a.setdefault("name", full)  # the whole name, so the persona can avoid both parts
        for col, value in row.items():
            role = r.get(col)
            if missing(value) or isinstance(value, bool):
                continue
            # A key of another subject in this row (a referral, the assigned agent) is not this person's.
            if index and role in KNOWN_ROLES and (str(value) not in keys_of or subject in keys_of[str(value)]):
                known.add(subject, role, value)
            if role in ATTR_ROLES or col.lower() in ATTR_HEADERS:
                attr = ATTR_ROLES.get(role, col.lower())
                value = parse_date(str(value)) if attr == "birth_date" else value
                if attr == "age":
                    value = int(value) if str(value).isdigit() else None
                if value is not None:
                    a.setdefault(attr, value)
            if role in ("first_name", "last_name") and "name" not in a:
                a["name"] = str(value)
            if role == "dob" and (day := parse_date(str(value))):
                births.setdefault(subject, set()).add(day)

    # Inputs with a subject column first, so their known values can link the rest.
    for src in sources:
        column, scope = _subject_spec(subjects.get(src.name))
        if column:
            keys = [None if missing(r.get(column)) else subject_key(r.get(column), scope) for r in src.rows]
            row_subjects[src.name] = keys
            row_links[src.name] = [Link(key, "row", evidence=("subject_key" if key else "missing_subject_key",),
                                       candidates=(key,) if key else ()) for key in keys]
            for i, key in enumerate(keys):
                if key:
                    collect(src, i, key)
    for src in sources:
        if src.name in row_subjects:
            continue
        decisions = []
        for i, row in enumerate(src.rows):
            link = _row_subject(row, roles[src.name], known)
            if link.resolution == "unresolved" and any(roles[src.name].get(c) in
                    ("name", "first_name", "last_name", "email", "phone") and not missing(v)
                    for c, v in row.items()):
                # Keep the fields of this row coherent, without equating equal names across rows.
                link = Link(f"row:{src.name}:{i}", "row", resolution="provisional", evidence=("row_only",))
            decisions.append(link)
        row_links[src.name] = decisions
        row_subjects[src.name] = [link.subject for link in decisions]

    # Inferred rows must not change the evidence used to infer later rows.
    for src in sources:
        if _subject_spec(subjects.get(src.name))[0]:
            continue
        for i, link in enumerate(row_links[src.name]):
            if link.subject:
                collect(src, i, link.subject, index=False)

    # Detect and link every free-text cell, then group provisional names within each cell.
    finder, resolver = KnownValueDetector(known), Resolver(known, births)
    found: dict[tuple[str, int, str], tuple[list, list[Link]]] = {}
    for src in sources:
        text_cols = [c for c, role in roles[src.name].items() if role == "text"]
        for i, row in enumerate(src.rows):
            subject = row_subjects[src.name][i]
            others = sorted({key_of[str(v)] for c, v in row.items() if roles[src.name].get(c) == "id"
                             and str(v) in key_of} - {subject})
            for col in text_cols:
                text = row.get(col)
                if not isinstance(text, str) or not text.strip():
                    continue
                spans = rules.detect(text) + finder.detect(text, ([subject] if subject else []) + others)
                for m in models:
                    spans += [d for d in m.detect(text) if not_a_product(text, d)]
                spans = merge(spans)
                spans = merge(spans + repeats(text, spans))
                found[(src.name, i, col)] = (spans, resolver.link(text, spans, subject, others))
    Resolver.cluster([links for _, links in found.values()], [repr(key) for key in found])
    provisional = {link.subject for links in row_links.values() for link in links
                   if link.subject and link.resolution == "provisional"}
    for _, links in found.values():
        for link in links:
            if link.subject in provisional:
                link.resolution = "provisional"
                link.evidence += ("row_only",)

    replacer = Replacer(engine, attrs, known)
    mentions: list[Mention] = []
    out: dict[str, list[dict]] = {}
    for src in sources:
        rows = []
        for i, row in enumerate(src.rows):
            subject, new = row_subjects[src.name][i], {}
            for col, value in row.items():
                role = roles[src.name].get(col, "keep")
                if (src.name, i, col) in found:
                    new[col] = _mask_text(value, *found[(src.name, i, col)], replacer, src.name, i, col, mentions)
                    continue
                new[col] = replacer.cell(role, value, subject)
                if role in ROLE_CATEGORY and not missing(value) and not isinstance(value, bool):
                    # A key of another subject (the ticket's agent) belongs to that subject, not the row's.
                    owner = key_of.get(str(value), subject) if role == "id" else subject
                    persona = replacer.persona(owner).id if owner else None
                    decision = row_links[src.name][i]
                    mentions.append(Mention(src.name, i, col, None, None, None, None, ROLE_CATEGORY[role], role,
                                            "column", 1.0, persona, "row" if persona else "value", new[col] != value,
                                            str(new[col]),
                                            decision.resolution if ROLE_CATEGORY[role] in PERSON_BOUND
                                            else "not_applicable", decision.evidence, len(decision.candidates)))
            rows.append(new)
        out[src.name] = rows

    detectors = ["rules", "known"] + [m.name for m in models]
    report = build(Run(sources, out, mentions, roles), preset=engine.preset.name, detectors=detectors)
    personas = {p.id: {f: getattr(p, f) for f in PERSONA_FIELDS} for p in replacer.personas()}
    return MaskResult(
        tables={s.name: restore(s, out[s.name]) for s in sources if s.kind == "table"},
        texts={s.name: restore(s, out[s.name]) for s in sources if s.kind == "texts"},
        mentions=mentions, columns=roles, detectors=detectors, notices=notices, preset=engine.preset.name,
        report=report, _sources=sources, _personas=personas,
        _subjects={n: _subject_spec(spec)[0] for n, spec in subjects.items()},
    )


def _row_subject(row: dict, roles: dict[str, str], known: KnownValues) -> Link:
    """Intersect every known identity field; conflicting fields must not win by column order."""
    candidates = []
    values = [(roles.get(c), v) for c, v in row.items() if not missing(v)]
    if full := _full_name(row, roles):
        values.append(("name", full))
    for role, value in values:
        if role not in ("email", "phone", "name"):
            continue
        text = str(value)
        hits = known.phone(text) if role == "phone" else {
            k.subject for k in known.lookup(text) if k.strong and k.role == role}
        if hits:
            candidates.append(hits)
    if not candidates:
        return Link(None, "value", evidence=("no_known_owner",))
    common = set.intersection(*candidates)
    if len(common) == 1:
        return Link(next(iter(common)), "known", evidence=("consistent_row_values",), candidates=tuple(common))
    return Link(None, "value", resolution="ambiguous",
                evidence=("conflicting_row_values" if not common else "shared_row_values",),
                candidates=tuple(sorted(set.union(*candidates))))


def _full_name(row: dict, roles: dict[str, str]) -> str | None:
    """'First Last' from separate first and last name columns."""
    parts = {roles.get(c): str(v) for c, v in row.items() if not missing(v) and roles.get(c) in ("first_name", "last_name")}
    return f"{parts['first_name']} {parts['last_name']}" if len(parts) == 2 else None


def _mask_text(text: str, spans, links: list[Link], replacer: Replacer, source: str, row: int, column: str,
               mentions: list[Mention]) -> str:
    edits = [Edit(d.start, d.end, replacer.mention(text, d, link)) for d, link in zip(spans, links)]
    masked, out_spans = rebuild(text, edits)
    for d, link, e, (a, b) in zip(spans, links, edits, out_spans):
        persona = replacer.persona(link.subject).id if link.subject else None
        mentions.append(Mention(source, row, column, d.start, d.end, a, b, d.category, d.label, d.detector,
                                round(d.score, 4), persona, link.how if link.subject else "value",
                                e.replacement != text[d.start:d.end], e.replacement,
                                link.resolution if d.category in PERSON_BOUND else "not_applicable",
                                link.evidence, len(link.candidates)))
    return masked

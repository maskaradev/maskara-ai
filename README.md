# maskara


<p align="center">
  <img src="https://raw.githubusercontent.com/maskaradev/maskara-ai/main/web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">demo</a> · <a href="#quick-start">quick start</a> · <a href="https://github.com/maskaradev/maskara-ai/blob/main/intents.md">intents</a>
</p>

<p align="center">
  English · <a href="https://github.com/maskaradev/maskara-ai/blob/main/docs/i18n/README.ko.md">한국어</a> · <a href="https://github.com/maskaradev/maskara-ai/blob/main/docs/i18n/README.zh-CN.md">简体中文</a> · <a href="https://github.com/maskaradev/maskara-ai/blob/main/docs/i18n/README.ja.md">日本語</a> · <a href="https://github.com/maskaradev/maskara-ai/blob/main/docs/i18n/README.es.md">Español</a> · <a href="https://github.com/maskaradev/maskara-ai/blob/main/docs/i18n/README.fr.md">Français</a> · <a href="https://github.com/maskaradev/maskara-ai/blob/main/docs/i18n/README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="https://github.com/maskaradev/maskara-ai/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara-ai/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara-ai?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**swap personal data for consistent synthetic personas instead of redacting it, then prove the data stayed useful and didn't leak.**

<p align="center">
  <a href="https://app.maskara.dev"><img src="https://raw.githubusercontent.com/maskaradev/maskara-ai/main/docs/assets/showroom.png" alt="the maskara showroom: a sample run's numbers, and a support ticket before and after masking" width="880" /></a>
</p>

- **swap, don't redact** — names, emails, phones, addresses, dates, and ids become a synthetic persona's, not `[REDACTED]`. the rest of the text stays as it is.
- **one person, one persona** — a customer is the same persona in every table and every text that mentions them, and with a vault, on the next run too.
- **dates move together** — each person's dates shift by one offset, so the gaps between them stay exact.
- **joins keep working** — an id gets the same replacement in every table and text, and its letter prefix stays (`CUS-575198` → `CUS-224730`).
- **presets** — `strict`, `balanced` (default), or `max_utility`: how closely a persona matches the original's age, region, and background.
- **local vault, no originals** — `.maskara/vault.db` keeps personas stable across runs. it stores keyed hashes and synthetic values, never an original.
- **detection** — rules for emails, phones, cards, ids, and dates, plus every value the tables already know. add the gliner2 pii model with `maskara-ai[gliner]`, and opt-in pattern packs for domain ids (`legal-echr`).
- **a report with every run** — leftover originals in the output, broken joins, date gaps, formats that still parse, k-anonymity of what was kept, and a linkage attack on it. plus a list of what it couldn't measure.
- **`maskara ui`** — a local viewer for runs, before and after side by side, bound to 127.0.0.1.
- **small and offline** — the core is python standard library only and needs no network.

## quick start

```bash
pip install git+https://github.com/maskaradev/maskara-ai   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

once it's on pypi this becomes `pip install maskara-ai`. the `maskara` package on pypi is a different project. for the gliner2 model:

```bash
pip install "maskara-ai[gliner] @ git+https://github.com/maskaradev/maskara-ai"
```

### python

```python
import maskara

result = maskara.mask(
    tables={
        "customers": [
            {"customer_id": "C-1001", "name": "Maria Lopez", "email": "maria.lopez@gmail.com", "birth_date": "1984-03-02"},
        ],
        "orders": [
            {"order_id": "ORD-55012", "customer_id": "C-1001", "ordered_on": "2025-04-14"},
            {"order_id": "ORD-55019", "customer_id": "C-1001", "ordered_on": "2025-04-20"},
        ],
    },
    texts={"notes": ["Maria Lopez called on April 21, 2025 about order ORD-55019. Reach her at maria.lopez@gmail.com."]},
    subjects={"customers": "customer_id", "orders": "customer_id"},
    vault=".maskara/vault.db",  # same person, same persona on the next run
)
print(result.texts["notes"])
# ['Kara Brown called on May 9, 2025 about order ORD-10991. Reach her at kara.brown@example.org.']
print(result.report.summary())
```

tables can be lists of dicts, csv or jsonl paths, or pandas dataframes; you get back the same type. texts can be lists of strings, `.txt` or `.jsonl` paths, or a pandas series. your personas will differ from the ones above: they come from your vault's key.

known limit in v0: in text with no table behind it, a name and an email or phone in the same sentence can get different personas. passing the people as a table links them; a fix is planned for the next release.

### cli

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

`masked/` gets each input under the same name, `report.json`, `report.html`, and `mentions.jsonl` (what was replaced where, without the originals). `maskara report masked/` prints the report again, and `maskara mask --help` lists the rest (`--preset`, `--detector`, `--pattern`, a toml config).

## benchmarks

<p align="center">
  <img src="https://raw.githubusercontent.com/maskaradev/maskara-ai/main/docs/assets/hero-external.png" alt="direct identifiers hidden against distinctness on ABCD, Nemotron-PII and TAB: maskara is top right on all three, redaction drops to 20% distinctness on court cases" width="880" />
</p>

`maskara bench` scores maskara and the usual approaches with one scorer, on three corpora we didn't make: [ABCD](https://github.com/asappresearch/abcd) (human-written support chats), [Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) (synthetic), and [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) (real court cases, human-annotated). each cell is **direct identifiers leaked** (lower is better) / **people kept distinct** (higher is better: two different people don't end up with the same replacement).

| | ABCD (1,004 chats) | Nemotron-PII (1,000 docs) | TAB (127 cases) |
|---|---|---|---|
| perfect detection, then `[TYPE]` placeholders | 0% / 71% | 0% / 66% | 0% / 20% |
| presidio | 18% / 85% | 22% / 75% | 38% / 23% |
| gliner2-pii | 8.2% / 94% | 19% / 89% | 41% / 41% |
| openai privacy filter | 6.5% / 64% | 18% / 68% | 51% / 22% |
| presidio + faker, one fake per value per document | 18% / 99.8% | 22% / 93% | 38% / 99.6% |
| **maskara** (rules + gliner2) | **2.4% / 97%** | **4.9% / 93%** | 37% / 99.8% |
| **maskara** + `legal-echr` pattern pack | | | **2.5% / 99.8%** |

- TAB's direct identifiers are 228 names and 134 case numbers (`no. 36110/97`). every general-purpose detector, maskara's included, misses nearly all the case numbers; on names maskara leaks 0.4%. the opt-in `legal-echr` pack (`--pattern legal-echr`) catches them, and changes nothing on the other two corpora.
- distinctness is a proxy for utility. it shows people weren't merged, not that an analysis on the masked data gives the same answers; we haven't measured that on these corpora yet.
- the default `balanced` preset keeps most quasi-identifiers (organisations, demographics) and shifts dates, so many of those stay in the text by design.
- each corpus has its weak spot: ABCD's gold comes from the scenario cards behind the chats, Nemotron-PII is generated text, and TAB is one domain with 127 documents.

we also run a fourth corpus, `linked`: tables and texts we generate so that who is who is known exactly, which lets `bench --qa` test whether cross-document questions still have the same answers. we built it, so it is reported separately. full numbers, versions and caveats are in [`docs/research/bench-results.md`](https://github.com/maskaradev/maskara-ai/blob/main/docs/research/bench-results.md), and the design and its decision log in [`docs/research/v0-design.md`](https://github.com/maskaradev/maskara-ai/blob/main/docs/research/v0-design.md) (both korean). to reproduce:

```bash
uv sync --all-extras --all-groups
uv run maskara bench --corpus abcd nemotron-pii tab \
  --system oracle-redact presidio-redact gliner2-redact opf-redact presidio-fake-consistent maskara-gliner2 maskara-gliner2+echr
uv run python -m maskara.bench.hero --external docs/assets/hero-external.svg
```

this is v0, and english only. personas come from [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) (CC BY 4.0) and first names from [SSA baby names](https://www.ssa.gov/oact/babynames/limits.html), so they're american.

## security

maskara runs on your machine and sends nothing anywhere. network use is opt-in: an optional model downloads once on first use, `maskara bench` downloads its corpora, and `bench --qa llm` calls the model endpoint you set. v0 hasn't been audited, so read the report before you share an output. report security issues through a [private advisory](https://github.com/maskaradev/maskara-ai/security/advisories/new).

## thanks

[NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA), and [SSA baby names](https://www.ssa.gov/oact/babynames/limits.html) for the personas and sample data, and [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) and [ABCD](https://github.com/asappresearch/abcd) for the benchmarks

## development

```bash
uv sync --all-extras --all-groups
uv run pytest
uv run ruff check src tests
```

the landing page and the hosted demo live in `web/` (node 20.9+, pnpm 12):

```bash
cd web
pnpm install
pnpm dev      # dev server: localhost:3000, and the demo at app.localhost:3000
pnpm lint     # eslint
pnpm build    # production build
```

`maskara ui --export web/public/demo` rebuilds the hosted demo. if you are an ai agent working on `web/`, read [`web/AGENTS.md`](https://github.com/maskaradev/maskara-ai/blob/main/web/AGENTS.md) first. this readme is the source for the translations in `docs/i18n/`.

## license

maskara is licensed under the [Apache License 2.0](https://github.com/maskaradev/maskara-ai/blob/main/LICENSE). the bundled persona and sample data is derived from CC BY 4.0 and public-domain sources; see [`src/maskara/data/NOTICE`](https://github.com/maskaradev/maskara-ai/blob/main/src/maskara/data/NOTICE).

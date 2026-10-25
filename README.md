# maskara


<p align="center">
  <img src="web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">demo</a> · <a href="#quick-start">quick start</a> · <a href="intents.md">intents</a>
</p>

<p align="center">
  English · <a href="docs/i18n/README.ko.md">한국어</a> · <a href="docs/i18n/README.zh-CN.md">简体中文</a> · <a href="docs/i18n/README.ja.md">日本語</a> · <a href="docs/i18n/README.es.md">Español</a> · <a href="docs/i18n/README.fr.md">Français</a> · <a href="docs/i18n/README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**swap personal data for consistent synthetic personas instead of redacting it, then prove the data stayed useful and didn't leak.**

<p align="center">
  <a href="https://app.maskara.dev"><img src="docs/assets/showroom.png" alt="the maskara showroom: a sample run's numbers, and a support ticket before and after masking" width="880" /></a>
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
pip install git+https://github.com/maskaradev/maskara   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

once it's on pypi this becomes `pip install maskara-ai`. the `maskara` package on pypi is a different project. for the gliner2 model:

```bash
pip install "maskara-ai[gliner] @ git+https://github.com/maskaradev/maskara"
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

### cli

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

`masked/` gets each input under the same name, `report.json`, `report.html`, and `mentions.jsonl` (what was replaced where, without the originals). `maskara report masked/` prints the report again, and `maskara mask --help` lists the rest (`--preset`, `--detector`, `--pattern`, a toml config).

## benchmarks

`maskara bench` scores maskara and baselines (redaction, presidio, gliner2, openai privacy filter) with one scorer, for what leaked and what stayed useful, on four corpora: [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) (real court cases), [ABCD](https://github.com/asappresearch/abcd) (human-written support chats), [Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) (synthetic), and `linked` (linked tables and texts we generate, so who is who is known). public numbers will come from the first three; `linked` is reported separately, since we built it. the design and its decision log are in [`docs/research/v0-design.md`](docs/research/v0-design.md) (korean).

this is v0, and english only. personas come from [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) (CC BY 4.0) and first names from [SSA baby names](https://www.ssa.gov/oact/babynames/limits.html), so they're american.

## security

maskara runs on your machine and sends nothing anywhere. network use is opt-in: an optional model downloads once on first use, `maskara bench` downloads its corpora, and `bench --qa llm` calls the model endpoint you set. v0 hasn't been audited, so read the report before you share an output. report security issues through a [private advisory](https://github.com/maskaradev/maskara/security/advisories/new).

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

`maskara ui --export web/public/demo` rebuilds the hosted demo. if you are an ai agent working on `web/`, read [`web/AGENTS.md`](web/AGENTS.md) first. this readme is the source for the translations in `docs/i18n/`.

## license

maskara is licensed under the [Apache License 2.0](LICENSE). the bundled persona and sample data is derived from CC BY 4.0 and public-domain sources; see [`src/maskara/data/NOTICE`](src/maskara/data/NOTICE).

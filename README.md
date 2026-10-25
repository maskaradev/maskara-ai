# maskara


<p align="center">
  <img src="web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#quick-start">quick start</a> · <a href="intents.md">intents</a>
</p>

<p align="center">
  English · <a href="docs/i18n/README.ko.md">한국어</a> · <a href="docs/i18n/README.zh-CN.md">简体中文</a> · <a href="docs/i18n/README.ja.md">日本語</a> · <a href="docs/i18n/README.es.md">Español</a> · <a href="docs/i18n/README.fr.md">Français</a> · <a href="docs/i18n/README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**swap sensitive data for consistent synthetic personas, so it stays usable for ai training.**

- **swap, don't redact** — names, ages, dates, and ids become a synthetic persona instead of `[REDACTED]`. diagnoses, prescriptions, and the links between tables stay as they are.
- **one person, one persona** — a patient is the same persona in every table, note, pdf, and photo. their dates all shift by the same amount, so the gaps between visits survive.
- **text, pdfs, and photos in one run** — structured columns and free-text notes, per-page ocr for pdfs, and faces repainted as the persona with in-image text replaced.
- **ai suggests, you decide** — ai proposes a treatment for each column (keep, pseudonymize, persona, date shift, …) and a person confirms it.
- **check before you export** — the privacy & utility report searches the output for leftover originals and measures whether visit gaps, ages, table links, and distributions held. the analysis screen runs the same query on both sides.
- **built for on-prem** — maskara is meant to run inside the customer's network on a local llm. for now, browser storage and the anthropic api stand in for those two pieces. [roadmap →](intents.md#roadmap)

---

## quick start

```bash
git clone https://github.com/maskaradev/maskara
cd maskara/web
pnpm install
cp .env.example .env.local   # set MASKING_ANTHROPIC_API_KEY
pnpm dev
```

needs node 20.9+, pnpm 12, and an anthropic api key. open http://localhost:3000, load the hospital sample under **Datasets**, run a masking job, and check its **Privacy & utility** tab. a guided tour walks you through it. other settings are in [`.env.example`](web/.env.example).

> [!WARNING]
> this build isn't the on-prem one yet. **don't put real personal data into it.** free text is sent to the anthropic api, and photos and pdf pages to gpu servers. report security issues through a [private advisory](https://github.com/maskaradev/maskara/security/advisories/new).

## thanks

[Synthea](https://github.com/synthetichealth/synthea), [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), and [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) for the sample data

## agent instructions

if you are an ai agent helping with this repository, read [`AGENTS.md`](web/AGENTS.md) before making changes.

## development

```bash
pnpm dev      # dev server
pnpm lint     # eslint
pnpm build    # production build
```

add ui strings to `web/src/lib/i18n/en.ts` and `ko.ts` together. this readme is the source for the translations in `docs/i18n/`.

## license

maskara is licensed under the [Apache License 2.0](LICENSE). the sample datasets in `web/public/samples/` keep their own licenses.

# intents

what maskara is for, and where it's going.

## one-liner

maskara replaces sensitive data with synthetic personas, protecting personal information while keeping the data useful.

## the problem

- data held by institutions like banks and hospitals **can't leave the institution.** it stays locked inside each one.
- companies that train ai models on this kind of data, such as financial ai companies and rl eval and training-data companies, need it and have no way to get it.
- masking is mandatory whenever an institution shares data, but conventional masking wipes out the context a model needs to learn from.

## the approach

conventional masking hides or deletes sensitive values, and loses the context analysis needs along the way.
maskara replaces personal information such as faces, names, and ages with **consistent synthetic personas**.
it reduces exposure of the original while preserving the data's key characteristics and relationships, so the data can be used for ai training, analysis, and testing.

## delivery: on-prem

the data can't come out, so **maskara goes to where the data is.**

1. it reads the customer's database **read-only**.
2. it de-identifies inside the customer's environment. the original never leaves.
3. only the de-identified data is exported, for training or sharing.

- it runs on a **local llm** and calls no external apis, so it works on air-gapped networks.
- it ships as **installable software**, not saas, set up for each customer's environment and kept up to date there.

## who it's for

- companies that need training data, such as rl eval and training-data companies
- institutions that hold data but can't export it, such as banks and hospitals
- ai teams that need to train models on those institutions' data

## roadmap

this repository is the python package: `maskara.mask()` and the `maskara` cli, running on the machine where the data is. v0 covers english tables and free text, cpu only; the pdf, photo, and audio lanes of the earlier web prototype come later. the design and its decision log are in [`docs/research/v0-design.md`](docs/research/v0-design.md).

- [x] tables (csv, jsonl, pandas) and free text (txt, jsonl) linked by one subject key
- [x] consistent personas from nemotron-personas-usa, with three presets: strict, balanced, max_utility
- [x] local vault that keeps personas stable across runs and stores no originals
- [x] detection: rules and known table values, plus gliner2 when installed
- [x] privacy and fidelity report (text, json, html) and `maskara bench` on four corpora
- [x] offline, with a stdlib-only core
- [ ] publish to pypi as `maskara-ai`
- [ ] parquet input and an encrypted vault (sqlcipher)
- [ ] read-only connectors to the customer's database
- [ ] offline install bundle for air-gapped networks
- [ ] languages other than english
- [ ] pdfs and ocr, images and faces, audio

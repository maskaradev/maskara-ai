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

this repository stands in for two pieces of the on-prem build: browser storage instead of the customer's database, and the anthropic api instead of a local llm. the rest of the pipeline is the same code.

- [x] three-lane pipeline: text db, pdf, photos
- [x] consistent persona mapping across tables, documents, and images
- [x] privacy & utility report and analysis comparison screen
- [ ] replace browser storage with a read-only connector to the customer db
- [ ] replace the anthropic api with a local llm (vllm) on the customer's gpus
- [ ] offline install bundle for air-gapped networks
- [ ] audio (call recording) processing

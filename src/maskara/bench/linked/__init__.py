"""Generator behind the maskara-linked corpus (`maskara.bench.corpora.linked`).

people  real-looking people from Nemotron-Personas-USA
world   their customer records, orders and support tickets, as linked tables
docs    free-text documents about those tickets, with a gold span for every mention
qa      questions that can only be answered by linking a person across documents

Kept apart from the persona engine on purpose: the benchmark must not share code with the system
it measures.
"""

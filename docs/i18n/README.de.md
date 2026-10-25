# maskara


<p align="center">
  <img src="../../web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">Demo</a> · <a href="#schnellstart">Schnellstart</a> · <a href="../../intents.md">Absicht</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · Deutsch
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**Personenbezogene Daten durch konsistente synthetische Personas ersetzen statt schwärzen — und belegen, dass die Daten nützlich geblieben und nicht durchgesickert sind.**

<p align="center">
  <a href="https://app.maskara.dev"><img src="../assets/showroom.png" alt="der maskara-Showroom: die Kennzahlen eines Beispiellaufs und ein Support-Ticket vor und nach der Maskierung" width="880" /></a>
</p>

- **Ersetzen statt schwärzen** — Namen, E-Mails, Telefonnummern, Adressen, Datumsangaben und IDs werden zu denen einer synthetischen Persona, nicht zu `[REDACTED]`. Der restliche Text bleibt, wie er ist.
- **Eine Person, eine Persona** — Eine Kundin ist in jeder Tabelle und jedem Text, der sie erwähnt, dieselbe Persona, und mit einem Vault auch beim nächsten Lauf.
- **Daten verschieben sich gemeinsam** — Alle Datumsangaben einer Person verschieben sich um denselben Betrag, die Abstände dazwischen bleiben also exakt.
- **Joins funktionieren weiter** — Eine ID bekommt in allen Tabellen und Texten denselben Ersatz, und ihr Buchstabenpräfix bleibt erhalten (`CUS-575198` → `CUS-224730`).
- **Presets** — `strict`, `balanced` (Standard) oder `max_utility`: wie genau eine Persona Alter, Region und Hintergrund des Originals trifft.
- **Lokaler Vault, keine Originale** — `.maskara/vault.db` hält Personas über Läufe hinweg stabil. Er speichert geschlüsselte Hashes (HMAC) und synthetische Werte, nie ein Original.
- **Erkennung** — Regeln für E-Mails, Telefonnummern, Karten, IDs und Datumsangaben, dazu jeder Wert, den die Tabellen schon kennen. Mit `maskara-ai[gliner]` kommt das GLiNER2-PII-Modell hinzu, und optionale Musterpakete erkennen fachspezifische IDs (`legal-echr`).
- **Ein Bericht zu jedem Lauf** — im Output verbliebene Originale, gebrochene Joins, Datumsabstände, Formate, die noch parsen, k-Anonymität des Beibehaltenen und ein Verknüpfungsangriff darauf. Dazu eine Liste dessen, was er nicht messen konnte.
- **`maskara ui`** — ein lokaler Viewer für Läufe, vorher und nachher nebeneinander, nur an 127.0.0.1 gebunden.
- **Klein und offline** — Der Kern nutzt nur die Python-Standardbibliothek und braucht kein Netzwerk.

## Schnellstart

```bash
pip install git+https://github.com/maskaradev/maskara   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

Sobald es auf PyPI ist, heißt es `pip install maskara-ai`. Das Paket `maskara` auf PyPI ist ein anderes Projekt. Für das GLiNER2-Modell:

```bash
pip install "maskara-ai[gliner] @ git+https://github.com/maskaradev/maskara"
```

### Python

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

Tabellen können Listen von Dicts, CSV- oder JSONL-Pfade oder pandas-DataFrames sein; zurück kommt derselbe Typ. Texte können Listen von Strings, `.txt`- oder `.jsonl`-Pfade oder eine pandas-Series sein. Deine Personas werden sich von den obigen unterscheiden: Sie stammen aus dem Schlüssel deines Vaults.

### CLI

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

In `masked/` landet jede Eingabe unter demselben Namen, dazu `report.json`, `report.html` und `mentions.jsonl` (was wo ersetzt wurde, ohne die Originale). `maskara report masked/` gibt den Bericht erneut aus, und `maskara mask --help` listet den Rest (`--preset`, `--detector`, `--pattern`, eine TOML-Konfiguration).

## Benchmarks

`maskara bench` bewertet maskara und Vergleichssysteme (Redaction, Presidio, GLiNER2, OpenAI Privacy Filter) mit einem einzigen Scorer danach, was durchgesickert und was nützlich geblieben ist, auf vier Korpora: [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) (echte Gerichtsurteile), [ABCD](https://github.com/asappresearch/abcd) (von Menschen geschriebene Support-Chats), [Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) (synthetisch) und `linked` (verknüpfte Tabellen und Texte, die wir erzeugen, sodass bekannt ist, wer wer ist). Öffentliche Zahlen kommen aus den ersten drei; `linked` wird separat berichtet, weil wir es selbst gebaut haben. Das Design und sein Entscheidungsprotokoll stehen in [`docs/research/v0-design.md`](../research/v0-design.md) (auf Koreanisch).

Das ist v0 und nur auf Englisch. Die Personas stammen aus [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) (CC BY 4.0) und die Vornamen aus den [SSA-Babynamen](https://www.ssa.gov/oact/babynames/limits.html), sie sind also amerikanisch.

## Sicherheit

maskara läuft auf deinem Rechner und sendet nichts irgendwohin. Netzwerkzugriff gibt es nur, wenn du ihn wählst: Ein optionales Modell wird beim ersten Einsatz einmal heruntergeladen, `maskara bench` lädt seine Korpora herunter, und `bench --qa llm` ruft den Modell-Endpunkt auf, den du einstellst. v0 ist nicht auditiert, lies also den Bericht, bevor du einen Output teilst. Sicherheitsprobleme bitte über ein [privates Advisory](https://github.com/maskaradev/maskara/security/advisories/new) melden.

## Danke

an [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) und die [SSA-Babynamen](https://www.ssa.gov/oact/babynames/limits.html) für die Personas und Beispieldaten, und an [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) und [ABCD](https://github.com/asappresearch/abcd) für die Benchmarks

## Entwicklung

```bash
uv sync --all-extras --all-groups
uv run pytest
uv run ruff check src tests
```

Die Landingpage und die gehostete Demo liegen in `web/` (Node.js 20.9+, pnpm 12):

```bash
cd web
pnpm install
pnpm dev      # dev server: localhost:3000, and the demo at app.localhost:3000
pnpm lint     # eslint
pnpm build    # production build
```

`maskara ui --export web/public/demo` erzeugt die gehostete Demo neu. Wenn du als KI-Agent an `web/` arbeitest, lies zuerst [`web/AGENTS.md`](../../web/AGENTS.md). Die Übersetzungen folgen der englischen [README](../../README.md).

## Lizenz

maskara steht unter der [Apache License 2.0](../../LICENSE). Die mitgelieferten Persona- und Beispieldaten stammen aus CC-BY-4.0- und gemeinfreien Quellen; siehe [`src/maskara/data/NOTICE`](../../src/maskara/data/NOTICE).

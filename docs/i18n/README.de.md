# maskara


<p align="center">
  <img src="../../public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#schnellstart">Schnellstart</a> · <a href="../../intents.md">Absicht</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · Deutsch
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**Ersetzt sensible Daten durch konsistente synthetische Personas, damit sie für KI-Training nutzbar bleiben.**

- **Ersetzen statt schwärzen** — Namen, Alter, Daten und IDs werden zu einer synthetischen Persona statt zu `[REDACTED]`. Diagnosen, Verordnungen und die Verknüpfungen zwischen Tabellen bleiben, wie sie sind.
- **Eine Person, eine Persona** — Ein Patient ist in jeder Tabelle, Notiz, PDF und jedem Foto dieselbe Persona. Alle seine Daten werden um denselben Betrag verschoben, sodass die Abstände zwischen Besuchen erhalten bleiben.
- **Text, PDFs und Fotos in einem Lauf** — strukturierte Spalten und Freitextnotizen, seitenweise OCR für PDFs, und Gesichter werden als Persona neu gemalt, Text im Bild wird ersetzt.
- **KI schlägt vor, du entscheidest** — die KI schlägt für jede Spalte eine Behandlung vor (behalten, pseudonymisieren, Persona, Datumsverschiebung, …) und ein Mensch bestätigt sie.
- **Vor dem Export prüfen** — der Datenschutz- und Nutzbarkeitsbericht sucht im Ergebnis nach übrig gebliebenen Originalwerten und misst, ob Besuchsabstände, Alter, Tabellenverknüpfungen und Verteilungen erhalten blieben. Die Analyseansicht führt dieselbe Abfrage auf beiden Seiten aus.
- **Für On-Prem gebaut** — maskara soll im Netz des Kunden mit einem lokalen LLM laufen. Vorerst übernehmen Browser-Speicher und die Anthropic-API diese beiden Teile. [Roadmap →](../../intents.md#roadmap)

---

## Schnellstart

```bash
git clone https://github.com/maskaradev/maskara
cd maskara
pnpm install
cp .env.example .env.local   # MASKING_ANTHROPIC_API_KEY eintragen
pnpm dev
```

Benötigt Node.js 20.9+, pnpm 12 und einen Anthropic-API-Schlüssel. Öffne http://localhost:3000, lade unter **Datasets** das Krankenhaus-Beispiel, starte einen Maskierungsjob und sieh dir den Tab **Privacy & utility** an. Eine geführte Tour begleitet dich dabei. Weitere Einstellungen stehen in [`.env.example`](../../.env.example).

> [!WARNING]
> Das ist noch nicht die On-Prem-Version. **Gib keine echten personenbezogenen Daten ein.** Freitext wird an die Anthropic-API gesendet, Fotos und PDF-Seiten an GPU-Server. Sicherheitslücken bitte über ein [privates Advisory](https://github.com/maskaradev/maskara/security/advisories/new) melden.

## Danke

[Synthea](https://github.com/synthetichealth/synthea), [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) und [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) für die Beispieldaten

## Hinweise für Agenten

Wenn du ein KI-Agent bist, der an diesem Repository mitarbeitet, lies vor Änderungen [`AGENTS.md`](../../AGENTS.md).

## Entwicklung

```bash
pnpm dev      # Dev-Server
pnpm lint     # ESLint
pnpm build    # Produktions-Build
```

UI-Texte immer gleichzeitig in `src/lib/i18n/en.ts` und `ko.ts` eintragen. Das englische [README](../../README.md) ist die Quelle der Übersetzungen.

## Lizenz

maskara steht unter der [Apache License 2.0](../../LICENSE). Die Beispieldatensätze in `public/samples/` behalten ihre eigenen Lizenzen.

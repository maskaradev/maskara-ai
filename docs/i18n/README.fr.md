# maskara


<p align="center">
  <img src="../../public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#démarrage-rapide">démarrage rapide</a> · <a href="../../intents.md">intentions</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · Français · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**remplace les données sensibles par des personas synthétiques cohérents, pour qu'elles restent utiles à l'entraînement d'ia.**

- **remplacer, pas caviarder** — noms, âges, dates et identifiants deviennent un persona synthétique au lieu de `[REDACTED]`. diagnostics, prescriptions et liens entre tables restent tels quels.
- **une personne, un persona** — un patient est le même persona dans chaque table, note, pdf et photo. toutes ses dates sont décalées de la même durée, donc les intervalles entre visites sont conservés.
- **texte, pdf et photos en une seule exécution** — colonnes structurées et notes en texte libre, ocr page par page pour les pdf, et visages repeints en persona avec le texte de l'image remplacé.
- **l'ia propose, vous décidez** — l'ia suggère un traitement pour chaque colonne (conserver, pseudonymiser, persona, décalage de date, …) et une personne le valide.
- **vérifier avant d'exporter** — le rapport confidentialité et utilité cherche les valeurs d'origine restantes et mesure si les intervalles entre visites, les âges, les liens entre tables et les distributions ont tenu. l'écran d'analyse exécute la même requête des deux côtés.
- **conçu pour l'on-prem** — maskara est fait pour tourner dans le réseau du client avec un llm local. pour l'instant, le stockage du navigateur et l'api anthropic tiennent ces deux rôles. [feuille de route →](../../intents.md#roadmap)

---

## démarrage rapide

```bash
git clone https://github.com/maskaradev/maskara
cd maskara
pnpm install
cp .env.example .env.local   # renseignez MASKING_ANTHROPIC_API_KEY
pnpm dev
```

il faut node 20.9+, pnpm 12 et une clé d'api anthropic. ouvrez http://localhost:3000, chargez l'échantillon hospitalier dans **Datasets**, lancez une tâche de masquage et consultez son onglet **Privacy & utility**. une visite guidée vous accompagne. les autres réglages sont dans [`.env.example`](../../.env.example).

> [!WARNING]
> ce n'est pas encore la version on-prem. **n'y mettez pas de vraies données personnelles.** le texte libre est envoyé à l'api anthropic, et les photos et pages pdf à des serveurs gpu. signalez les failles de sécurité via un [advisory privé](https://github.com/maskaradev/maskara/security/advisories/new).

## remerciements

[Synthea](https://github.com/synthetichealth/synthea), [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) et [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) pour les données d'exemple

## instructions pour les agents

si vous êtes un agent d'ia qui aide sur ce dépôt, lisez [`AGENTS.md`](../../AGENTS.md) avant toute modification.

## développement

```bash
pnpm dev      # serveur de développement
pnpm lint     # eslint
pnpm build    # build de production
```

ajoutez les textes de l'interface à `src/lib/i18n/en.ts` et `ko.ts` en même temps. le [README](../../README.md) anglais est la source des traductions.

## licence

maskara est distribué sous [Apache License 2.0](../../LICENSE). les jeux de données de `public/samples/` gardent leurs propres licences.

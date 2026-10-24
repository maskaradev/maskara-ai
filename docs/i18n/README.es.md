# maskara


<p align="center">
  <img src="../../public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#inicio-rápido">inicio rápido</a> · <a href="../../intents.md">intención</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · Español · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**cambia los datos sensibles por personas sintéticas coherentes, para que sigan siendo útiles para entrenar ia.**

- **reemplazar, no tachar** — nombres, edades, fechas e ids se convierten en una persona sintética en lugar de `[REDACTED]`. diagnósticos, recetas y relaciones entre tablas se quedan como están.
- **una persona, una persona sintética** — un paciente es la misma persona sintética en cada tabla, nota, pdf y foto. todas sus fechas se desplazan lo mismo, así que los intervalos entre visitas se conservan.
- **texto, pdfs y fotos en una sola ejecución** — columnas estructuradas y notas de texto libre, ocr por página para los pdfs, y rostros repintados como la persona sintética con el texto de la imagen reemplazado.
- **la ia sugiere, tú decides** — la ia propone un tratamiento para cada columna (conservar, seudonimizar, persona, desplazar fecha, …) y una persona lo confirma.
- **revisa antes de exportar** — el informe de privacidad y utilidad busca valores originales que hayan quedado y mide si se mantuvieron los intervalos entre visitas, las edades, los vínculos entre tablas y las distribuciones. la pantalla de análisis ejecuta la misma consulta en ambos lados.
- **pensado para on-prem** — maskara está pensado para correr dentro de la red del cliente con un llm local. por ahora, el almacenamiento del navegador y la api de anthropic ocupan esas dos piezas. [hoja de ruta →](../../intents.md#roadmap)

---

## inicio rápido

```bash
git clone https://github.com/maskaradev/maskara
cd maskara
pnpm install
cp .env.example .env.local   # define MASKING_ANTHROPIC_API_KEY
pnpm dev
```

necesitas node 20.9+, pnpm 12 y una clave de la api de anthropic. abre http://localhost:3000, carga la muestra hospitalaria en **Datasets**, ejecuta un trabajo de enmascarado y revisa su pestaña **Privacy & utility**. un tour guiado te acompaña. el resto de ajustes están en [`.env.example`](../../.env.example).

> [!WARNING]
> esta aún no es la versión on-prem. **no le pongas datos personales reales.** el texto libre se envía a la api de anthropic, y las fotos y páginas de pdf a servidores gpu. reporta problemas de seguridad mediante un [advisory privado](https://github.com/maskaradev/maskara/security/advisories/new).

## agradecimientos

[Synthea](https://github.com/synthetichealth/synthea), [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) y [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) por los datos de muestra

## instrucciones para agentes

si eres un agente de ia que ayuda con este repositorio, lee [`AGENTS.md`](../../AGENTS.md) antes de hacer cambios.

## desarrollo

```bash
pnpm dev      # servidor de desarrollo
pnpm lint     # eslint
pnpm build    # build de producción
```

añade los textos de la interfaz a `src/lib/i18n/en.ts` y `ko.ts` a la vez. el [README](../../README.md) en inglés es la fuente de las traducciones.

## licencia

maskara se distribuye bajo la [Apache License 2.0](../../LICENSE). los conjuntos de datos de `public/samples/` conservan sus propias licencias.

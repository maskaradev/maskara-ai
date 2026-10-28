# maskara


<p align="center">
  <img src="../../web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">demo</a> · <a href="#inicio-rápido">inicio rápido</a> · <a href="../../intents.md">intención</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · Español · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara-ai/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara-ai?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**sustituye los datos personales por identidades sintéticas consistentes y mide la utilidad de los datos y la exposición residual.**

<p align="center">
  <a href="https://app.maskara.dev"><img src="../assets/showroom.png" alt="la vitrina de maskara: las cifras de una ejecución de ejemplo y un ticket de soporte antes y después del enmascaramiento" width="880" /></a>
</p>

- **sustituir, no tachar** — nombres, correos, teléfonos, direcciones, fechas e ids pasan a ser los de una persona sintética, no `[REDACTED]`. el resto del texto queda igual.
- **una persona, una persona sintética** — un cliente es la misma persona sintética en cada tabla y en cada texto que lo menciona, y con un vault, también en la siguiente ejecución.
- **las fechas se mueven juntas** — todas las fechas de una persona se desplazan lo mismo, así que los intervalos entre ellas se mantienen exactos.
- **los joins siguen funcionando** — un id recibe el mismo reemplazo en todas las tablas y textos, y conserva su prefijo de letras (`CUS-575198` → `CUS-224730`).
- **presets** — `strict`, `balanced` (por defecto) o `max_utility`: cuánto se parece la persona sintética a la original en edad, región y perfil.
- **vault local, sin originales** — `.maskara/vault.db` mantiene las personas sintéticas estables entre ejecuciones. guarda hashes con clave y valores sintéticos, nunca un original.
- **detección** — reglas para correos, teléfonos, tarjetas, ids y fechas, más cada valor que las tablas ya conocen. añade el modelo de pii gliner2 con `maskara-ai[gliner]`, y paquetes de patrones opcionales para ids de un dominio (`legal-echr`).
- **un informe en cada ejecución** — originales que quedaron en la salida, joins rotos, intervalos entre fechas, formatos que siguen siendo válidos, k-anonimato de lo que se conservó y un ataque de enlace sobre ello. además, una lista de lo que no pudo medir.
- **`maskara ui`** — un visor local de ejecuciones, con el antes y el después lado a lado, que solo escucha en 127.0.0.1.
- **pequeño y sin conexión** — el núcleo usa solo la biblioteca estándar de python y no necesita red.

## inicio rápido

```bash
pip install git+https://github.com/maskaradev/maskara-ai   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

cuando esté publicado en pypi será `pip install maskara-ai`. el paquete `maskara` de pypi es otro proyecto. para el modelo gliner2:

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

las tablas pueden ser listas de dicts, rutas csv o jsonl, o dataframes de pandas; recibes de vuelta el mismo tipo. los textos pueden ser listas de cadenas, rutas `.txt` o `.jsonl`, o una series de pandas. tus personas sintéticas serán distintas de las de arriba: salen de la clave de tu vault.

límite conocido en v0: en un texto sin una tabla detrás, un nombre y un email o teléfono de la misma frase pueden acabar con personas distintas. si pasas a esas personas como tabla, quedan enlazadas; el arreglo llegará en la próxima versión.

### cli

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

`masked/` recibe cada entrada con el mismo nombre, `report.json`, `report.html` y `mentions.jsonl` (qué se reemplazó y dónde, sin los originales). `maskara report masked/` vuelve a mostrar el informe, y `maskara mask --help` lista el resto (`--preset`, `--detector`, `--pattern`, una configuración toml).

## benchmarks

<p align="center">
  <img src="../assets/hero-external.png" alt="identificadores directos ocultados frente a distinción en ABCD, Nemotron-PII y TAB: maskara queda arriba a la derecha en los tres, y redaction cae al 20% de distinción en las sentencias" width="880" />
</p>

`maskara bench` puntúa a maskara y a los enfoques habituales con un mismo evaluador, en tres corpus que no hicimos nosotros: [ABCD](https://github.com/asappresearch/abcd) (chats de soporte escritos por personas), [Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) (sintético) y [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) (sentencias reales, anotadas por personas). cada celda es **identificadores directos filtrados** (menos es mejor) / **personas que siguen siendo distintas** (más es mejor: dos personas diferentes no acaban con el mismo reemplazo).

| | ABCD (1,004 chats) | Nemotron-PII (1,000 documentos) | TAB (127 sentencias) |
|---|---|---|---|
| detección perfecta y luego marcadores `[TYPE]` | 0% / 71% | 0% / 66% | 0% / 20% |
| presidio | 18% / 85% | 22% / 75% | 38% / 23% |
| gliner2-pii | 8.2% / 94% | 19% / 89% | 41% / 41% |
| openai privacy filter | 6.5% / 64% | 18% / 68% | 51% / 22% |
| presidio + faker, un valor falso por valor y documento | 18% / 99.8% | 22% / 93% | 38% / 99.6% |
| **maskara** (reglas + gliner2) | **2.4% / 97%** | **4.9% / 93%** | 37% / 99.8% |
| **maskara** + paquete de patrones `legal-echr` | | | **2.5% / 99.8%** |

- los identificadores directos de TAB son 228 nombres y 134 números de demanda (`no. 36110/97`). todos los detectores de uso general, incluido el de maskara, se dejan casi todos los números de demanda; en los nombres, maskara filtra un 0.4%. el paquete opcional `legal-echr` (`--pattern legal-echr`) los detecta, y no cambia nada en los otros dos corpus.
- la distinción es un indicador indirecto de la utilidad. muestra que no se fusionaron personas, no que un análisis sobre los datos enmascarados dé las mismas respuestas; eso todavía no lo hemos medido en estos corpus.
- el preset por defecto, `balanced`, conserva la mayoría de los cuasi-identificadores (organizaciones, datos demográficos) y desplaza las fechas, así que muchos de ellos quedan en el texto a propósito.
- cada corpus tiene su punto débil: las anotaciones de referencia de ABCD salen de las fichas de escenario que hay detrás de los chats, Nemotron-PII es texto generado, y TAB es un solo dominio con 127 documentos.

también ejecutamos un cuarto corpus, `linked`: tablas y textos que generamos de modo que se sabe exactamente quién es quién, lo que permite a `bench --qa` comprobar si las preguntas que cruzan documentos siguen teniendo las mismas respuestas. lo construimos nosotros, así que se reporta aparte. las cifras completas, las versiones y las salvedades están en [`docs/research/bench-results.md`](../research/bench-results.md), y el diseño y su registro de decisiones en [`docs/research/v0-design.md`](../research/v0-design.md) (ambos en coreano). para reproducirlo:

```bash
uv sync --all-extras --all-groups
uv run maskara bench --corpus abcd nemotron-pii tab \
  --system oracle-redact presidio-redact gliner2-redact opf-redact presidio-fake-consistent maskara-gliner2 maskara-gliner2+echr
uv run python -m maskara.bench.hero --external docs/assets/hero-external.svg
```

esto es v0, y solo en inglés. las personas sintéticas salen de [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) (CC BY 4.0) y los nombres de pila de los [nombres de bebés de la SSA](https://www.ssa.gov/oact/babynames/limits.html), así que son estadounidenses.

## seguridad

maskara se ejecuta en tu máquina y no envía nada a ningún sitio. la red solo se usa si tú lo eliges: un modelo opcional se descarga una vez en el primer uso, `maskara bench` descarga sus corpus y `bench --qa llm` llama al endpoint de modelo que configures. v0 no ha sido auditado, así que revisa el informe antes de compartir una salida. reporta problemas de seguridad mediante un [aviso privado](https://github.com/maskaradev/maskara-ai/security/advisories/new).

## agradecimientos

a [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) y los [nombres de bebés de la SSA](https://www.ssa.gov/oact/babynames/limits.html) por las personas sintéticas y los datos de ejemplo, y a [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) y [ABCD](https://github.com/asappresearch/abcd) por los benchmarks

## desarrollo

```bash
uv sync --all-extras --all-groups
uv run pytest
uv run ruff check src tests
```

la página de inicio y la demo alojada viven en `web/` (node 20.9+, pnpm 12):

```bash
cd web
pnpm install
pnpm dev      # dev server: localhost:3000, and the demo at app.localhost:3000
pnpm lint     # eslint
pnpm build    # production build
```

`maskara ui --export web/public/demo` regenera la demo alojada. si eres un agente de ia trabajando en `web/`, lee primero [`web/AGENTS.md`](../../web/AGENTS.md). las traducciones parten del [README](../../README.md) en inglés.

## licencia

maskara se distribuye bajo la [Apache License 2.0](../../LICENSE). los datos de personas sintéticas y de ejemplo incluidos derivan de fuentes CC BY 4.0 y de dominio público; consulta [`src/maskara/data/NOTICE`](../../src/maskara/data/NOTICE).

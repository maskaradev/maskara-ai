# maskara


<p align="center">
  <img src="../../web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">演示</a> · <a href="#快速开始">快速开始</a> · <a href="../../intents.md">愿景</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · 简体中文 · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**不删除个人信息，而是把它替换成一致的合成人物（persona），再用数据证明：数据依然可用，也没有泄露。**

<p align="center">
  <a href="https://app.maskara.dev"><img src="../assets/showroom.png" alt="maskara 展示页：一次示例运行的指标，以及一条客服工单脱敏前后的对比" width="880" /></a>
</p>

- **替换，而不是抹除** — 姓名、邮箱、电话、地址、日期和 ID 会变成合成人物的对应值，而不是 `[REDACTED]`。其余文本保持原样。
- **一人一个 persona** — 同一位客户在每张表、每段提到他的文本里都是同一个 persona；使用 vault 时，下次运行也不变。
- **日期一起平移** — 同一个人的所有日期平移相同的天数，日期之间的间隔保持精确。
- **关联不断** — 同一个 ID 在所有表和文本中替换为同一个值，字母前缀保留（`CUS-575198` → `CUS-224730`）。
- **预设** — `strict`、`balanced`（默认）或 `max_utility`：决定 persona 在年龄、地区和背景上与原始数据贴得多近。
- **本地 vault，不存原始值** — `.maskara/vault.db` 让 persona 在多次运行间保持稳定。它只存带密钥的哈希和合成值，从不存原始值。
- **识别** — 用规则识别邮箱、电话、银行卡、ID 和日期，再加上表里已知的每个值。可以通过 `maskara-ai[gliner]` 加上 GLiNER2 PII 模型，领域专用的 ID 格式则用可选的模式包开启（`legal-echr`）。
- **每次运行都有报告** — 输出中残留的原始值、断掉的关联、日期间隔、仍能解析的格式、保留属性的 k-匿名性，以及针对它们的链接攻击。还会列出它没能测量的部分。
- **`maskara ui`** — 本地查看器，并排对比每次运行的前后结果，只监听 127.0.0.1。
- **小巧、离线** — 核心只用 Python 标准库，不需要网络。

## 快速开始

```bash
pip install git+https://github.com/maskaradev/maskara   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

发布到 PyPI 后，安装命令会变成 `pip install maskara-ai`。PyPI 上的 `maskara` 是另一个项目。如需 GLiNER2 模型：

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

表可以是 dict 列表、CSV 或 JSONL 路径，或 pandas DataFrame，返回的类型与输入相同。文本可以是字符串列表、`.txt` 或 `.jsonl` 路径，或 pandas Series。你得到的 persona 会和上面不同：它们来自你的 vault 密钥。

v0 的已知限制：在没有对应表的文本里，同一句中的姓名和邮箱、电话可能会被换成不同的 persona。把这些人作为表一起传入就能关联起来。我们计划在下一个版本修复。

### 命令行

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

`masked/` 里会有与每个输入同名的文件，以及 `report.json`、`report.html` 和 `mentions.jsonl`（哪里替换了什么，不含原始值）。`maskara report masked/` 会重新打印报告，其余选项（`--preset`、`--detector`、`--pattern`、TOML 配置）见 `maskara mask --help`。

## 基准测试

<p align="center">
  <img src="../assets/hero-external.png" alt="在 ABCD、Nemotron-PII 和 TAB 上对比直接标识符隐藏率与区分度：maskara 在三个语料上都位于右上角，redaction 在判决书上的区分度跌到 20%" width="880" />
</p>

`maskara bench` 用同一个评分器，在三个并非我们制作的语料上给 maskara 和常见做法打分：[ABCD](https://github.com/asappresearch/abcd)（人工撰写的客服对话）、[Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII)（合成数据）和 [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark)（真实判决书，人工标注）。每个单元格是 **泄露的直接标识符**（越低越好）/ **保持区分的人**（越高越好：两个不同的人不会得到同一个替换值）。

| | ABCD（1,004 段对话） | Nemotron-PII（1,000 篇文档） | TAB（127 个案件） |
|---|---|---|---|
| 完美识别后替换为 `[TYPE]` 占位符 | 0% / 71% | 0% / 66% | 0% / 20% |
| presidio | 18% / 85% | 22% / 75% | 38% / 23% |
| gliner2-pii | 8.2% / 94% | 19% / 89% | 41% / 41% |
| openai privacy filter | 6.5% / 64% | 18% / 68% | 51% / 22% |
| presidio + faker，每篇文档中每个值对应一个假值 | 18% / 99.8% | 22% / 93% | 38% / 99.6% |
| **maskara**（规则 + gliner2） | **2.4% / 97%** | **4.9% / 93%** | 37% / 99.8% |
| **maskara** + `legal-echr` 模式包 | | | **2.5% / 99.8%** |

- TAB 的直接标识符是 228 个姓名和 134 个案件编号（`no. 36110/97`）。所有通用识别器（包括 maskara 的）几乎漏掉了全部案件编号；在姓名上，maskara 的泄露率是 0.4%。可选的 `legal-echr` 包（`--pattern legal-echr`）能识别这些编号，而且对另外两个语料没有任何影响。
- 区分度只是可用性的替代指标。它说明人没有被合并，但不能说明在脱敏数据上做分析会得到相同的结论；我们还没有在这些语料上测量这一点。
- 默认的 `balanced` 预设保留大多数准标识符（机构、人口统计信息）并平移日期，所以其中很多是有意留在文本里的。
- 每个语料都有短板：ABCD 的标准答案来自对话背后的场景卡片，Nemotron-PII 是生成的文本，TAB 只覆盖一个领域、共 127 篇文档。

我们还跑了第四个语料 `linked`：由我们生成的表格和文本，谁是谁完全已知，因此可以用 `bench --qa` 检验跨文档问题的答案是否保持不变。它是我们自己构建的，所以单独报告。完整数字、版本和注意事项见 [`docs/research/bench-results.md`](../research/bench-results.md)，设计和决策记录见 [`docs/research/v0-design.md`](../research/v0-design.md)（均为韩文）。复现方法：

```bash
uv sync --all-extras --all-groups
uv run maskara bench --corpus abcd nemotron-pii tab \
  --system oracle-redact presidio-redact gliner2-redact opf-redact presidio-fake-consistent maskara-gliner2 maskara-gliner2+echr
uv run python -m maskara.bench.hero --external docs/assets/hero-external.svg
```

目前是 v0，只支持英文。persona 来自 [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA)（CC BY 4.0），名字来自 [SSA 婴儿名字统计](https://www.ssa.gov/oact/babynames/limits.html)，因此都是美国人。

## 安全

maskara 在你的机器上运行，不向任何地方发送数据。只有你主动开启时才会联网：可选模型在首次使用时下载一次，`maskara bench` 会下载它的语料，`bench --qa llm` 会调用你配置的模型端点。v0 尚未经过安全审计，分享输出前请先看报告。安全问题请通过[私密 advisory](https://github.com/maskaradev/maskara/security/advisories/new) 报告。

## 致谢

感谢 [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII)、[Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) 和 [SSA 婴儿名字统计](https://www.ssa.gov/oact/babynames/limits.html) 提供 persona 和示例数据，感谢 [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) 和 [ABCD](https://github.com/asappresearch/abcd) 提供基准测试

## 开发

```bash
uv sync --all-extras --all-groups
uv run pytest
uv run ruff check src tests
```

落地页和在线演示在 `web/` 中（Node.js 20.9+，pnpm 12）：

```bash
cd web
pnpm install
pnpm dev      # dev server: localhost:3000, and the demo at app.localhost:3000
pnpm lint     # eslint
pnpm build    # production build
```

`maskara ui --export web/public/demo` 会重新生成在线演示。如果你是在 `web/` 中工作的 AI 代理，请先阅读 [`web/AGENTS.md`](../../web/AGENTS.md)。各语言 README 都以英文 [README](../../README.md) 为准。

## 许可证

maskara 采用 [Apache License 2.0](../../LICENSE) 授权。随包附带的 persona 和示例数据来自 CC BY 4.0 和公有领域资料，详见 [`src/maskara/data/NOTICE`](../../src/maskara/data/NOTICE)。

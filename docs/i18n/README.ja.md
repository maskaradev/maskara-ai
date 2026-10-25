# maskara


<p align="center">
  <img src="../../web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">デモ</a> · <a href="#クイックスタート">クイックスタート</a> · <a href="../../intents.md">意図</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · 日本語 · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**個人情報を消すのではなく、一貫した架空のペルソナに置き換え、データが使えるまま漏れていないことを数字で示します。**

<p align="center">
  <a href="https://app.maskara.dev"><img src="../assets/showroom.png" alt="maskara のショールーム：サンプル実行の指標と、マスキング前後のサポートチケット" width="880" /></a>
</p>

- **消さずに置き換える** — 名前・メール・電話番号・住所・日付・ID は `[REDACTED]` ではなく、架空のペルソナの値になります。それ以外のテキストはそのままです。
- **一人に一つのペルソナ** — 同じ顧客は、すべてのテーブルとその人が登場するすべてのテキストで同じペルソナになります。vault を使えば次の実行でも同じです。
- **日付はまとめてずらす** — 一人の日付はすべて同じ日数だけずれるので、日付の間隔は正確に保たれます。
- **結合が壊れない** — 同じ ID はすべてのテーブルとテキストで同じ値に置き換わり、英字の接頭辞は残ります（`CUS-575198` → `CUS-224730`）。
- **プリセット** — `strict`、`balanced`（既定）、`max_utility` から、ペルソナが元の年齢・地域・背景にどこまで合わせるかを選びます。
- **ローカルの vault、元の値は保存しない** — `.maskara/vault.db` が実行をまたいでペルソナを固定します。保存するのは鍵付きハッシュと架空の値だけで、元の値は一切保存しません。
- **検出** — メール・電話・カード・ID・日付のルールに加え、テーブルにすでにある値をテキストからも探します。`maskara-ai[gliner]` で GLiNER2 の PII モデルを追加でき、分野固有の ID 形式はオプトインのパターンパックで有効にします（`legal-echr`）。
- **実行ごとのレポート** — 出力に残った元の値、壊れた結合、日付の間隔、パースできる形式、残した属性の k-匿名性とそれに対する連結攻撃。測れなかった項目も一覧にします。
- **`maskara ui`** — 実行結果の前後を並べて見るローカルビューアで、127.0.0.1 だけで開きます。
- **小さく、オフライン** — コアは Python 標準ライブラリだけで動き、ネットワークを使いません。

## クイックスタート

```bash
pip install git+https://github.com/maskaradev/maskara   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

PyPI に公開されたら `pip install maskara-ai` になります。PyPI の `maskara` は別のプロジェクトです。GLiNER2 モデルも入れる場合：

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

テーブルは dict のリスト、CSV・JSONL のパス、pandas DataFrame を受け取り、入力と同じ型で返します。テキストは文字列のリスト、`.txt`・`.jsonl` のパス、pandas Series を受け取ります。ペルソナは vault の鍵から決まるので、上の例とは違う結果になります。

v0 の既知の制限: 対応するテーブルがないテキストでは、同じ文の名前とメールアドレス・電話番号が別のペルソナになることがあります。人物をテーブルとして一緒に渡せば結び付きます。次のリリースで修正する予定です。

### CLI

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

`masked/` には入力ごとに同じ名前のファイルと、`report.json`、`report.html`、`mentions.jsonl`（どこで何を置き換えたか。元の値は含みません）ができます。`maskara report masked/` でレポートを再表示でき、その他のオプション（`--preset`、`--detector`、`--pattern`、TOML 設定）は `maskara mask --help` にあります。

## ベンチマーク

<p align="center">
  <img src="../assets/hero-external.png" alt="ABCD・Nemotron-PII・TAB における直接識別子の秘匿率と区別性：maskara は 3 つすべてで右上にあり、redaction は判決文で区別性が 20% まで下がる" width="880" />
</p>

`maskara bench` は maskara とよく使われる手法を、同じ採点器で、私たちが作ったものではない 3 つのコーパスで採点します：[ABCD](https://github.com/asappresearch/abcd)（人が書いたサポート対話）、[Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII)（合成）、[TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark)（実際の判決文、人手でアノテーション）。各セルは **漏れた直接識別子**（低いほど良い）/ **区別が保たれた人**（高いほど良い：別々の二人が同じ置換値にならない）です。

| | ABCD（対話 1,004 件） | Nemotron-PII（文書 1,000 件） | TAB（判決 127 件） |
|---|---|---|---|
| 完璧に検出したうえで `[TYPE]` プレースホルダーに置換 | 0% / 71% | 0% / 66% | 0% / 20% |
| presidio | 18% / 85% | 22% / 75% | 38% / 23% |
| gliner2-pii | 8.2% / 94% | 19% / 89% | 41% / 41% |
| openai privacy filter | 6.5% / 64% | 18% / 68% | 51% / 22% |
| presidio + faker、文書ごとに値 1 つにつき偽の値 1 つ | 18% / 99.8% | 22% / 93% | 38% / 99.6% |
| **maskara**（ルール + gliner2） | **2.4% / 97%** | **4.9% / 93%** | 37% / 99.8% |
| **maskara** + `legal-echr` パターンパック | | | **2.5% / 99.8%** |

- TAB の直接識別子は、名前 228 件と事件番号 134 件（`no. 36110/97`）です。maskara を含むすべての汎用検出器が事件番号をほぼすべて見逃します。名前については、maskara の漏れは 0.4% です。オプトインの `legal-echr` パック（`--pattern legal-echr`）は事件番号を捕まえ、他の 2 つのコーパスの結果は何も変えません。
- 区別性は有用性の代理指標です。人が統合されなかったことは示しますが、マスキング後のデータで分析しても同じ答えが出ることまでは示しません。これらのコーパスではまだそこを測っていません。
- 既定の `balanced` プリセットは準識別子（組織、属性情報）の大半を残し、日付はずらすので、それらの多くは意図的にテキストに残ります。
- どのコーパスにも弱点があります：ABCD の正解データは対話の背後にあるシナリオカードから来ており、Nemotron-PII は生成テキストで、TAB は 127 文書からなる単一分野です。

4 つ目のコーパス `linked` も実行しています。誰が誰かが正確に分かるように私たちが生成したテーブルとテキストで、`bench --qa` によって、文書をまたぐ質問の答えが変わらないかを検証できます。自作のデータなので別に報告します。全数値・バージョン・注意点は [`docs/research/bench-results.md`](../research/bench-results.md)、設計と決定の記録は [`docs/research/v0-design.md`](../research/v0-design.md) にあります（どちらも韓国語）。再現するには：

```bash
uv sync --all-extras --all-groups
uv run maskara bench --corpus abcd nemotron-pii tab \
  --system oracle-redact presidio-redact gliner2-redact opf-redact presidio-fake-consistent maskara-gliner2 maskara-gliner2+echr
uv run python -m maskara.bench.hero --external docs/assets/hero-external.svg
```

現在は v0 で、英語のみ対応です。ペルソナは [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA)（CC BY 4.0）から、名前は [SSA の出生名統計](https://www.ssa.gov/oact/babynames/limits.html)から取るため、アメリカ人のペルソナになります。

## セキュリティ

maskara は手元のマシンで動き、何も外部に送りません。ネットワークを使うのは明示的に選んだときだけです：オプションのモデルは初回に一度だけダウンロードされ、`maskara bench` はコーパスをダウンロードし、`bench --qa llm` は設定したモデルのエンドポイントを呼び出します。v0 はセキュリティ監査を受けていないので、出力を共有する前にレポートを確認してください。セキュリティの問題は[非公開の advisory](https://github.com/maskaradev/maskara/security/advisories/new) で報告してください。

## 謝辞

ペルソナとサンプルデータの [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII)、[Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA)、[SSA の出生名統計](https://www.ssa.gov/oact/babynames/limits.html)、そしてベンチマークの [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark) と [ABCD](https://github.com/asappresearch/abcd) に感謝します

## 開発

```bash
uv sync --all-extras --all-groups
uv run pytest
uv run ruff check src tests
```

ランディングページとホスト版デモは `web/` にあります（Node.js 20.9 以上、pnpm 12）：

```bash
cd web
pnpm install
pnpm dev      # dev server: localhost:3000, and the demo at app.localhost:3000
pnpm lint     # eslint
pnpm build    # production build
```

ホスト版デモは `maskara ui --export web/public/demo` で作り直します。`web/` で作業する AI エージェントは、まず [`web/AGENTS.md`](../../web/AGENTS.md) を読んでください。各言語の README は英語の [README](../../README.md) を原文としています。

## ライセンス

maskara は [Apache License 2.0](../../LICENSE) で提供されます。同梱のペルソナとサンプルデータは CC BY 4.0 とパブリックドメインの資料から派生しています。詳しくは [`src/maskara/data/NOTICE`](../../src/maskara/data/NOTICE) を参照してください。

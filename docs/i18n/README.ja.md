# maskara


<p align="center">
  <img src="../../public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#クイックスタート">クイックスタート</a> · <a href="../../intents.md">意図</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.zh-CN.md">简体中文</a> · 日本語 · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**機微データを一貫した合成ペルソナに置き換え、AI の学習に使えるデータとして残します。**

- **消さずに置き換える** — 氏名・年齢・日付・ID は `[REDACTED]` ではなく合成ペルソナになります。診断・処方・テーブル間の関係はそのまま残ります。
- **1 人に 1 ペルソナ** — 同じ患者はすべてのテーブル・メモ・PDF・写真で同じペルソナになります。日付は患者ごとに同じだけずらすので、受診間隔が保たれます。
- **テキスト・PDF・写真を 1 回で** — 構造化カラムと自由記述のメモ、PDF はページごとの OCR、写真は顔をペルソナとして描き直し、画像内の文字も置き換えます。
- **AI が提案し、人が決める** — AI がカラムごとの扱い（保持、仮名化、ペルソナ、日付シフト…）を提案し、人が確定します。
- **エクスポート前に確認** — Privacy & utility レポートが出力に元の値が残っていないかを探し、受診間隔・年齢・テーブルの結合・分布が保たれたかを数値で示します。分析画面は両方に同じクエリを実行して比較します。
- **オンプレミス前提** — maskara は顧客ネットワーク内でローカル LLM により動くよう設計されています。現時点ではこの 2 つをブラウザストレージと Anthropic API で代用しています。[ロードマップ →](../../intents.md#roadmap)

---

## クイックスタート

```bash
git clone https://github.com/maskaradev/maskara
cd maskara
pnpm install
cp .env.example .env.local   # MASKING_ANTHROPIC_API_KEY を設定
pnpm dev
```

Node.js 20.9 以上、pnpm 12、Anthropic API キーが必要です。http://localhost:3000 を開き、**Datasets** で病院サンプルを読み込んでマスキングジョブを実行し、**Privacy & utility** タブを確認してください。ガイドツアーが同じ流れを案内します。その他の設定は [`.env.example`](../../.env.example) にあります。

> [!WARNING]
> これはまだオンプレミス版ではありません。**実際の個人データを入れないでください。** 自由記述テキストは Anthropic API に、写真と PDF ページは GPU サーバーに送信されます。セキュリティ上の問題は[非公開の advisory](https://github.com/maskaradev/maskara/security/advisories/new) で報告してください。

## 謝辞

サンプルデータを提供する [Synthea](https://github.com/synthetichealth/synthea)、[NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII)、[Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA)

## AI エージェントへ

このリポジトリを手伝う AI エージェントは、変更の前に [`AGENTS.md`](../../AGENTS.md) を読んでください。

## 開発

```bash
pnpm dev      # 開発サーバー
pnpm lint     # ESLint
pnpm build    # 本番ビルド
```

UI 文字列は `src/lib/i18n/en.ts` と `ko.ts` に一緒に追加します。翻訳の原文は英語の [README](../../README.md) です。

## ライセンス

maskara は [Apache License 2.0](../../LICENSE) で提供されます。`public/samples/` のサンプルデータセットはそれぞれのライセンスに従います。

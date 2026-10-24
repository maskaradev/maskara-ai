# maskara


<p align="center">
  <img src="../../public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#快速开始">快速开始</a> · <a href="../../intents.md">愿景</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.ko.md">한국어</a> · 简体中文 · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**把敏感数据替换为一致的合成人物，让数据依然可用于 AI 训练。**

- **替换，而不是抹除** — 姓名、年龄、日期和 ID 变成合成人物，而不是 `[REDACTED]`。诊断、处方以及表之间的关联保持不变。
- **一个人，一个合成人物** — 同一位患者在每张表、每条记录、每份 PDF 和每张照片中都是同一个合成人物。其所有日期平移相同的量，就诊间隔得以保留。
- **文本、PDF、照片一次处理** — 结构化列和自由文本记录，PDF 逐页 OCR，照片中的人脸重绘为合成人物，图中文字也会被替换。
- **AI 建议，人来决定** — AI 为每一列建议处理方式（保留、假名化、合成人物、日期平移……），由人确认。
- **导出前先检查** — Privacy & utility 报告会在输出中查找残留的原始值，并量化就诊间隔、年龄、表关联和分布是否得到保留。分析界面对两边运行同一查询进行对比。
- **为本地部署而设计** — maskara 旨在客户网络内使用本地 LLM 运行。目前这两部分暂由浏览器存储和 Anthropic API 代替。[路线图 →](../../intents.md#roadmap)

---

## 快速开始

```bash
git clone https://github.com/maskaradev/maskara
cd maskara
pnpm install
cp .env.example .env.local   # 填写 MASKING_ANTHROPIC_API_KEY
pnpm dev
```

需要 Node.js 20.9+、pnpm 12 和 Anthropic API 密钥。打开 http://localhost:3000，在 **Datasets** 中加载医院样本，运行一次脱敏任务，然后查看 **Privacy & utility** 标签页。引导教程会带你走完这个流程。其他设置见 [`.env.example`](../../.env.example)。

> [!WARNING]
> 这还不是本地部署版本。**请勿放入真实个人数据。** 自由文本会发送到 Anthropic API，照片和 PDF 页面会发送到 GPU 服务器。安全问题请通过[私密 advisory](https://github.com/maskaradev/maskara/security/advisories/new) 报告。

## 致谢

[Synthea](https://github.com/synthetichealth/synthea)、[NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII) 和 [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) 提供样本数据

## 给 AI 代理的说明

如果你是协助本仓库的 AI 代理，修改前请先阅读 [`AGENTS.md`](../../AGENTS.md)。

## 开发

```bash
pnpm dev      # 开发服务器
pnpm lint     # ESLint
pnpm build    # 生产构建
```

UI 字符串请同时添加到 `src/lib/i18n/en.ts` 和 `ko.ts`。翻译以英文 [README](../../README.md) 为准。

## 许可证

maskara 采用 [Apache License 2.0](../../LICENSE) 许可。`public/samples/` 中的样本数据集保留各自的许可证。

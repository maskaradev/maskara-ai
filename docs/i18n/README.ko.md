# maskara


<p align="center">
  <img src="../../public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="#빠른-시작">빠른 시작</a> · <a href="../../intents.md">의도</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · 한국어 · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-MVP-666666?labelColor=333333" alt="status: MVP" />
  <a href="https://github.com/maskaradev/maskara/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

https://github.com/user-attachments/assets/9f8c173c-8290-444c-8a75-a590fc4b9fdb

**민감정보를 일관된 가상 페르소나로 바꿔, AI 학습에 쓸 수 있는 데이터로 남깁니다.**

- **지우지 말고 바꾸기** — 이름·나이·날짜·ID는 `[REDACTED]` 대신 가상 페르소나가 됩니다. 진단·처방·테이블 간 관계는 그대로 둡니다.
- **한 사람, 한 페르소나** — 같은 환자는 모든 테이블·노트·PDF·사진에서 같은 페르소나가 됩니다. 날짜는 환자마다 같은 만큼 이동해 방문 간격이 유지됩니다.
- **텍스트·PDF·사진을 한 번에** — 정형 컬럼과 자유 텍스트 노트, PDF는 페이지별 OCR, 사진은 얼굴을 페르소나로 다시 그리고 이미지 속 글자까지 바꿉니다.
- **AI가 제안하고 사람이 결정** — AI가 컬럼마다 처리 방식(유지, 가명화, 페르소나, 날짜 이동 …)을 제안하고 사람이 확정합니다.
- **내보내기 전에 확인** — Privacy & utility 리포트가 결과물에 원본 값이 남았는지 찾고, 방문 간격·나이·테이블 연결·분포가 유지됐는지 수치로 보여줍니다. 분석 화면은 원본과 결과에 같은 쿼리를 돌려 비교합니다.
- **온프레미스를 전제로** — maskara는 고객 네트워크 안에서 로컬 LLM으로 돌아가도록 설계됐습니다. 지금은 이 두 부분을 브라우저 저장소와 Anthropic API가 대신합니다. [로드맵 →](../../intents.md#roadmap)

---

## 빠른 시작

```bash
git clone https://github.com/maskaradev/maskara
cd maskara
pnpm install
cp .env.example .env.local   # MASKING_ANTHROPIC_API_KEY 입력
pnpm dev
```

Node.js 20.9 이상, pnpm 12, Anthropic API 키가 필요합니다. http://localhost:3000 을 열고 **Datasets**에서 병원 샘플을 불러온 뒤 마스킹 작업을 실행하고, **Privacy & utility** 탭을 확인하세요. 처음 열면 가이드 투어가 같은 흐름을 안내합니다. 나머지 설정은 [`.env.example`](../../.env.example)에 있습니다.

> [!WARNING]
> 아직 온프레미스 빌드가 아닙니다. **실제 개인정보를 넣지 마세요.** 자유 텍스트는 Anthropic API로, 사진과 PDF 페이지는 GPU 서버로 전송됩니다. 보안 문제는 [비공개 advisory](https://github.com/maskaradev/maskara/security/advisories/new)로 알려 주세요.

## 감사

샘플 데이터를 제공한 [Synthea](https://github.com/synthetichealth/synthea), [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA)

## 에이전트 안내

이 저장소를 돕는 AI 에이전트라면 변경 전에 [`AGENTS.md`](../../AGENTS.md)를 읽어 주세요.

## 개발

```bash
pnpm dev      # 개발 서버
pnpm lint     # ESLint
pnpm build    # 프로덕션 빌드
```

UI 문자열은 `src/lib/i18n/en.ts`와 `ko.ts`에 함께 추가합니다. 번역 README의 원본은 영어 [README](../../README.md)입니다.

## 라이선스

maskara는 [Apache License 2.0](../../LICENSE)으로 배포됩니다. `public/samples/`의 샘플 데이터셋은 각자의 라이선스를 따릅니다.

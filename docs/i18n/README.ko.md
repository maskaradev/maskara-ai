# maskara


<p align="center">
  <img src="../../web/public/brand/logo.png" alt="maskara" width="100" />
</p>

<p align="center">
  <a href="https://maskara.dev">maskara.dev</a> · <a href="https://app.maskara.dev">데모</a> · <a href="#빠른-시작">빠른 시작</a> · <a href="../../intents.md">의도</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · 한국어 · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-v0-666666?labelColor=333333" alt="status: v0" />
  <a href="https://github.com/maskaradev/maskara-ai/stargazers"><img src="https://img.shields.io/github/stars/maskaradev/maskara-ai?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
</p>

---

**개인정보를 일관된 가상 페르소나로 바꾸고, 데이터의 유용성과 남은 노출을 측정합니다.**

<p align="center">
  <a href="https://app.maskara.dev"><img src="../assets/showroom.png" alt="maskara 쇼룸: 샘플 실행의 수치와 마스킹 전후의 고객 문의" width="880" /></a>
</p>

- **지우지 말고 바꾸기** — 이름·이메일·전화번호·주소·날짜·ID는 `[REDACTED]`가 아니라 가상 페르소나의 값이 됩니다. 나머지 텍스트는 그대로 둡니다.
- **한 사람, 한 페르소나** — 같은 고객은 모든 테이블과 그 사람이 나오는 모든 텍스트에서 같은 페르소나가 되고, vault를 쓰면 다음 실행에서도 같습니다.
- **날짜는 함께 이동** — 한 사람의 날짜는 모두 같은 만큼 이동하므로 날짜 사이 간격이 정확히 유지됩니다.
- **조인이 깨지지 않음** — 같은 ID는 모든 테이블과 텍스트에서 같은 값으로 바뀌고, 앞의 문자 접두어는 그대로 남습니다(`CUS-575198` → `CUS-224730`).
- **preset** — `strict`, `balanced`(기본), `max_utility` 중에서 페르소나가 원본의 나이·지역·배경을 얼마나 가깝게 따를지 고릅니다.
- **로컬 vault, 원본 저장 없음** — `.maskara/vault.db`가 실행 간에 페르소나를 고정합니다. 키를 건 해시와 가상 값만 저장하고 원본은 저장하지 않습니다.
- **탐지** — 이메일·전화·카드·ID·날짜 규칙에 더해, 테이블에 이미 있는 값을 텍스트에서도 찾습니다. `maskara-ai[gliner]`로 GLiNER2 PII 모델을 더할 수 있고, 분야별 ID 형식은 패턴 팩으로 켭니다(`legal-echr`).
- **실행마다 리포트** — 결과물에 남은 원본, 깨진 조인, 날짜 간격, 여전히 파싱되는 형식, 유지한 속성의 k-익명성과 그에 대한 연결 공격. 측정하지 못한 항목도 함께 적습니다.
- **`maskara ui`** — 실행 결과를 전후로 나란히 보는 로컬 뷰어로, 127.0.0.1에만 열립니다.
- **작고 오프라인** — 코어는 Python 표준 라이브러리만 쓰고 네트워크가 필요 없습니다.

## 빠른 시작

```bash
pip install git+https://github.com/maskaradev/maskara-ai   # python 3.11+
maskara demo        # mask the bundled sample store and print the report
maskara ui --demo   # see it side by side in the browser
```

PyPI에 올라가면 `pip install maskara-ai`가 됩니다. PyPI의 `maskara`는 다른 프로젝트입니다. GLiNER2 모델까지 설치하려면:

```bash
pip install "maskara-ai[gliner] @ git+https://github.com/maskaradev/maskara-ai"
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

테이블은 dict 리스트, CSV·JSONL 경로, pandas DataFrame을 받고, 넣은 것과 같은 타입으로 돌려줍니다. 텍스트는 문자열 리스트, `.txt`·`.jsonl` 경로, pandas Series를 받습니다. 페르소나는 vault 키에서 나오므로 위 예시와 다르게 나옵니다.

소유자가 모호한 값은 연결을 보류하고 치환은 계속합니다. `result.review`에서 위치·사유를 확인하고,
각 mention의 `resolution`, `evidence`, `candidate_count`로 판단 근거를 확인할 수 있습니다.
표에 없는 이름은 문서 안에서만 임시로 묶습니다. 문서·실행 간 인물을 안정적으로 연결하려면 명시적인 subject 키를 제공하세요.

v0의 알려진 제한: 표 근거 없이 같은 문장에 나온 이름과 이메일·전화번호는 서로 다른 페르소나로 바뀔 수 있습니다.
공동 사건과 일반적인 공지시 해석은 아직 구현하지 않았습니다. [인물 연결 문서](../research/identity-resolution.md)에 동작과 한계를 정리했습니다.

### CLI

```bash
maskara mask --table customers=customers.csv --table orders=orders.csv --text tickets=tickets.jsonl \
  --subject customers=customer_id --subject orders=customer_id --subject tickets=customer_id \
  --out masked/
```

`masked/`에는 입력마다 같은 이름의 파일과 `report.json`, `report.html`, `mentions.jsonl`, `review.json`이 생깁니다.
검토 파일에는 원본 값 없이 위치·상태·사유·후보 수를 기록하며, 입력 이름과 열 이름은 유지합니다.
검토 항목이 없다는 사실이 개인정보 보호나 연결 정확도를 보장하지는 않습니다.
`maskara report masked/`는 리포트를 다시 출력하고, 나머지 옵션은 `maskara mask --help`에 있습니다.

`maskara bench-identity --out runs/identity`는 정답 span을 이용해 연결 정밀도·재현율·보류율을 측정합니다.
기본 32개 사례는 직접 작성한 진단용 자료이며 독립 고객 평가가 아닙니다. `--cases 경로.json`으로 같은 형식의 별도 정답셋을 넣을 수 있습니다.

## 벤치마크

<p align="center">
  <img src="../assets/hero-external.png" alt="ABCD, Nemotron-PII, TAB에서 직접 식별자를 가린 비율과 구별성을 비교한 그래프: maskara는 세 코퍼스 모두에서 오른쪽 위에 있고, redaction은 판결문에서 구별성이 20%까지 떨어집니다" width="880" />
</p>

`maskara bench`는 maskara와 흔히 쓰는 방식들을 같은 채점기로, 우리가 만들지 않은 세 코퍼스에서 채점합니다: [ABCD](https://github.com/asappresearch/abcd)(사람이 쓴 고객 상담 대화), [Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII)(합성), [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark)(실제 판결문, 사람이 직접 주석). 각 칸은 **샌 직접 식별자**(낮을수록 좋음) / **구별이 유지된 사람**(높을수록 좋음: 서로 다른 두 사람이 같은 대체값으로 합쳐지지 않음)입니다.

| | ABCD (대화 1,004건) | Nemotron-PII (문서 1,000건) | TAB (판결 127건) |
|---|---|---|---|
| 완벽하게 탐지한 뒤 `[TYPE]` 플레이스홀더로 대체 | 0% / 71% | 0% / 66% | 0% / 20% |
| presidio | 18% / 85% | 22% / 75% | 38% / 23% |
| gliner2-pii | 8.2% / 94% | 19% / 89% | 41% / 41% |
| openai privacy filter | 6.5% / 64% | 18% / 68% | 51% / 22% |
| presidio + faker, 문서마다 값 하나에 가짜 값 하나 | 18% / 99.8% | 22% / 93% | 38% / 99.6% |
| **maskara** (규칙 + gliner2) | **2.4% / 97%** | **4.9% / 93%** | 37% / 99.8% |
| **maskara** + `legal-echr` 패턴 팩 | | | **2.5% / 99.8%** |

- TAB의 직접 식별자는 이름 228개와 사건 번호 134개(`no. 36110/97`)입니다. maskara를 포함한 모든 범용 탐지기가 사건 번호를 거의 다 놓치며, 이름만 보면 maskara가 새는 비율은 0.4%입니다. 선택형 `legal-echr` 팩(`--pattern legal-echr`)은 사건 번호를 잡아내고, 나머지 두 코퍼스의 결과는 바꾸지 않습니다.
- 구별성은 유용성의 대리 지표입니다. 사람들이 합쳐지지 않았다는 것은 보여 주지만, 마스킹한 데이터로 분석해도 같은 답이 나온다는 것까지 보여 주지는 않습니다. 이 코퍼스들에서는 아직 그것을 측정하지 않았습니다.
- 기본 preset인 `balanced`는 준식별자(조직, 인구통계 정보) 대부분을 그대로 두고 날짜는 이동시키므로, 이런 정보 상당수는 의도적으로 텍스트에 남습니다.
- 코퍼스마다 약점이 있습니다: ABCD의 정답은 대화 뒤에 있는 시나리오 카드에서 나오고, Nemotron-PII는 생성된 텍스트이며, TAB는 문서 127건으로 이루어진 단일 분야입니다.

네 번째 코퍼스 `linked`도 돌립니다. 누가 누구인지 정확히 알 수 있도록 우리가 생성한 테이블과 텍스트라서, `bench --qa`로 여러 문서에 걸친 질문의 답이 그대로인지 시험할 수 있습니다. 우리가 만든 데이터라 따로 보고합니다. 전체 수치와 버전, 주의 사항은 [`docs/research/bench-results.md`](../research/bench-results.md)에, 설계와 결정 기록은 [`docs/research/v0-design.md`](../research/v0-design.md)에 있습니다. 재현하려면:

```bash
uv sync --all-extras --all-groups
uv run maskara bench --corpus abcd nemotron-pii tab \
  --system oracle-redact presidio-redact gliner2-redact opf-redact presidio-fake-consistent maskara-gliner2 maskara-gliner2+echr
uv run python -m maskara.bench.hero --external docs/assets/hero-external.svg
```

지금은 v0이고 영어만 지원합니다. 페르소나는 [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA)(CC BY 4.0)에서, 이름은 [SSA 출생 이름 통계](https://www.ssa.gov/oact/babynames/limits.html)에서 가져오므로 미국인 페르소나입니다.

## 보안

maskara는 내 컴퓨터에서 돌아가며 아무것도 밖으로 보내지 않습니다. 네트워크는 직접 켤 때만 씁니다: 선택 모델은 처음 쓸 때 한 번 내려받고, `maskara bench`는 코퍼스를 내려받으며, `bench --qa llm`은 지정한 모델 엔드포인트를 호출합니다. v0은 보안 감사를 받지 않았으니 결과물을 공유하기 전에 리포트를 확인하세요. 보안 문제는 [비공개 advisory](https://github.com/maskaradev/maskara-ai/security/advisories/new)로 알려 주세요.

## 감사

페르소나와 샘플 데이터를 제공한 [NVIDIA Nemotron-PII](https://huggingface.co/datasets/nvidia/Nemotron-PII), [Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA), [SSA 출생 이름 통계](https://www.ssa.gov/oact/babynames/limits.html), 그리고 벤치마크를 제공한 [TAB](https://github.com/NorskRegnesentral/text-anonymization-benchmark)과 [ABCD](https://github.com/asappresearch/abcd)

## 개발

```bash
uv sync --all-extras --all-groups
uv run pytest
uv run ruff check src tests
```

랜딩 페이지와 호스팅 데모는 `web/`에 있습니다(Node.js 20.9 이상, pnpm 12):

```bash
cd web
pnpm install
pnpm dev      # dev server: localhost:3000, and the demo at app.localhost:3000
pnpm lint     # eslint
pnpm build    # production build
```

`maskara ui --export web/public/demo`로 호스팅 데모를 다시 만듭니다. `web/`에서 작업하는 AI 에이전트라면 먼저 [`web/AGENTS.md`](../../web/AGENTS.md)를 읽어 주세요. 번역 README의 원본은 영어 [README](../../README.md)입니다.

## 라이선스

maskara는 [Apache License 2.0](../../LICENSE)으로 배포됩니다. 함께 들어 있는 페르소나와 샘플 데이터는 CC BY 4.0과 퍼블릭 도메인 자료에서 파생했습니다. [`src/maskara/data/NOTICE`](../../src/maskara/data/NOTICE)를 참고하세요.

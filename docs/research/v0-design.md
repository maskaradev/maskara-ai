# maskara v0 설계 — 처음부터 다시

작성일: 2026-10-25 · 상태: 초안 · 범위: 영어, 범용 도메인

`engine-extraction.md`는 기존 해커톤 코드를 어떻게 분리할지에 대한 조사다. 이 문서는 그 코드를 기반으로 삼지 않는다. 그 조사에서는 모델 지형(§4), CLI 패턴(§5), vault 설계(§6), 함정 목록(§2.4–2.5)만 가져온다.

## 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-10-25 | v0는 영어만 지원한다 | 바이럴과 YC의 청중이 영어권이다. 한국어는 나중에 차별점으로 쓸 수 있다 |
| 2026-10-25 | 도메인은 범용이다 (의료 우선 아님) | 시장이 넓다. 메시지는 "redaction은 데이터를 망가뜨린다"로 묶는다 |
| 2026-10-25 | 이 저장소의 루트를 Python 엔진으로 쓰고, 웹앱은 `web/`으로 옮긴다 | star와 브랜드를 한 저장소에 모은다. 배포하려면 Vercel Root Directory를 `web`으로 바꿔야 한다 |
| 2026-10-25 | 측정 도구(M0)를 실제 데이터부터 만든다 | 데이터셋이 빈약하다. 합성 데이터만으로 낸 숫자는 신뢰를 얻지 못한다 |
| 2026-10-25 | 벤치마크는 현실성 수준이 다른 층으로 구성하고, 결과는 항상 층별로 따로 보고한다 | TAB(실제), ABCD(사람이 작성), Nemotron-PII(합성), maskara-linked(합성, 연결 구조)의 약점이 각각 다르다 |
| 2026-10-25 | 다음 작업으로 최신 탐지 모델(OpenAI Privacy Filter, GLiNER2-PII)을 같은 채점기로 비교한다 | Presidio 기본값은 판결문에서 직접식별자의 38%를 놓쳤다. "좋은 탐지기는 이미 있다"는 전제부터 검증한다 |
| 2026-10-26 | 기본 탐지는 규칙 + GLiNER2로 하고, OPF는 선택 옵션으로 둔다 | 직접식별자 누출: 규칙+GLiNER2가 ABCD 2.7%, Nemotron 5.5%, TAB 2.6%로 셋 모두 최저다. 단일 모델은 데이터마다 순위가 바뀐다. OPF는 CPU에서 GLiNER2보다 약 10배 느리다 |
| 2026-10-26 | 공개 수치(README, 런칭)는 외부 코퍼스 세 개(TAB, ABCD, Nemotron-PII)를 기준으로 하고, linked는 따로 보고한다 | linked의 0.1%는 표에서 아는 값을 텍스트에서 찾은 결과다. 텍스트만 넣으면 42.3%다. 우리가 만든 데이터라 자기 채점이라는 비판을 받을 수 있다 |
| 2026-10-26 | 사건번호처럼 분야 전용 ID 형식은 코어에서 빼고, 사용자가 추가하는 도메인 팩으로 둔다. 벤치는 팩 없이/있이 둘 다 공개한다 | 현재 사건번호 규칙의 값 모양(`12345/97`)이 ECHR 형식 그대로다. 이 규칙이 TAB 직접 누출을 약 37%에서 2.6%로 낮추므로, 빼고 낸 숫자가 정직한 범용 수치다 |
| 2026-10-26 | PyPI 배포 이름은 `maskara-ai`로 하고, import 이름은 `maskara`로 둔다 | PyPI `maskara`는 무관한 활성 프로젝트가 쓰고 있고 `maskara-ai`는 비어 있다. 코드와 문서의 `import maskara`는 그대로다 |

## 1. 한 줄 정의

**Detectors find PII. maskara makes the data still usable — and proves it.**

PII 탐지는 이미 좋은 오픈 모델이 있다(OpenAI Privacy Filter, GLiNER2-PII, Presidio). maskara는 그 위의 레이어를 맡는다.

1. **대체 (persona)**: 탐지된 값을 지우지 않고, 같은 사람은 테이블·문서 전체에서 같은 가상 인물로 바꾼다. 가상 인물은 나이·성별·지역 같은 속성이 원본과 맞고, 이름·이메일·전화·주소가 서로 정합하다.
2. **측정 (proof)**: 결과가 뭉개지지 않았는지(fidelity, utility)와 새지 않았는지(privacy)를 같은 리포트에 숫자로 낸다.

이 중 2번이 바이럴과 YC 서사의 중심이다. 대체 기능은 경쟁자도 주장하지만, 양쪽을 재현 가능한 숫자로 보여주는 오픈소스는 없다.

## 2. 경쟁 지형

| 도구 | 성격 | 일관된 대체 | 품질 측정 | maskara와의 관계 |
|---|---|---|---|---|
| Microsoft Presidio | OSS(MIT) 탐지+익명화 프레임워크 | 기본은 `<ENTITY>` 치환. fake 치환 가능하지만 매핑 공유는 사용자 몫이고 예제는 thread-safe하지 않다 [P5] | 없음 | 탐지 backend 후보이자 벤치마크 baseline |
| OpenAI Privacy Filter, GLiNER2-PII, NVIDIA GLiNER-PII | 탐지 모델 | 없음 | 벤더 F1 | 탐지 플러그인 |
| **Tonic Textual** | 상용(SDK는 API key 필요) | 있음. 동일 원본은 동일 대체값, LLM 기반 문맥 합성 [T1] | **PrivacyBench**: NER recall + 대체 일관성(LLM judge). downstream 학습 성능은 측정하지 않음 [T2] | **실질적 경쟁자.** 오픈소스·로컬 실행·downstream 측정으로 차별화 |
| NVIDIA NeMo Safe Synthesizer | NeMo 마이크로서비스. PII 대체 후 합성 모델 학습 [N1] | PII 대체 단계 있음 | 합성 데이터 평가 | 목표가 "새 데이터 생성"이라 다르다. maskara는 원본 구조를 유지한 치환 |
| cloakpipe, pseudollm, AnonLFI 2.0 등 | 소규모 OSS / 연구 [R1] | 일부 있음(HMAC, LLM) | 거의 없음 | 니치. 성숙도·라이선스는 미확인 |

**근거가 되는 숫자.** 2026년 논문 [R2]은 고객지원 대화(ABCD)에서 처리 방식별로 같은 지표를 비교했다.

| 방식 | PII recall | 엔티티 의존 Q&A | LoRA MAE |
|---|---:|---:|---:|
| Presidio | 0.56 | 0.52 | 0.030 |
| Redaction | 0.98 | **0.26** | **0.417** |
| Redaction + substitution | 0.98 | 0.75 | 0.055 |
| LLM 대체 | 0.99 | **0.96** | 0.029 |

지우면 안전하지만 데이터가 쓸모없어지고, 탐지를 느슨하게 하면 데이터는 남지만 PII가 샌다. **"높은 recall + 대체"만 두 축을 모두 지킨다**는 것이 maskara의 주장이다. 다만 이 논문은 문서 간 일관성을 다루지 않았고 코드도 공개하지 않았다. 그 빈칸을 우리가 채운다.

## 3. 페르소나 엔진

### 3.1 속성 보존 정책 — "완벽한 페르소나"와 프라이버시의 긴장

원본과 나이·성별·지역이 정확히 같은 페르소나는 utility에는 최선이지만, 그 조합 자체가 준식별자(quasi-identifier)다. 미국 인구의 대다수는 ZIP + 생년월일 + 성별만으로 유일하게 식별된다는 고전적 결과가 있다(Sweeney). 따라서 "얼마나 똑같이 맞출지"는 고정값이 아니라 **사용자가 고르는 다이얼**이어야 하고, 리포트가 그 선택의 대가를 숫자로 보여줘야 한다.

| 속성 | `strict` | `balanced` (기본) | `max_utility` |
|---|---|---|---|
| 나이 | 10세 구간 안에서 재추출 | 5세 구간 안에서 재추출 | 정확한 나이 유지 |
| 성별 | 유지 | 유지 | 유지 |
| 지역 | Census region | 주(state) | 주 + 도시 규모 |
| 날짜 | 사람별 ±180일 이동 | 사람별 ±30일 이동 | 사람별 ±30일 이동 |
| 직업·학력 | 제거 또는 대분류 | 대분류 유지 | 유지 |
| 이름 | 무작위 | 성별 × 출생 코호트에 맞춤 | 성별 × 출생 코호트에 맞춤 |

어느 preset이든 **사람 내부의 날짜 간격**과 **엔티티 연결(같은 사람 = 같은 페르소나)**은 정확히 보존한다. 이것이 redaction이 못 하는 핵심 utility다.

### 3.2 정합성 체인

한 페르소나의 필드는 서로 모순되지 않게 순서대로 생성한다.

```text
보존 속성(성별, 나이 구간, 지역)
  → Nemotron-Personas-USA에서 조건부 표본 (나이·성별·주·ZIP·직업·학력)
  → 이름: 성별 × 출생연도 분포에 맞춘 이름 + 성
  → 이메일: 이름에서 파생, 예약 도메인(example.com 등) 또는 설정한 도메인
  → 전화: ZIP/주에 맞는 지역번호, 실사용 번호 대역 회피(555-01xx 등)
  → 주소: ZIP과 정합하는 가상 주소
  → ID·카드번호: 원본 형식 유지, 체크섬(Luhn 등) 유효, 실재 대역 회피
```

### 3.3 데이터 소스

| 소스 | 용도 | 라이선스 | 주의 |
|---|---|---|---|
| **Nemotron-Personas-USA** v1.1 | 페르소나 속성의 결합 분포 | CC BY 4.0 [D1] | 1M 레코드, 고유 이름 약 97만 개. **이름이 별도 컬럼이 아니라 persona 텍스트 안에 있어** 추출 단계가 필요하다. **성인만** 있다. 직업은 학력·나이·성별이 주어지면 지역과 독립이라고 가정했다. |
| **Nemotron-PII** | privacy 벤치마크 gold(span 라벨) | CC BY 4.0, 상업 이용 가능 [D2] | NeMo Data Designer로 만든 합성 데이터. 55개 이상 라벨, 30개 도메인, structured/unstructured, `us`/`intl` 로케일. 이 데이터에서만 점수가 높으면 과적합이라는 비판을 받으므로 보조 평가셋이 필요하다. 카드에는 100k(50k/50k)로 적혀 있지만 뷰어에는 200k 행이 보인다. 확인이 필요하다. |
| SSA 출생 이름 통계, Census 성씨 통계 | 이름의 출생 코호트 매칭, 미성년자 페르소나 | 미국 정부 공개 데이터(확인 필요) | Nemotron-Personas에 없는 미성년자와 연도별 이름 빈도를 보완한다. |

**열린 정책 문제:** 이름의 문화적 배경(예: 히스패닉계 이름 → 히스패닉계 이름)을 보존하면 분석 utility는 오르지만, 이름으로 민족을 추론하는 일이 된다. 기본값은 끄고 opt-in으로 두되 리포트에 기록하자는 안이다.

## 4. 측정 — maskara report

리포트는 세 축으로 구성한다. 모든 지표는 "측정한 범위"와 "측정하지 못한 범위"를 함께 출력한다.

### 4.1 Privacy — 새지 않았는가

| 지표 | 정의 | gold 필요 |
|---|---|---|
| Span recall / precision / F1 | exact span + type 일대일 매칭. 경계 부분 일치는 별도 지표 | 예 |
| 잔존 PII 문자율 | gold PII 문자 중 출력에 남은 비율 | 예 |
| 원본 재등장 검사 | 입력에서 알려진 원본값이 출력에 문자열로 남았는지 확인(정규화·부분 일치 포함) | 아니오 |
| 준식별자 유일성 | 보존한 속성 조합이 유일한 레코드 비율, k-anonymity 분포 | 아니오 |
| 연결 공격 시뮬레이션 | 원본 ↔ 출력을 보존 속성으로 매칭했을 때의 재식별률 | 아니오(원본을 로컬에서 사용) |

### 4.2 Fidelity — 구조가 뭉개지지 않았는가

| 지표 | 정의 |
|---|---|
| 스키마·행 수·PK/FK 무결성 | 깨진 조인 수 0이 목표 |
| 엔티티 연결 보존 | 원본에서 같은 사람인 mention 쌍이 출력에서도 같은 페르소나인지(pairwise P/R) |
| 사람 내부 날짜 간격 | 원본 간격과 출력 간격의 차이(정확히 0이 목표) |
| 분포 보존 | 보존 속성의 주변·결합 분포 거리(TVD, KS) |
| 형식 유효성 | 이메일·전화·카드번호·날짜가 파싱되고 체크섬을 통과하는 비율 |
| 텍스트 자연스러움 | `[REDACTED]` 같은 placeholder 비율, 대체값의 문맥 적합성 |
| 비민감 문자열 보존 | PII 이외 토큰의 변경률(과잉 마스킹) |

### 4.3 Utility — 학습·분석에 여전히 쓸 수 있는가

리포트 기본값에는 넣지 않고 `maskara bench`로 돌린다.

- **Entity QA**: "주문 #X를 취소한 고객이 이전에 무슨 문의를 했나?"처럼 같은 사람을 여러 문서에서 이어야 답할 수 있는 질문을 원본/출력 양쪽에서 LLM에 묻고 정답률을 비교한다. 일관된 대체의 가치를 가장 직접 보여준다.
- **Fine-tune parity**: 원본, redaction, Presidio fake, maskara 버전으로 같은 소형 모델을 학습하고 같은 held-out 원본 테스트에서 점수를 비교한다.
- **Analytics parity**: 같은 SQL/pandas 질의(집계, 코호트, 간격)를 양쪽에서 실행해 결과 차이를 본다.

### 4.4 벤치마크 코퍼스

1. **Nemotron-PII test**: privacy 축.
2. **maskara-linked**(신규, 공개): Nemotron-Personas로 인물을 뽑아 연결된 테이블(users, orders, tickets)과 그 인물들이 등장하는 자유 텍스트를 생성한다. 정답(누가 누구인지)을 알기 때문에 엔티티 연결 보존과 Entity QA를 채점할 수 있다. **이게 우리 고유의 벤치마크이자 공개 자산이다.**
3. **Tonic PrivacyBench 제출**: 경쟁자의 공개 벤치마크에서 오픈소스로 점수를 내면 신뢰도를 빌릴 수 있다. 데이터셋과 채점 코드 라이선스는 확인이 필요하다 [T2].

## 5. 런칭과 바이럴 전략

1. **히어로 차트**: x축 privacy(잔존 PII), y축 utility(Entity QA 정답률). Redaction은 오른쪽 아래, Presidio는 왼쪽 위, maskara는 오른쪽 위. README 맨 위, 런칭 포스트, YC 지원서에 같은 그림을 쓴다.
2. **30초 첫 경험**: `pip install` → `maskara demo`가 번들된 합성 데이터를 처리하고 before/after와 리포트 HTML을 연다. 모델 다운로드가 끝난 뒤에는 네트워크 없이 동작해야 한다.
3. **HF Space**: 설치 없이 텍스트를 붙여 넣어 보는 데모. 단, 실데이터 입력은 경고한다.
4. **리더보드**: maskara-linked + Nemotron-PII에서 탐지 backend별·preset별 점수를 공개하고 외부 제출을 받는다. 경쟁 도구가 많을수록 리더보드의 가치가 커진다.
5. **런칭 글 제목 후보**: "Redaction is destroying your training data — we measured it."

## 6. v0 범위

**포함**
- 영어 전용
- 입력: CSV, Parquet, pandas DataFrame, 자유 텍스트(문자열, JSONL, TXT)
- 다중 테이블 + 텍스트를 하나의 subject key로 연결
- 규칙 recognizer(이메일, 전화, SSN, 카드 등) + 교체 가능한 탐지 모델 1개(기본값은 벤치마크로 결정)
- 페르소나 엔진(§3) + preset 3종
- 암호화 vault(SQLCipher 우선 검토). 재실행 시 같은 사람은 같은 페르소나로 유지
- report JSON/HTML(§4.1–4.2), `bench`(§4.3)
- CPU 전용, 오프라인 모드

**제외(후속)**: PDF/OCR, 이미지·얼굴, 음성, DB 커넥터, 영어 외 언어, 웹 UI 재작성

## 7. 인터페이스 초안

```python
import maskara

result = maskara.mask(
    tables={"users": users_df, "orders": orders_df},
    texts={"tickets": tickets_df["body"]},
    subjects={"users": "user_id", "orders": "user_id", "tickets": "user_id"},
    preset="balanced",
    vault=".maskara/vault.db",
)

result.tables["users"]       # masked DataFrame
result.texts["tickets"]      # masked Series
result.report.summary()      # privacy / fidelity numbers
result.report.to_html("report.html")
```

```bash
maskara demo
maskara mask config.yaml --out out/
maskara report out/report.json --html
maskara bench --suite linked --detector gliner2-pii --preset balanced
```

### 패키지 구조

```text
maskara/
  api.py           # mask(), MaskResult
  cli.py
  detect/          # Detector protocol; rules, opf, gliner2, presidio adapters
  resolve/         # mention → entity (subject key 우선, 텍스트 coreference 보조)
  persona/         # sampler(Nemotron), names(SSA/Census), coherence chain, presets
  transform/       # 대체 적용, offset 보존, 날짜 이동, 형식 보존
  vault/           # 암호화 상태, HMAC lookup, 트랜잭션
  report/          # privacy, fidelity 지표, HTML
  bench/           # suites, utility tasks, leaderboard export
  data/            # 페르소나·이름 자산 관리(최초 1회 다운로드, 체크섬)
```

`engine-extraction.md` §2.4–2.5에서 가져올 설계 규칙:
- 탐지 결과와 엔티티 ID를 분리한다. 모델이 바뀌어도 같은 사람이 다른 사람이 되지 않는다.
- 결정성은 vault의 비밀키 + 안정 namespace에서 나온다. `--seed`는 공개 재현용으로만 쓴다.
- 결과물에 원본값을 넣지 않는다. audit은 별도로 암호화한다.
- span offset 단위(code point)를 계약에 명시한다.
- 실패 시 원본을 통과시키지 않는다(종료 코드로 구분).

## 8. 마일스톤(순서만, 기간 미정)

1. **M0 측정 먼저**: `maskara-linked` 생성기 + 채점기. Redaction, Presidio baseline 숫자 확보. 이 단계만으로도 공개 가치가 있다.
2. **M1 페르소나 엔진**: Nemotron 조건부 샘플러, 이름 코호트, 정합성 체인, preset, vault.
3. **M2 탐지 + 해석**: 규칙 + 모델 1개, subject key 기반 연결.
4. **M3 report + bench**: 히어로 차트를 재현할 수 있는 상태.
5. **M4 런칭**: README, demo, HF Space, 리더보드, 런칭 글.

측정을 먼저 만드는 이유는, 엔진의 모든 결정(탐지 모델 선택, preset 기본값)을 숫자로 내리기 위해서다. 런칭 차트도 같은 코드에서 나온다.

## 9. 열린 질문

1. **패키지 이름**: PyPI `maskara`는 무관한 활성 프로젝트가 쓰고 있다(Desperate-Dan/maskara, 최근 릴리스 2026-08). `maskara-ai`는 비어 있다(2026-10-25 확인). → 결정: 배포 이름 `maskara-ai`, import 이름 `maskara` (2026-10-26, 결정 기록 참고).
2. **기본 탐지 모델**: OpenAI Privacy Filter(Apache-2.0, 큼) vs GLiNER2-PII(Apache-2.0, 1.23GB). M0 벤치마크로 결정한다.
3. **텍스트 내 엔티티 해석**: subject key가 없는 자유 텍스트에서 "John"과 "Mr. Smith"를 같은 사람으로 묶는 방법. 규칙 + 소형 모델이 v0 목표이고, 로컬 LLM은 옵션으로 둔다.
4. **이름 문화권 보존**을 opt-in으로 둘지(§3.3).
5. **기존 웹앱의 역할**: 런칭 때 maskara.dev 데모로 유지할지, 리포트 뷰어로 축소할지.

## 출처

2026-10-25 열람 기준.

- [P5] Presidio pseudonymization 예제 — https://github.com/data-privacy-stack/presidio/blob/main/docs/samples/python/pseudonymization.ipynb
- [T1] Tonic Textual synthesis options — https://docs.tonic.ai/textual/dataset-configure-redaction/textual-datasets-synthesis-options
- [T2] Tonic PrivacyBench — https://www.tonic.ai/ai-model-benchmarks/privacy-bench
- [N1] NVIDIA NeMo Safe Synthesizer PII replacement — https://docs.nvidia.com/nemo/microservices/25.10.0/generate-private-synthetic-data/configuration/replace-pii-config.html
- [R1] GitHub pseudonymization topic — https://github.com/topics/pseudonymization · AnonLFI 2.0 — https://arxiv.org/pdf/2511.15744
- [R2] Anonymous-by-Construction (arXiv 2603.17217) — https://arxiv.org/html/2603.17217v1
- [D1] Nemotron-Personas-USA — https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA
- [D2] Nemotron-PII — https://huggingface.co/datasets/nvidia/Nemotron-PII
- PyPI `maskara` — https://pypi.org/project/maskara/

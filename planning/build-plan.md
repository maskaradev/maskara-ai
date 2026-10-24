# maskara 빌드 계획 · 방향 B (페르소나 기반 가명 처리)

## 결정 사항 (2026-10-24)

- **방향:** 원본 기록은 그대로 두고, 개인정보만 찾아서 일관된 가상 페르소나로 교체한다.
- **도메인:** 의료 (미국 병원 가상 데이터, 영어)
- **탐지:** 규칙 기반 + 로컬 LLM. `DETECTOR=local|claude` 스위치를 둔다.
- **모달리티:** DB 테이블, 진료 메모(텍스트), 의료 이미지, 진료 통화 오디오
- **Claude 역할:** 페르소나 생성, 스위치를 켰을 때 탐지, 마스킹 결과 검증과 리포트. `local` 모드에서는 원본이 Claude에 가지 않는다.

## 1. 데모 시나리오 (3분)

1. 병원 DB에 연결한다. 화면에 **READ ONLY** 배지가 보인다.
2. 실행한다. 탐지 → 동일 인물 묶기 → 페르소나 배정 → 교체 단계가 진행 표시로 보인다.
3. 비교 화면에서 원본, `[REDACTED]`, maskara를 3열로 보여 준다. 같은 환자가 테이블, 메모, X-ray, 통화 녹음 모두에서 같은 페르소나로 바뀐다. 페르소나를 클릭하면 모든 등장 위치가 하이라이트된다.
4. 리포트에서 지표 4개(정답 보존율, 비개인정보 보존율, 유출률, 일관성)를 maskara와 `[REDACTED]`로 나란히 비교한다.
5. 탐지기 스위치를 `local` ↔ `claude`로 바꿔 보인다.

## 2. 전체 구조

```
원본: SQLite (READ ONLY) + 이미지·오디오 파일
  │
  ├─ ① 정규화 ── 이미지: OCR (글자 + 위치)
  │              오디오: 음성 인식 (단어 + 타임스탬프)
  │              → 모든 모달리티를 "텍스트 + 위치" 형태로 통일
  ├─ ② 탐지 ──── 규칙 (컬럼 매핑 · DB 사전 · 정규식) → LLM (local | claude)
  ├─ ③ 동일 인물 묶기 (entity resolution)
  ├─ ④ 페르소나 배정 (vault) + 환자별 날짜 이동
  ├─ ⑤ 교체 ──── 테이블·텍스트 치환 / 이미지 재렌더 / 오디오 스플라이스·재음성
  │              → 결과 저장소 (masked.db + 파일), 원본과 분리
  └─ ⑥ 검증 ──── 로컬 계산 + Claude (마스킹본만 받음)
```

### LLM 에이전트 2개 파이프라인

```
원본 청크 ──▶ [Agent 1 · Recognizer] ──▶ [코드: 페르소나 배정·교체] ──▶ [Agent 2 · Auditor] ──▶ 결과 저장소
                local | claude              vault, 날짜 이동                항상 Claude
                     ▲                                                         │
                     └─────────── 의심 위치만 되돌려 보냄 (최대 2회) ◀──────────┘
```

| | Agent 1 · Recognizer | 코드 (LLM 아님) | Agent 2 · Auditor |
|---|---|---|---|
| 보는 데이터 | 원본 | 원본 + vault | 마스킹본만 |
| 모델 | Ollama 또는 Claude (`DETECTOR` 스위치) | — | Claude |
| 하는 일 | 규칙이 놓친 PII 찾기, 각 언급을 엔티티에 연결 | 페르소나 1:1 배정, 날짜 이동, 치환 | 남은 PII 의심 표시, 어색한 교체 표시, 정답 문항 풀기, 리포트 |
| 출력 | `{span, type, entity_id, confidence}` | 마스킹된 청크 | `issues[]`, 지표, 리포트 |

- **교체는 코드로 한다.** LLM에게 문장을 다시 쓰게 하면 약 용량 같은 비개인정보가 바뀌거나 1:1 배정이 깨질 수 있다.
- **청크 단위로 흘린다.** Agent 1이 청크 n+1을 처리하는 동안 Agent 2가 청크 n을 검사한다.
- **엔티티 목록을 미리 만든다.** 환자·의사 테이블로 먼저 만들어 두면, 처음 보는 사람(가족 등)만 그때 페르소나를 받는다. 청크 단위로 처리해도 일관성이 유지된다.
- **피드백은 위치만 보낸다.** Agent 2는 원본을 모르므로 "이 위치가 의심"만 전달하고, Agent 1이 원본을 보고 다시 판단한다.
- **주의:** Agent 1이 놓친 개인정보는 마스킹본에 남은 채로 Agent 2(Claude)에 들어간다. 데모는 가상 데이터라 괜찮지만, 실제 고객 환경에서는 Agent 2도 로컬 모델이나 고객 클라우드(Bedrock)에서 돌려야 한다.

**핵심 아이디어:** 이미지와 오디오도 먼저 "텍스트 + 위치(span, bbox, 타임스탬프)"로 바꾼다. 그러면 탐지, 동일 인물 묶기, 페르소나 배정 로직을 모든 모달리티가 하나로 공유한다. "모달리티가 달라도 같은 사람은 같은 페르소나"는 이 구조에서 나온다.

## 3. 단계별 상세

### ① 데이터 소스 (가상 원본)

진짜 개인정보는 쓰지 않는다. `scripts/make-fixture.ts`로 가상 병원 데이터를 만든다.

- **규모:** 환자 30명, 방문 90건, 처방 120건, 진료 메모 60개, X-ray 10장, 통화 녹음 6개
- **테이블:**
  - `patients`: mrn, name, dob, sex, phone, email, address, ssn
  - `encounters`: date, provider, dept, admit, discharge
  - `prescriptions`: date, drug, dose
  - `notes`: text
  - `media`: type, path, patient_id
- **진료 메모:** Claude가 작성한다 (가짜 데이터라 Claude로 써도 된다). 탐지를 어렵게 하려고 "Mr. Reyes", "Danny", 가족 이름, 담당의 이름, 전화번호, 여러 날짜 형식을 일부러 섞는다.
- **이미지:** 퍼블릭 도메인 X-ray(Wikimedia Commons 등, 라이선스 확인 필요) 위에 가짜 환자명, DOB, MRN, 촬영일을 글자로 박아 넣는다(burn-in). `sharp`를 쓴다.
- **오디오:** Claude가 통화 대본을 쓴다 → macOS `say`로 화자마다 다른 목소리로 합성한다 → `ffmpeg`로 wav로 바꾼다.
- **정답 문항:** 20개를 심어 두고, 정답은 원본 SQL로 계산한다. 예시:
  - "Daniel Reyes의 메트포르민 처방이 겹치나?"
  - "입원부터 퇴원까지 며칠?"
  - "두 번째 방문의 담당의는?"
- **DB 연결:** Node 24에 내장된 `node:sqlite`로 `readOnly: true` 연결한다. 이게 화면의 READ ONLY 시연이 된다.

### ② 탐지 (규칙이 먼저, LLM은 나머지만)

1. **컬럼 매핑:** 테이블 컬럼을 PII 타입(name, dob, phone 등)에 연결한다. 설정 파일로 관리하고, 처음 한 번만 LLM이 제안한다.
2. **DB 사전:** patients와 providers 테이블의 이름, 전화번호, MRN으로 사전을 만든다. 메모, OCR 결과, 통화 전사문에서 이 사전으로 문자열을 찾으면 **대부분의 언급이 여기서 잡힌다.** 로컬 소형 모델의 약점을 이걸로 메운다.
3. **정규식:** 전화번호, 이메일, SSN, MRN, 날짜, ZIP, URL
4. **LLM:** 남은 텍스트에서 사전에 없는 사람(가족, 별명), 주소, 기관명을 찾는다. JSON span으로 받고 `zod`로 형식을 검증한다.
   - `local`: Ollama를 쓴다. 이 Mac(메모리 18GB)에서는 4~8B급 instruct 모델, DGX Spark에서는 gpt-oss-20b나 120b. `OLLAMA_HOST` 값으로 전환한다.
   - `claude`: Claude Sonnet 5.5 (`claude-sonnet-5-5`)
   - (P2) OpenAI Privacy Filter를 Python 사이드카로 붙인다.

### ③ 동일 인물 묶기

- **규칙:** 전체 이름, 호칭 + 성(Mr. Reyes), 이름만, 별명 사전을 쓴다. 메모의 `patient_id` 문맥으로 연결한다.
- **LLM:** 애매한 경우에만 묻는다. 예: "이 메모의 'Danny'는 Daniel Reyes인가?"
- **결과:** `entity_id` 하나에 모든 언급이 묶인다. 테이블 셀, 텍스트 span, 이미지 bbox, 오디오 구간이 전부 포함된다.

### ④ 페르소나 배정

- **페르소나 풀:**
  - Claude로 200명을 미리 만들어 `src/lib/maskara/personas/pool.json`으로 커밋한다.
  - 필드: 이름, 성별, 출생연도, 도시와 주, 전화번호(555-01xx), 이메일(example.com), 주소, 얼굴(아바타), 목소리(TTS 음성)
- **배정 규칙:**
  - 성별, 나이대(±5세), 지역(주)을 맞춰서 무작위로 뽑는다.
  - 1:1로 배정한다. 한 페르소나를 두 사람에게 주지 않는다.
- **매핑 보관:**
  - 로컬 vault(`data/vault.json`, gitignore)에 저장한다. 다시 실행해도 같은 사람은 같은 페르소나가 된다.
  - 이름 해시(HMAC)로 고르지 않고 무작위로 뽑아 vault에 저장한다. HIPAA 재식별 코드 규정(45 CFR 164.514(c))이 개인 정보에서 파생된 코드를 금지하기 때문이다.
- **날짜 이동:**
  - 환자마다 무작위 오프셋(±180일)을 정해 vault에 저장한다. 날짜 사이의 간격은 그대로 유지된다.
  - DOB도 같은 오프셋을 적용해 나이를 유지한다.
  - 90세 이상은 "90+"로 표시한다.
- **키 폐기 모드 (옵션):** 실행 후 vault를 삭제한다. 그러면 원래대로 되돌릴 수 없다.

### ⑤ 교체 (모달리티별)

| 모달리티 | 방법 | 우선순위 |
|---|---|---|
| 테이블 | 셀 단위로 치환 | P0 |
| 텍스트 | span 단위로 치환하고 원래 형태를 유지 (전체 이름 → 전체 이름, "Mr. Reyes" → "Mr. Lee", 소유격 포함) | P0 |
| 이미지 속 글자 | OCR(tesseract)로 글자 위치 확인 → 탐지 → 원래 영역을 배경색으로 덮고 페르소나 값을 같은 크기로 다시 씀 (sharp + SVG) | P0 |
| 오디오 전사문 | whisper.cpp로 단어별 타임스탬프 전사 → 텍스트 파이프라인 그대로 처리 | P0 |
| 이미지 속 얼굴 | 로컬에서 얼굴 탐지 → 페르소나 아바타로 교체 (같은 사람 = 같은 얼굴). 실사 얼굴 합성은 로드맵 | P1 |
| 오디오 (스플라이스) | 개인정보 구간만 잘라 내고 페르소나 값을 TTS로 끼워 넣음 (ffmpeg). 원래 목소리는 남음 | P1 |
| 오디오 (재음성) | 마스킹된 전사문 전체를 페르소나 목소리로 다시 합성. 목소리 자체(성문)까지 없어짐 | P1 |
| DICOM 메타데이터 | 태그 치환 | P2 |

- **오디오 인식은 항상 로컬 whisper로 한다.** Claude API는 오디오 입력을 받지 않는 것으로 알고 있다 (확인 필요). `claude` 모드에서도 Claude에는 전사문만 보낸다.
- **이미지:** `claude` 모드에서는 Claude vision으로 어떤 글자가 개인정보인지 판단할 수 있다. 다만 글자 위치(bbox)는 항상 OCR이 담당한다.

### ⑥ 검증과 리포트

- **로컬 계산 (원본 접근 가능):**
  - **유출률:** 원본 PII 값이 결과물에 남은 비율. 결과 이미지는 다시 OCR하고, 결과 오디오는 다시 전사해서 검사한다.
  - **일관성:** 엔티티 하나에 페르소나가 정확히 하나인지
  - **비개인정보 보존율:** 진단, 약, 용량, 수치가 원본과 같은 비율
- **Claude (마스킹본만 받음):**
  - **정답 보존율:** 심어 둔 20문항을 maskara본과 `[REDACTED]`본에서 각각 풀게 한다. 정답에도 페르소나와 날짜 변환을 똑같이 적용해서 비교한다.
  - **잔여 PII 감사:** 마스킹본에 개인정보가 남은 것 같은 부분을 찾는다.
  - **리포트:** 결과를 문장으로 정리한다.

## 4. 화면

- **`/sources`:** DB 연결, READ ONLY 배지, 테이블과 미디어 미리보기
- **`/run`:** 단계별 진행 표시, DETECTOR 토글, 로그
- **`/compare`:**
  - 원본 | `[REDACTED]` | maskara 3열 비교
  - 엔티티를 클릭하면 모든 모달리티에서 하이라이트
  - 이미지 전후 비교, 오디오 전후 플레이어
- **`/personas`:** 기존 라이브러리 페이지를 실제 페르소나 풀과 연결한다 (사용된 데이터셋 수 표시).
- **`/report`:** 지표 4개를 maskara와 `[REDACTED]`로 비교

## 5. 코드 구조

```
src/lib/maskara/
  source/      sqlite (readonly), media loader
  normalize/   ocr.ts, asr.ts
  detect/      columns.ts, dictionary.ts, regex.ts, llm.ts (interface), ollama.ts, claude.ts
  resolve.ts
  personas/    pool.json, vault.ts, dateshift.ts
  rewrite/     table.ts, text.ts, image.ts, audio.ts
  verify/      metrics.ts, qa.ts, audit.ts
  pipeline.ts
src/app/api/run/route.ts     진행 상황 스트리밍
scripts/make-fixture.ts, scripts/make-personas.ts
data/                        fixture는 커밋, out/ 과 vault.json 은 gitignore
```

- **새 npm 의존성:** `@anthropic-ai/sdk`, `sharp`, `tesseract.js`, `@faker-js/faker`(fixture용), 얼굴 탐지 라이브러리(`@vladmandic/human` 또는 MediaPipe, 고를 때 라이선스 확인)
- **시스템 도구:**
  - whisper.cpp(`brew install whisper-cpp`)와 모델(`base.en`)
  - Ollama 모델 (Ollama는 설치돼 있고 받은 모델은 없음)
  - ffmpeg (설치돼 있음)
  - `say` (macOS 내장)

## 6. 우선순위와 작업 순서

**P0 (데모 필수, 이 순서대로)**

1. `pnpm install` 후 `node_modules/next/dist/docs`에서 Next 16 문서를 확인한다 (AGENTS.md 규칙).
2. fixture를 만든다: DB, 메모, X-ray burn-in, 통화 오디오, 정답 문항.
3. 페르소나 풀(Claude 생성), vault, 날짜 이동
4. 탐지: 컬럼 매핑, DB 사전, 정규식 → LLM 인터페이스(ollama, claude)
5. 동일 인물 묶기
6. 교체: 테이블과 텍스트 → 이미지 속 글자 → 오디오 전사문
7. 검증 지표와 Claude QA
8. `/compare`, `/report` 화면

**P1:** 얼굴 아바타 교체, 오디오 스플라이스와 재음성, `/run` 진행 화면, `/personas` 연결, 잔여 PII 감사

**P2:** Privacy Filter 사이드카, DICOM, 실사 얼굴 합성, 화자 분리

## 7. 역할 분담 (3명 기준 예시)

- **파이프라인:** detect, resolve, personas, rewrite(table, text)
- **미디어:** fixture 이미지·오디오, OCR, ASR, rewrite(image, audio)
- **화면·발표:** compare, report, personas UI, 슬라이드 업데이트, 스크린샷

## 8. 리스크

- **로컬 소형 모델의 탐지 품질:** DB 사전과 정규식이 먼저 대부분을 잡게 설계하고, LLM은 보조로만 쓴다.
- **이 Mac의 메모리(18GB):** gpt-oss-20b는 빠듯하다. 소형 모델을 쓰거나 DGX Spark로 돌린다.
- **OCR 정확도:** fixture의 burn-in 글자는 우리가 넣은 깨끗한 폰트라 괜찮다. 실제 데이터 대응은 로드맵이다.
- **오디오 스플라이스가 어색할 수 있다:** 데모에서는 재음성 모드가 더 깔끔하다.
- **얼굴:** 실사 얼굴 합성 모델(InsightFace 등)은 비상업 라이선스가 많다. 오늘은 아바타로 한다.
- **시간이 부족하면 자르는 순서:** 얼굴 → 오디오 음성 → 이미지. 텍스트와 테이블은 끝까지 유지한다.

## 9. 표현 주의

- B는 매핑 vault가 있어서 법적으로는 **가명** 처리다. "익명"이라고 하려면 키 폐기 모드와 재식별 위험 검증 근거가 있어야 한다.
- **영어 표현:** "de-identified with consistent personas", "pseudonymized"
- **쓰면 안 되는 말:** "HIPAA 인증" 또는 "HIPAA 준수 보장", "완전 익명", "재식별 불가능"

## 10. 슬라이드 반영 (`planning/slides/index.html`)

- **HOW IT WORKS:** Detect (rules + local LLM / Claude) → Resolve the same person across tables, notes, images, audio → Swap in a consistent persona → Verify
- **2장 스크린샷:** `/compare` 화면. 모달리티 4개가 한 화면에 보이게 한다.
- **NEXT 7 DAYS:** 실사 얼굴 교체와 화자 음성 변환, DICOM, 첫 파일럿

# maskara 로컬 엔진 분리 조사

조사일: 2026-10-25 · 코드 기준: `ea53f64`의 현재 작업 트리 · 조사만 수행, 구현·설치·모델 실행·커밋 없음.

## 1. 요약

1. 변환·페르소나·평가의 독립 로직군은 약 1,846줄이며, 브라우저 실행기와 저장소를 분리할 출발점은 있다. 다만 그대로 안전한 엔진이 되지는 않는다. (`src/lib/mask.ts:24`, `src/lib/pipeline/run.ts:72`, §2 집계)
2. **[추정/추천] A: Python 재작성**을 우선 검토한다. Python 모델·데이터 SDK와 한 런타임으로 묶는 이점이 TS 재사용 손실보다 제품 목표에 잘 맞는다. 언어 선택은 확정하지 않는다. (§3 비교)
3. **[추정/추천] v0는 CSV·노트·PDF에서 추출한 텍스트의 일관된 치환과 측정 가능한 리포트**에 집중한다. 얼굴 재생성과 원본 레이아웃을 보존한 PDF 출력은 후속 범위로 둔다. (§4, §7)
4. 한국어 이름 정규화, 상태 지속성, 비암호학적 해시, 느슨한 span 평가를 먼저 재설계해야 한다. (`src/lib/mask.ts:141`, `src/lib/hash.ts:1`, `src/lib/pii/span-eval.ts:76`)
5. Indra의 가중치 이용 제한과 Protegrity 논문 모델의 배포·라이선스 확인 공백이 있다. 공개 코드·논문·가중치의 이용 조건을 분리해 선택해야 한다. ([Indra](https://huggingface.co/datalab-to/indra-ocr), [Protegrity 논문](https://arxiv.org/html/2610.30518v1), §4.1)

### 조사 범위와 표기

- 저장소 경로는 `/Users/cloudlim/maskara` 기준이다. 코드 근거는 `파일:라인`으로 표기한다. `README.md`, `intents.md`, `.env.example`, `src/lib/` 28개 파일, `src/app/api/` 6개 라우트, `.ocr-probe/`의 JSON·서비스 응답을 읽었다. 기존 `.ocr-probe/`는 미추적 자료이며 수정하지 않았다.
- **[벤더]**는 개발사·모델 저자의 측정, **[독립]**은 그 밖의 평가자의 원자료, **[경쟁사]**는 비교 대상과 경쟁하는 업체의 측정이다. 공개 벤치마크를 사용한 저자 평가도 독립 재현으로 간주하지 않는다.
- **미확인**은 아래 연결한 자료와 이번 조사에서 확인하지 못했다는 뜻이다. 기능·평가가 세상에 없다는 뜻이 아니다. **[추정]**은 설계 제안·공수/재사용 추정·아직 검증하지 않은 적용 판단이다.
- 다운로드 크기, 파라미터 수, 실행 RAM은 서로 다르다. 표의 파일 크기는 조회 당시 배포 파일 기준이며, 속도는 장치·입력·정밀도·스레드 수가 다른 행끼리 순위를 매길 수 없다. 이번 작업에서 CPU 벤치마크는 실행하지 않았다.
- 기존 제품 설명은 일관된 페르소나 치환과 온프레미스 방향을 제시하지만, 현재 구현은 브라우저·Anthropic·원격 미디어 서비스를 이용한다. (`README.md:26`, `README.md:49`, `intents.md:21`, `intents.md:40`, `.env.example:3`)

## 2. 코드 인벤토리와 추출 경계

분류: **순수** = DOM·웹 서버·네트워크 없이 계산 가능, **브라우저** = React·zustand·브라우저 API 의존, **Next API** = 앱 라우트 어댑터, **외부** = 원격 서비스 호출. 한 파일이 여러 역할이면 주분류 뒤에 부역할을 적었다. 여기서 순수는 명시적 메모리 상태 변경까지 허용하는 분류이며, 시간까지 고정된 수학적 순수 함수라는 뜻은 아니다.

### 2.1 `src/lib/` 전체

| 파일 / 물리 줄 수 | 분류 | 코드 근거와 현재 책임 | 추출 시 처리 [추정] |
|---|---|---|---|
| `mask.ts` / 442 | 순수 | `:24` 실행 컨텍스트와 매핑, `:98` 인물 해석, `:182` 날짜, `:246` ID, `:332` 텍스트 치환 | 핵심 재사용/포팅. Unicode·키·별칭 충돌 정책은 변경 |
| `personas.ts` / 107 | 순수, 시계 의존 | `:5` 이름 사전, `:65` 페르소나 생성, `:81` 날짜 오프셋, `:97` 현재 시각 | 생성 규칙 포팅; locale·버전·기준일을 명시 |
| `hash.ts` / 33 | 순수, 난수 의존 | `:1` 비암호학적 해시임을 명시, `:17` salt 결합, `:31` `Math.random` | 프로덕션 매핑 키 생성은 교체 |
| `roles.ts` / 95 | 순수 | `:1` 역할 목록, `:71` 컬럼명 기반 추론 | 명시적 schema 우선, 휴리스틱은 보조로 재사용 |
| `types.ts` / 281 | 순수 | `:1` 역할/도메인 타입, `:99` 원문 포함 셀, `:163` 미디어 원문, `:254` 리포트 | 엔진 DTO와 UI/민감 audit DTO를 분리 |
| `pii-schema.ts` / 32 | 순수 | `:1` Zod, `:22` text 20,000자 제한, `:29` Claude/local 선택 | 외부 계약 재사용, CLI용 제한·설정 별도 |
| `analysis.ts` / 248 | 순수, 시계 의존 | `:53` 집계·질의, `:66` `Date.now`, `:244` 날짜 표시 | 숫자 집계 분리; UI 문자열·기준일 주입 |
| `pipeline/stages.ts` / 50 | 순수 | `:1` 단계와 레인, `:22` 표시용 모델명·배치 좌표 | 단계 ID·이벤트 계약만 재사용 |
| `pipeline/utility.ts` / 326 | 순수, UI 문자열 결합 | `:1` 영문 i18n import, `:105` 지표 계산, `:311` 원본 timeline | 지표와 렌더링·민감 예시 분리 |
| `pipeline/mock-detector.ts` / 49 | 순수 | `:1` 알려진 이름·정규식 탐지 | fixture/보조 규칙으로 제한. 실제 local detector에서도 사용됨 (`pii/local-detector.ts:84`) |
| `pii/form-fields.ts` / 80 | 순수 | `:8` 영문 폼 라벨, `:41` 값 탐지 | 폼 규칙과 locale별 사전 분리 |
| `pii/span-eval.ts` / 103 | 순수 | `:8` 라벨 범위, `:49` 겹침 판정, `:76` 탐지 성공 집계 | 아래 §2.5의 평가 정의부터 변경 |
| `store.ts` / 104 | 브라우저 | `:3` zustand/persist, `:35` localStorage, `:83` 저장 키, `:97` hydration | 저장 인터페이스·암호화 vault로 재작성 |
| `datasets.ts` / 115 | 브라우저 + 외부 | `:12` CSV 파싱, `:24` DOM 다운로드, `:34` 샘플 fetch, `:95` File 업로드 | CSV 부분 재사용; 파일/stream 어댑터 재작성 |
| `pipeline/run.ts` / 834 | 브라우저 + 외부 | `:1` use client, `:72` store 실행, `:125` API fetch, `:745` store export | 실행기 재작성. 상태·모델·I/O를 주입 |
| `pipeline/pdf.ts` / 55 | 브라우저 | `:15` pdf.js worker, `:38` 페이지 렌더, `:45` DOM canvas | 로컬 PDF 텍스트 추출/래스터화 어댑터 |
| `pipeline/image.ts` / 491 | 브라우저 + 외부 | `:20` Image, `:41` canvas, `:48` OCR API, `:118` repaint 캐시, `:172` faces API, `:413` 그리기 | bbox 변환 일부만 재사용. 이미지 I/O·합성은 재작성/후순위 |
| `face/repaint-store.ts` / 33 | 브라우저 | `:12` IndexedDB, `:32` Blob 저장 | v0 제외; 후속 디스크 캐시 계약 |
| `lab.ts` / 162 | 브라우저 | `:40` 데이터 도우미, `:94` Blob URL·Web Worker, `:149` NDJSON | 탐색형 랩은 v0 제외 |
| `llm/anthropic-detector.ts` / 67 | 외부 | `:10` 모델명, `:12` 인물 역할·관계 prompt, `:32` API 키, `:45` 호출 | 로컬 span detector + 별도 entity resolver |
| `llm/role-classifier.ts` / 98 | 외부 | `:39` 테이블/컬럼/샘플 스키마, `:63` Anthropic 추론 | schema·규칙 기반 분류 + 선택형 로컬 모델 |
| `llm/lab-agent.ts` / 111 | 외부 | `:89` Anthropic client, `:99` tool 사용 대화 | v0 제외 |
| `pii/local-detector.ts` / 110 | 외부 | `:14` 원격 기본 주소, `:43` HTTP 호출, `:64` 응답 변환 | 이름의 local은 프로세스 내 추론이 아님. transport 교체·offset 보존 |
| `ocr/indra.ts` / 178 | 외부 + 순수 | `:13` 원격 기본 주소, `:43` HTTP 업로드, `:78` 응답 변환, `:95` 추정 word box | 응답 정규화 재사용; 로컬 runner·실제 bbox 계약 교체 |
| `i18n/index.ts` / 38 | 브라우저 | `:3` React, `:14` localStorage, `:25` document, `:30` hook | 웹앱에 유지 |
| `i18n/en.ts` / 523 | 순수 데이터 | `:1` 영문 UI·리포트 문자열 객체 | 엔진에는 메시지 ID/필요 문자열만 |
| `i18n/ko.ts` / 513 | 순수 데이터 | `:1` 한국어 UI 문자열 객체 | UI 한국어 지원을 PII 한국어 지원과 구분 |
| `utils.ts` / 1 | 순수, UI 도우미 | `:1` `cn` 재수출 | 엔진에서 제외 |

### 2.2 API 라우트 전체

| 파일 / 물리 줄 수 | 분류 | 근거 / 분리 방향 [추정] |
|---|---|---|
| `src/app/api/detect-pii/route.ts` / 32 | Next API + 외부 | `:7` 검증, `:11` Claude/local 분기. HTTP DTO 어댑터로만 유지 |
| `src/app/api/infer-roles/route.ts` / 26 | Next API + 외부 | `:5` 요청 검증, `:12` 역할 분류 호출. 로컬 엔진 API로 연결 |
| `src/app/api/ocr/route.ts` / 25 | Next API + 외부 | `:5` multipart, `:12` 20MB 제한, `:19` OCR 호출. 엔진에는 파일/bytes 직접 입력 |
| `src/app/api/faces/route.ts` / 52 | Next API + 외부 | `:6` 기본 원격 주소, `:20` proxy, `:45` confidence 필터. 탐지 모델 구현은 이 저장소에 없음 |
| `src/app/api/faces/repaint/route.ts` / 63 | Next API + 외부 | `:18` health, `:39` 원격 주소, `:48` repaint, `:58` seed/시간 헤더. 재생성 모델 구현은 없음 |
| `src/app/api/lab/route.ts` / 65 | Next API + 외부 | `:17` 대화 검증, `:29` 스트림, `:42` 도구 루프. 엔진 필수 기능 아님 |

라우트들은 Web `Request`/`Response`를 사용하지만 파일 라우팅·배포는 Next 앱에 묶여 있다. `.env.example:6`은 원격 서비스를 GPU로 묶어 설명한다. 이는 **현재 배포 설명**이며, 각 모델이 GPU를 필수로 요구한다는 증거는 아니다. 예를 들어 Indra upstream은 CPU/ONNX를 명시한다. (`src/app/api/ocr/route.ts:1`, [Indra 모델 카드](https://huggingface.co/datalab-to/indra-ocr))

### 2.3 그대로 옮길 부분과 재작성 규모

줄 수는 빈 줄·주석 포함 물리 줄 수이며 공수나 복잡도가 아니다. 위 표의 파일을 상호 배타적으로 합산했다.

| 묶음 | 현재 규모 | 처리와 재사용 추정 |
|---|---:|---|
| 변환·타입·역할·지표 등 독립 로직 12개 | 1,846줄 | TS라면 가장 직접적인 추출 대상. 다만 해시·정규화·평가·시계 의존 수정 필요 |
| 브라우저 실행·저장·미디어·랩 7개 | 1,794줄 | I/O와 실행기는 다시 작성; `run.ts`의 순서·계약과 이미지 bbox 계산을 참고 |
| 외부 호출 모듈 5개 | 564줄 | 응답 schema·일부 정규화만 유지; Anthropic/HTTP를 로컬 실행 어댑터로 대체 |
| Next API 6개 | 263줄 | 엔진에서 제거, 웹 연결용 얇은 어댑터로 남길 수 있음 |
| UI 문자열·hook·cn 4개 | 1,075줄 | 대부분 웹에 유지 |
| 전체 | **5,542줄** | `src/lib` 5,279 + API 263; UI 묶음을 뺀 비교 분모는 **4,467줄** |

**[추정]** TS 유지 시 안전성 수정 전 독립 로직군은 비교 분모의 약 41%이며, 수정 없이 가져갈 수 있는 양은 대략 1.2–1.6k줄(27–36%)로 더 작게 보는 편이 합리적이다. 이는 텍스트 유사도 측정이 아닌 인벤토리 기반 범위 추정이다. Python안의 TS 소스 직접 재사용률은 사실상 0%지만, 1.85k줄의 규칙·schema·fixture를 명세로 재사용할 수 있다. 브라우저·외부 호출·라우트 약 2.62k줄은 재작성/제거 대상이고, 암호화·CLI·stream I/O·모델 관리·오프라인 검증은 현재 없는 신규 작업이다. (`src/lib/store.ts:35`, `src/lib/pipeline/run.ts:72`, `src/lib/hash.ts:1`, `package.json:7`)

### 2.4 페르소나 일관성의 실제 동작

| 항목 | 현재 동작과 한계 |
|---|---|
| 영속 저장 | zustand가 `maskara-local-db` localStorage에 salt, datasets, runs, personas, detectionCache를 저장한다. 암호화 계층은 없다. 성공한 export에서 personas를 병합한다. (`store.ts:15`, `store.ts:35`, `store.ts:79`, `store.ts:83`, `pipeline/run.ts:745`; 이 표의 경로 접두사는 `src/lib/`) |
| 실행 중 상태 | `MaskContext`의 personas 외에 patients, patientByName, providers, aliases, relatives, wordAliases가 있다. 뒤의 인덱스들은 실행마다 새로 구성되며 전부 영속화되지는 않는다. (`mask.ts:24`) |
| 환자/주체 키 | 첫 `person_key` 값이 있으면 `datasetId:원본값`; 없으면 첫 이름으로 `datasetId:name:정규화이름`; 둘 다 없으면 null. 업로드는 새 dataset ID를 생성하므로 같은 파일 재업로드가 같은 키를 보장하지 않는다. (`pipeline/run.ts:156`, `datasets.ts:104`) |
| 의료진 키 | `provider:정규화이름`이며 dataset namespace가 없다. 같은 성의 기존 후보가 하나면 해당 후보와 합치는 휴리스틱이 있다. 동명이인·다른 기관 경계와 입력 순서 영향을 검증해야 한다. (`mask.ts:85`) |
| 가족/기타 키 | `datasetId:owner:rel:정규화전체이름`; owner 없으면 `none`. 같은 first name 후보가 하나면 합칠 수 있고, 환자와 원래 성이 같으면 가상 성도 공유한다. (`mask.ts:111`) |
| 이름·연락처 결정성 | salt, key, 최초 sex/생년월일 등 초기 정보, 사전·알고리즘이 같으면 같은 값을 계산한다. `ensurePersona`는 기존 값을 우선하므로 나중에 더 정확한 정보가 들어와도 자동 재생성하지 않는다. 생성 시각과 기본 나이 기준일은 현재 시각이므로 전체 결과의 바이트 단위 결정성은 없다. (`mask.ts:46`, `personas.ts:65`, `personas.ts:97`, `personas.ts:101`) |
| 별칭 일관성 | 이름 외 전화·이메일·주소 치환도 실행 내 별칭을 사용한다. 구조화 데이터를 먼저 처리해 그 매핑을 노트에 활용한다. 하지만 별칭 인덱스는 재구성되므로 부분 재실행·순서 변경까지 보장하는 설계는 아니다. (`mask.ts:55`, `mask.ts:257`, `mask.ts:277`, `pipeline/run.ts:419`, `pipeline/run.ts:698`) |
| 날짜 | 사람별 `hash(salt,"offset",key) % 61 - 30`, 0은 +17일. 생년월일도 같은 오프셋으로 이동한다. 구조화 행에서 사람이 없으면 dataset별 오프셋, 0은 +11일. 반면 자유 텍스트에서 주체를 못 찾으면 날짜 이동값 0을 쓴다. (`personas.ts:81`, `personas.ts:90`, `pipeline/run.ts:153`, `pipeline/run.ts:211`, `mask.ts:354`) |
| 날짜 파싱 | UTC 날짜 이동 helper가 있고 ISO·미국식·영문 월 표기를 처리한다. 불완전한 날짜는 기준 연도 2026이나 월 중간일을 보충한다. 한국식 날짜·timezone·윤일 정책은 별도 명세가 필요하다. (`personas.ts:52`, `mask.ts:182`, `mask.ts:197`, `mask.ts:219`) |
| ID | 숫자 부분을 해시한 뒤 원본의 숫자 자리만 교체한다. 알파벳만 있는 ID는 그대로 남고, 접두사 차이는 숫자 해시 입력에서 사라진다. 짧은 숫자 공간의 충돌을 해결하는 allocator는 없다. (`mask.ts:246`, `hash.ts:25`) |
| 얼굴 | source 사진+persona+prompt를 해시한 브라우저 캐시와 원격 repaint가 있다. 원격 서버의 seed/identity 구현은 확인할 수 없으므로 서로 다른 사진에서도 동일 인물 외관이 나온다고 입증할 수 없다. (`pipeline/image.ts:118`, `pipeline/run.ts:533`, `src/app/api/faces/repaint/route.ts:48`) |

특히 `normName`은 ASCII 영문 외 문자를 제거한다. `김민수`, `박영희`는 둘 다 빈 문자열이 되어 이름 인덱스가 충돌할 수 있다. 따라서 UI 번역과 무관하게 현재 엔진은 한국어 인물 일관성을 보장하지 않는다. 영어 이름도 유한 이름 풀에서 고르므로 서로 다른 사람이 같은 가상 이름을 받을 수 있다. (`src/lib/mask.ts:141`, `src/lib/mask.ts:77`, `src/lib/personas.ts:5`, `src/lib/personas.ts:79`)

### 2.5 로컬화와 함께 바꿔야 할 검증 계약

- **PII 검출과 인물 연결은 다른 작업이다.** Claude는 표면 문자열뿐 아니라 patient/provider/relative, canonicalName, relation을 반환하도록 요청받는다. 일반 NER를 끼워 넣는 것만으로 이 관계 정보가 대체되지는 않는다. 현재 local 어댑터는 모델의 offset·score를 최종 `DetectedEntity`에서 보존하지 않는다. **[추정]** 엔진 계약은 `start/end/type/score/source/model_revision` 탐지와 `entity_id/alias/owner` 해석을 분리해야 한다. (`src/lib/llm/anthropic-detector.ts:12`, `src/lib/pii/local-detector.ts:64`, `src/lib/pii/local-detector.ts:81`)
- **현재 누출 검사는 완전한 재탐지가 아니다.** 변환 과정에서 수집한 원본값을 잔여 텍스트와 비교하며, 이미 entity로 표시한 span은 잔여 텍스트에서 제외한다. 후보 길이·ASCII 문자/숫자 필터 때문에 짧은 이름·한국어 이름 등이 빠지고 예시는 50개로 제한된다. 알려지지 않은 PII의 recall을 이 지표로 주장할 수 없다. (`src/lib/pipeline/run.ts:169`, `src/lib/pipeline/run.ts:200`, `src/lib/pipeline/run.ts:766`, `src/lib/pipeline/run.ts:796`, `src/lib/pipeline/run.ts:801`)
- **현재 span 점수는 exact match가 아니다.** 일부 겹치기만 해도 탐지 성공이며 타입 일치도 요구하지 않는다. 넓은 하나의 탐지가 여러 gold를 덮는 경우를 제대로 벌하지 않을 수 있다. **[추정]** exact span+type one-to-one P/R/F1, 경계 일치, 문자 단위 PII 잔존율, 과잉 마스킹을 별도 제공해야 한다. (`src/lib/pii/span-eval.ts:49`, `src/lib/pii/span-eval.ts:76`, `src/lib/pii/span-eval.ts:85`)
- **utility는 도메인 지표다.** 사건 간격, PK 정합성, 이름, 성별, 나이 분포, ZIP3, 보존 컬럼, 재방문 등을 계산한다. 일부는 의료·미국 주소·기준일 2026에 맞춰져 있다. 이것이 RL 학습 성능 보존을 증명하지는 않는다. **[추정]** 일반 구조 보존과 선택형 의료 지표를 분리하고, downstream 학습 평가는 사용자 제공 benchmark로 둔다. (`src/lib/pipeline/utility.ts:105`, `src/lib/pipeline/utility.ts:151`, `src/lib/pipeline/utility.ts:224`, `src/lib/pipeline/utility.ts:290`)
- **결과 객체 자체가 민감하다.** `MaskedCell.original`, region.original, misses/leaks의 원본값, 원본 timeline이 남는다. **[추정]** public 결과·집계 report와 암호화 audit를 별도 schema로 정의하고, 현재 run 객체를 그대로 JSON export하지 않아야 한다. (`src/lib/types.ts:99`, `src/lib/types.ts:163`, `src/lib/types.ts:248`, `src/lib/types.ts:254`, `src/lib/pipeline/utility.ts:311`)
- 새 CSV의 역할 기본값은 `keep`이며, 모든 텍스트 탐지가 실패하면 실행을 중단하지만 일부 실패는 셀 전체를 가린다. 누출 보고가 있다고 성공 상태를 자동 차단하지는 않는다. **[추정]** 알 수 없는 컬럼·지원하지 않는 언어·검출 실패·검증 실패의 정책과 종료 코드를 명시해야 한다. (`src/lib/datasets.ts:17`, `src/lib/pipeline/run.ts:373`, `src/lib/pipeline/run.ts:439`, `src/lib/pipeline/run.ts:753`)

### 2.6 `.ocr-probe/`에서 확인한 것

| 증거 | 관찰 | 해석의 범위 |
|---|---|---|
| `.ocr-probe/_health:1` | `model=datalab-to/indra-ocr`, `version=1.1.2` | 당시 서버 응답. 최신 upstream·가중치 해시와 동일하다고 단정 못 함 |
| `.ocr-probe/openapi.json:1`, `.ocr-probe/_v1_models:1` | OCR/health 계약과 models 경로의 Not Found 응답 | 모델 카탈로그/재현 가능한 환경 manifest는 아님 |
| `.ocr-probe/s.pdf.json.json:1` → `pages[0]` | source=`hybrid`, total_ms≈66.86 | text layer+OCR 혼합 경로의 결과 예시 |
| `.ocr-probe/t.pdf.json.json:1` → `pages` | 두 페이지 source=`text`, total_ms≈28.56/29.10 | 디지털 PDF 텍스트 경로의 결과 예시 |
| `.ocr-probe/M001_ecg.auto.json:1`, `.ocr-probe/M001_ecg.ocr.json:1` | source=`ocr`, total_ms≈81.63/74.26; 인식 내용에 파형 주변 잡문자 존재 | 정답셋 없는 관찰. 측정 필드 포함 범위·서버 CPU/GPU·cold start 미상이라 로컬 성능으로 쓰지 않음 |
| `.ocr-probe/M005_lab_requisition.auto.json:1`, `.ocr-probe/M006_school_medication_form.auto.json:1` | 폼의 라벨·값·의료진/보호자 문맥이 OCR 텍스트 순서로 섞임 | **[추정]** bbox/읽기 순서/역할 연결의 회귀 fixture 후보 |
| `.ocr-probe/M007_soap_note.png.md.json:1` | markdown 콘텐츠, OCR source; 동일한 line/timing 구조가 아님 | **[추정]** response adapter가 응답 형식을 검증해야 함 |

현재 PDF 경로는 각 페이지를 canvas로 먼저 래스터화하고 OCR하므로 upstream의 디지털 PDF 텍스트 경로를 직접 활용하지 않는다. OCR 문자→word box는 문자 길이 비례 추정이며 PDF의 얼굴 탐지도 수행하지 않는다. **[추정]** 텍스트 추출·bbox·픽셀 출력의 보장 수준을 나누어야 한다. (`src/lib/pipeline/pdf.ts:38`, `src/lib/pipeline/run.ts:594`, `src/lib/pipeline/run.ts:628`, `src/lib/ocr/indra.ts:95`, `src/lib/pipeline/image.ts:288`)

## 3. 언어·패키징 선택지 — 결정하지 않음

아래 도입 난이도·사용자 선호·개발량은 모두 **[추정]**이다. 사용자 설치 습관에 대한 인터뷰나 통계는 수집하지 않았다. Python 설치 경로가 실제로 제공된다는 근거는 Presidio·MOSTLY·GLiNER 문서이지, 모든 ML 엔지니어가 Python을 선호한다는 증거는 아니다.

| 기준 | A. Python 재작성 | B. TS 코어 + npm/npx + ONNX/Transformers.js | C. TS 코어 + Python 모델 사이드카 |
|---|---|---|---|
| 코드 재사용 | 직접 TS 재사용 0%; 규칙·타입·fixture 포팅 | 독립 로직군 약 41%, 거의 그대로는 약 27–36% 추정 (§2.3) | B와 비슷한 변환 코어 재사용; 추가 RPC 계약 필요 |
| 설치·데이터 팀 접점 | `pip`/`uv`와 Python import. DataFrame·노트북 통합이 자연스러운 후보 [P1], [M1] | Node/npm 필요. 웹팀에는 친숙할 수 있으나 Python 파이프라인에서는 subprocess/bridge 필요 [J1] | 사용자에게 한 명령을 보이게 만들 수는 있으나 실제로 두 런타임·버전 관리 |
| CPU 모델 실행 | GLiNER·Presidio·OCR Python 패키지 직접 통합; 의존성/휠 용량은 여전히 부담 [T2], [P1], [O1] | ONNX Node CPU는 주요 OS/아키텍처 사전 빌드 지원. 모델별 tokenizer·후처리·operator 지원은 별도 검증 [J1], [J2] | 모델 생태계는 A, 변환은 B. 프로세스 시작·취소·장애·offset 전달 추가 |
| 단일 바이너리 | PyInstaller 가능하나 OS별 빌드·native 모델 의존성·큰 가중치 패키징 필요 [J4] | Node SEA 가능하나 native addon은 실제 파일로 풀어 로드해야 함. 가중치 포함 여부 별도 [J3] | 가장 복잡. 두 런타임을 묶은 디렉터리 배포부터 검토 |
| Docker | 가능; CPU image + 모델 cache/vault volume 설계 | 가능; Node+ORT native deps 포함 | 가능; 단일 image/다중 프로세스 또는 compose, 이미지·운영 복잡성 증가 |
| 웹 코드 공유 | 같은 Python 엔진을 로컬 서비스/서버에서 실행. TS는 계약·생성 타입 공유 | 웹·CLI에서 같은 TS 코어 import 가능. 브라우저 저장/모델 backend는 분리 | TS 변환 공유, 모델은 로컬 프로세스만. 브라우저 단독 실행 불가 |
| 주된 위험 | 포팅 중 날짜/정규식/UTF-16 offset 의미 변경 | 지원 모델이 ONNX 파일을 제공해도 전체 pipeline 호환·동등 품질 보장은 없음 | 재사용 이익보다 배포/보안/IPC 비용이 커질 수 있음 |

**추천 1개: A를 우선 검토한다 [추정].** 첫 고객의 데이터 파이프라인과 Python 모델 SDK를 한 프로세스에 넣고, 필요하지 않은 UI/원격 서버 결합을 재작성하는 편이 목표에 부합한다. 보안·한국어·매핑 계약 변경도 필요하므로 TS 동작을 그대로 보존하는 것 자체가 최우선 목표는 아니다. 다만 **웹앱과 동일 코어를 즉시 공유하는 것이 출시 조건이면 B가 더 적합할 수 있다.** C는 기존 웹 코어 보존과 Python 전용 모델을 둘 다 즉시 요구할 때 검토할 타협안이다. (§2.3–2.5, [T2], [P1], [M1])

배포는 **[추정]** 기본 CPU wheel/CLI + 모델별 extras + 명시적 모델 다운로드를 우선하고, Docker를 재현 환경으로 제공하는 안이 현실적이다. 단일 바이너리는 검증 후 선택한다. `pip install` 한 줄과 최초 모델 다운로드 완료까지 5분은 별개이며, 네트워크·wheel·압축 해제·cold load를 포함해 실제 측정해야 한다. OpenAI q4도 가중치 파일만 약 917MB이다. [T1F], [J3], [J4]

## 4. 레인별 로컬 후보

### 4.1 자유 텍스트 PII

| 후보 | 라이선스 / 크기 | CPU 가능 여부와 속도 | 한국어 | 평가와 적용 판단 |
|---|---|---|---|---|
| **OpenAI Privacy Filter** | Apache-2.0. 총 1.5B/활성 약 50M. safetensors 약 2.8GB; ONNX q4 data 917MB + graph/tokenizer [T1], [T1SF], [T1F] | 공식 CLI `--device cpu`; JS/ONNX 배포도 있음. **동일 조건의 CPU 처리량 수치 미확인**, 이번 실측 없음. 활성 50M을 총 RAM 50M으로 해석하면 안 됨 [T1C] | 주로 영어. 비영어·비라틴 문자 성능 저하 명시. 한국어 품질 미확인 [T1] | [벤더] PII-Masking-300k F1 96.0%, 자체 라벨 수정 후 97.43% [T1B]. [독립] 소규모 공개 재현 있음, 아래 참조 [E1]. 비교 후보로 유효하나 한글·persona 관계 연결은 별도 |
| **GLiNER2-PII** `fastino/gliner2-privacy-filter-PII-multi` | Apache-2.0. 카드/README 205M 표기와 논문·HF 표시 약 0.3B가 불일치. 실제 model.safetensors **1.23GB** 확인 [T2], [T2F], [T2P] | GLiNER2가 CPU 실행 지원. 이 PII checkpoint의 입력 길이·CPU가 명시된 속도 수치 미확인. base 모델의 속도를 전용 PII 모델에 전용하지 않음 [T2C] | 명시 7언어 EN/FR/ES/DE/IT/PT/NL. 한국어 포함 안 됨; 검증 안 됨 [T2] | [벤더] SPY exact-span 평균 F1 .477. 저자 논문은 독립 평가 아님. 전용 checkpoint 독립 재현 미확인 [T2P]. 세밀한 PII 라벨의 비교 후보 |
| **NVIDIA GLiNER PII** `nvidia/gliner-PII` | NVIDIA Open Model License, Apache와 구분. 카드 570M, 배포 `pytorch_model.bin` **1.78GB** [T3], [T3F] | Linux/x86_64 CPU 지원 명시. CPU latency/throughput 수치 미확인; ARM 호환은 해당 카드로 확정 못 함 [T3] | 영어 표기. 국제 ID 포맷 학습이 한국어 문장 지원의 증거는 아님 [T3] | NVIDIA 자체 평가 + Fastino의 SPY 비교가 있음. 후자는 **경쟁사 평가**, 중립 독립 재현으로 분류하지 않음 [T3], [T2P] |
| **Protegrity-PII 논문 모델** | 2026-10-21 논문은 공개 가중치 **277.6M XLM-RoBERTa** 모델을 발표. 연결된 HF 페이지는 열람 시 **404**여서 가중치 라이선스·파일 크기 미확인. Developer Edition 라이선스를 이 모델에 대입하지 않음 [T4P], [T4M] | 공개 CPU 실행 절차·속도 미확인. **[벤더] GPU** RTX 6000 batched 0.49s/백만 문자라는 수치만 CPU와 구별해 기록 [T4P] | 다국어 backbone만으로 한국어 PII 지원을 확정할 수 없음. 한국어 품질 미확인 | **[벤더]** 자체 PII-SCOPE typed recall .915 / precision .907. 독립 재현 미확인. **[추정]** 가중치 접근·이용 조건 확인 후 benchmark 후보로 추가 [T4P] |
| **Presidio Analyzer + recognizers + NLP backend** | 프레임워크 MIT, 선택 NLP 모델은 별도 라이선스. 단일 모델이 아니므로 고정 크기 없음 [P0], [P1] | 규칙·spaCy 등 CPU 구성 가능. 설치 NLP 모델·문서 길이에 따라 속도 달라짐; 고정 조합의 이번 CPU 측정 없음 [P1] | 기본 영어. 언어별 NLP engine·recognizer·문맥어 설정 필요. 한국 국가용 recognizer 존재가 한국어 NER 전체 지원을 뜻하지 않음 [P2], [P2K] | Protegrity 논문의 비교는 **경쟁사 평가**. 해당 구성/한국어 corpus의 중립 독립 수치 미확인 [T4P]. **[추정] 정규식·checksum·사용자 recognizer와 모델을 합치는 framework 패턴**이 유용 |

**Protegrity 제품 구분:** 논문이 연결한 [모델 페이지](https://huggingface.co/hbassi-proteg/protegrity-pii)는 브라우저에서도 404를 확인했다. 따라서 공개 발표는 확인했지만 현재 내려받을 수 있는 패키지로 검증하지 못했다. 별도 **AI Developer Edition**은 Docker 기반 로컬 개발 환경이 있고, 그 저장소 LICENSE는 내부 비상업·비프로덕션 평가 및 경쟁 목적 사용 등에 제한을 둔다. 이는 논문 모델의 가중치 라이선스가 아니다. 개발판을 설치·실행하지 않았으며 **[추정]** 기본 OSS 엔진 배포물에는 포함하지 않는 안이다. [T4P], [T4M], [T4], [T4L]

**독립 평가 해석:** Gaurav Vij의 공개 코드·결과는 `ai4privacy/pii-masking-400k` validation 영어 400개, 유럽 5언어 200개를 사용한다. 영어에서 OpenAI strict macro F1 .1547 / boundary .4976, 비교 `urchade/gliner_large-v2.1` .3667 / .4162를 보고한다. **GLiNER2-PII나 NVIDIA 전용 모델을 평가한 결과가 아니다.** 소규모 커뮤니티 재현이며 한국어도 없다. 벤더의 300k 점수와 데이터·정책·평가법이 달라 수치를 직접 비교할 수 없다. 이 차이는 maskara가 라벨 정책·경계 평가를 공개해야 할 이유다. [E1], [T1B]

**[추정] 후보 선정 방식:** 규칙 기반 recognizer에 PII 모델 하나를 결합하고, OpenAI q4·GLiNER2-PII·NVIDIA를 같은 corpus에서 비교하고, Protegrity는 배포·라이선스 확인 뒤 추가한다. 이번 조사만으로 기본 모델을 확정하지 않는다. 모델 출력 라벨을 maskara 역할에 억지로 대응시키지 말고, 이름 연결·가족 관계·주체별 날짜는 별도 resolver/policy에 둔다. (`src/lib/llm/anthropic-detector.ts:12`, `src/lib/mask.ts:98`)

### 4.2 컬럼 역할 분류

| 후보 | 라이선스 / 크기 | CPU·속도 | 한국어 | 독립 평가 / 용도 |
|---|---|---|---|---|
| **명시 schema + 현재 header 규칙** | 저장소 Apache-2.0 (`package.json:5`), 가중치 0B, `roles.ts` 95줄 | 순수 문자열 규칙, CPU 가능. 처리량 미측정 | 현재 영문 패턴 중심. 한글 header 사전은 새 작업 | 독립 평가 없음. **[추정] v0의 확정 역할은 사용자 schema로 받고 규칙은 제안에 사용** (`src/lib/roles.ts:71`) |
| **GLiNER2 base-v1의 text classification** | Apache-2.0, 205M [C1] | CPU 지원; maskara 컬럼 분류의 ms/column은 미확인 [T2C] | English checkpoint. 한국어 역할 분류 검증 없음 | 범용 추출/분류 모델이지 테이블 역할 전용 모델은 아님. **[추정] header + 샘플 + 허용 역할을 직렬화해 제안만 생성**. 해당 task 독립 평가 미확인 [C1] |
| **Presidio로 컬럼 샘플의 entity 분포 집계** | MIT + 선택 NLP 모델별 크기/라이선스 [P0], [P1] | CPU 가능, 표본 수·backend에 비례; 실제 속도 미확인 | 한글 recognizer/backend에 의존 [P2] | PII 종류에서 역할을 추론하는 조합은 **[추정]**. `person_key`, 환자/의료진, 날짜 의미는 entity type만으로 정할 수 없음 (`src/lib/types.ts:1`, `src/lib/llm/role-classifier.ts:39`) |

**[추정]** v0에서 생성형 LLM을 컬럼 분류만을 위해 추가하지 않는다. `schema > 검증된 규칙 > 모델 제안 > 미확정 오류` 우선순위가 재현성과 모델 용량에 유리하다. 현재 샘플링 상한(테이블 20, 컬럼 100, 컬럼당 5개/200자)은 안전한 기본 탐지 범위를 의미하지 않으므로 CLI 정책으로 다시 정한다. (`src/lib/llm/role-classifier.ts:39`)

### 4.3 OCR

| 후보 | 라이선스 / 크기 | CPU 실행과 공개 속도 | 한국어 | 독립 평가 / 주의 |
|---|---|---|---|---|
| **Indra OCR** | 코드 Apache-2.0, 가중치 **modified OpenRAIL-M**. 기본 모델 합계 7.3M/약 76MB; 라틴 recognizer만 약 1.25M [O1] | ONNX Runtime CPU, PyTorch/GPU 불필요. **[벤더]** x86 4 vCPU median auto 212ms/page, OCR-only 344ms/page. EPYC 9004 32core에서 OCR 43.9pages/s, 300페이지·warmup/load 제외 [O1] | CJK 한국어 지원; **[벤더]** 한국어 24 tests에서 79.2. 표본 작고 PII recall 아님 [O1] | 공개 suite를 사용하지만 저자 측정으로 분류. 독립 재현 수치 미확인. 가중치는 연구/개인/일정 규모 미만 기업 및 경쟁 API 제한이 있어 기본 OSS 번들에 자동 포함 금지 [O1L] |
| **PaddleOCR v5 mobile detector + korean v5 recognizer** | 프로젝트 Apache-2.0. detector 4.7MB + 한국어 recognizer 14MB; runtime·추가 모듈 별도. 배포 시 각 가중치 고지 확인 [O2L], [O2] | **[벤더]** Xeon Gold 6271C: det 57.77/28.15ms, rec 21.20/5.32ms(일반/고성능). 일반 CPU FP32/8 threads, **전·후처리 제외 모듈 시간이며 페이지 시간 아님** [O2] | 해당 recognizer가 한글·영문·숫자 지원, 자체 평균 정확도 88.0% [O2] | 이 고정 조합의 독립 한국어 PII/OCR 평가 미확인. 최신 default는 v6이므로 이름/버전 명시 필요. Indra의 다른 Paddle 구성 비교를 이 행의 성능으로 쓰지 않음 [O2] |
| **Tesseract 5 + tessdata_fast** | 코드/fast 데이터 Apache-2.0; `kor.traineddata` 약 1.6MB, 언어별 파일·실행 바이너리 추가 [O3], [O3F] | CPU 정수 LSTM. **고정 한국어 조합의 처리량 미확인**. Indra의 Latin Tesseract 측정은 경쟁사 비교이며 한국어 속도가 아님 [O3], [O1] | `kor` 모델 있음 [O3F] | 이번 조사에서 해당 구성의 독립 한국어 정확도 미확인. **[추정]** 가벼운 baseline/옵션 후보; pip만으로 native binary까지 설치된다고 가정하지 않음 [O3D] |

**[추정]** 허용적인 가중치 배포가 필수면 Paddle/Tesseract부터 검증하고, Indra는 이용 범위가 맞는 선택형 backend로 검토한다. OCR 인식률과 PII 누출률은 다르므로 이름·전화·주소·주민등록번호가 한 글자 깨지는 경우도 end-to-end 평가해야 한다. 현재 OCR confidence 필터와 추정 bbox가 민감 문자열을 놓칠 수 있는 경로도 포함한다. (`src/lib/ocr/indra.ts:95`, `src/lib/ocr/indra.ts:128`)

### 4.4 얼굴 탐지·재생성

| 후보 / 목적 | 라이선스 / 크기 | CPU·속도 | 한국어 | 독립 평가 / 판단 |
|---|---|---|---|---|
| **OpenCV YuNet 2023mar / 탐지** | 해당 모델 디렉터리 MIT; float ONNX 약 233kB, int8 약 100kB [F1], [F1F] | CPU 가능. **[유지관리자]** i7-12700K, OpenCV 4.10 CPU, 입력 160×120에서 평균 0.69ms. 고해상도 사진 전체 처리 시간으로 일반화 불가 [F1B] | 언어 비적용. 한국인 얼굴 subgroup recall은 별도 미확인 | 제작자 WIDER FACE 평가와 OpenCV 속도 자료 있음. 독립 재식별/마스킹 안전성 평가 미확인. **[추정] 탐지는 CPU에서 현실적** |
| **Stable Diffusion 1.5 inpainting 계열 / 재생성** | 원 모델 CreativeML OpenRAIL-M. 현재 배포 mirror의 UNet만 fp16 1.72GB/fp32 3.44GB, text encoder/VAE 등 추가 [F2] | Diffusers CPU 장치 실행 경로는 있음. **얼굴 1개당 CPU 시간 및 일관 페르소나 benchmark 미확인**. CPU offload는 GPU 없이 실행한다는 뜻이 아님 [F3] | 모델의 영문 prompt 경로 기준; 한국어 prompt 품질 미확인. 얼굴 탐지와는 다른 문제 | 원 논문의 일반 inpainting 평가를 identity 제거·동일 가상인물 유지의 증거로 사용할 수 없음. 해당 독립 평가 미확인 [F2P] |

**의견 [추정]: v0에서 얼굴 재생성을 뺀다.** 탐지는 작은 CPU 모델로 가능하지만, 재생성은 큰 모델 다운로드와 확산 반복 계산을 추가하고, 원 인물과 충분히 달라졌는지·서로 다른 사진에서 같은 가상 인물인지도 검증해야 한다. 현재 원격 서비스 구현도 저장소 밖이므로 그대로 재현할 수 없다. 이미지 지원이 필수라면 별도 후속 옵션으로 **탐지 후 불투명 가림**부터 검토한다. 얼굴·서명·문신·명찰까지 제거했다는 보장은 별도 검증 없이는 하지 않는다. ([F1B], [F2P], `src/app/api/faces/repaint/route.ts:48`, `src/lib/pipeline/image.ts:315`)

## 5. 참고할 CLI·SDK 패턴

명령은 조사 대상 도구의 예시이며 실행하지 않았다. Presidio·MOSTLY의 주요 공개 계약은 Python/REST SDK다. 아래에서 확인하지 않은 통합 CLI나 설정 파일을 존재한다고 가정하지 않는다.

| 도구 | 설치·호출 | 설정·출력 | 매핑·시드 | maskara에 적용할 패턴 [추정] |
|---|---|---|---|---|
| **Presidio** | `pip install presidio_analyzer presidio_anonymizer` + NLP 모델 별도 설치; `AnalyzerEngine`, `AnonymizerEngine`; REST/container 경로 [P1] | YAML로 analyzer/NLP/recognizer 설정. 탐지 `start/end/entity_type/score`, 익명화 결과 text/items [P3], [P4] | pseudonymization 예제는 별도 entity mapping을 공유하고 thread-safe하지 않다고 명시. hash operator는 2.2.361부터 기본 random salt, 반복 일관성은 사용자가 salt를 보관·전달 [P5], [P4] | detector와 transformer 분리; 선언형 설정; 매핑은 예제 dict 대신 트랜잭션 저장 |
| **MOSTLY AI Synthetic Data SDK** | Apache-2.0 SDK. `uv pip install -U "mostlyai[local]"`, `MostlyAI(local=True)`, `train/generate/probe` [M0], [M1] | dict/Pydantic config, CSV/Parquet 입력과 DataFrame 출력; dataset download·reports 메서드. local_dir·UDS/선택 TCP 지원 [M2], [M3] | `seed`는 조건부 생성용 DataFrame/파일. `random_state`는 별도 RNG seed. PK/FK 관계 지정은 원본 사람→가상 사람의 영속 역매핑과 같지 않음 [M2], [M3] | SDK와 CLI가 같은 실행 객체/리포트 계약 사용; 학습과 생성 분리. maskara는 v0에서 새 모델 학습을 요구하지 않음 |
| **OpenAI `opf`** | 저장소 설치 `pip install -e .`; `opf --device cpu -f input.txt`, stdin, Python module 경로 [T1C] | checkpoint 경로/env/cache, 구조화 결과와 JSONL 평가/학습 경로 [T1C] | 탐지·redaction 도구. maskara식 persona vault 계약은 확인 안 됨 | 명시적 device·model path·파일/stdin 인터페이스. 자동 다운로드와 offline을 분리 |
| **Indra `indra-ocr`** | `pip install indra-ocr`; `indra-ocr *.pdf --out results/` [O1C] | text/markdown/JSON, PDF는 JSONL page 출력; mode·cores·model-dir, timings stderr, 실패 exit status [O1C] | 생성형 persona/seed 적용 대상 아님 | 기계 출력 stdout과 진행 stderr 분리; page provenance·bbox·backend 버전 포함 |

Presidio의 salt, MOSTLY의 RNG `random_state`, 조건부 입력 `seed`, maskara의 비밀 매핑 키를 같은 개념으로 묶지 않는다. **[추정]** maskara CLI의 `--seed`는 공개 fixture/실험 재현용으로만 쓰고, 실제 가명화 일관성은 vault의 비밀키와 안정적인 entity namespace가 담당하게 한다. [P4], [M2], [M3]

## 6. 매핑 테이블 보안과 반복 실행

현재 데이터·페르소나·salt가 같은 localStorage에 있고, persona key 자체에 원본 식별값이 들어갈 수 있다. cache에도 원본 text가 들어가는 입력의 해시와 탐지 결과가 연결된다. 따라서 변환 결과뿐 아니라 vault·cache·audit·report의 보관 경계가 필요하다. (`src/lib/store.ts:15`, `src/lib/store.ts:35`, `src/lib/mask.ts:42`, `src/lib/pipeline/run.ts:125`, `src/lib/types.ts:254`)

### 6.1 저장·암호화 선택지

아래 선택·트레이드오프는 **[추정]**이며, 암호 primitive 동작의 근거는 각 공식 문서다.

| 방식 | 저장·암호화 | 반복 일관성 | 장점 / 비용 |
|---|---|---|---|
| 일회성 메모리 vault | 매핑 미저장; 프로세스 내 상태 | 키·정규화·알고리즘을 보존하지 않으면 다음 실행과 일치하지 않음 | 디스크 재식별 표 최소화; 증분 처리·충돌 해결·재시작 복구 어려움 |
| 암호화 JSONL snapshot | schema/version 포함 JSONL을 libsodium `secretstream` XChaCha20-Poly1305로 암호화. 임시 plaintext 파일 없이 저장 [S1] | snapshot + 비밀키 유지; writer lock·atomic replace 필요 | 작은 데모·백업에 단순; 임의 조회·대량 갱신·동시 실행 불리 |
| **SQLCipher SQLite** | DB page AES-256-CBC + HMAC-SHA512, 기본 passphrase KDF PBKDF2-HMAC-SHA512. raw key 입력도 지원 [S2] | namespace/entity/alias UNIQUE 제약과 transaction | 증분 처리·충돌 관리에 적합; Python/Node binding과 OS별 native 배포 검증 필요 |
| SQLite + 필드별 AEAD | `lookup=HMAC(K_lookup, namespace/type/canonical)`; 민감 payload는 AES-GCM 또는 ChaCha20-Poly1305. random nonce·AAD 사용 [S3] | 결정적인 lookup과 저장된 persona 재사용 | 표준 SQLite 이용 가능; 인덱스의 동일성·행 수·접근 패턴은 노출. 암호 프로토콜 구현 실수 위험이 더 큼 |
| stateless HMAC 기반 생성 | 원본 매핑 표 없이 비밀키·정규화·버전으로 가상 후보 생성 | 같은 정확한 입력에는 재현 가능 | 표가 없어도 비밀키가 유출되면 후보 대조 가능. 별칭/coreference·충돌 해결·이름 변경을 혼자 해결하지 못함 |

**[추정/추천]** 반복 실행 제품은 SQLCipher vault를 우선 검토하고, 작은 v0의 설치 부담이 커지면 암호화 snapshot을 제한된 단일 writer 모드로 비교한다. 평문 CSV/JSON을 기본 mapping 출력으로 만들지 않는다. 암호화는 디스크 유출에 대한 보호이며, 실행 중 프로세스나 키에 접근 가능한 공격자까지 막는다는 주장은 하지 않는다. [S1], [S2], [S3]

### 6.2 제안하는 vault 계약 [추정]

1. **안정적인 namespace**: 임의 업로드 UUID 대신 사용자 지정 project/dataset namespace와 명시적 주체키를 사용한다. 키가 없으면 이름만으로 자동 병합하지 않고 불확실한 mention으로 표시한다. 근거: 현재 dataset/key 및 surname 휴리스틱의 한계 (§2.4).
2. **기록 필드**: `schema_version`, `namespace`, `entity_id`, `entity_type`, 정규화 규칙 버전, 암호화 원본/aliases, persona payload, 날짜 offset, generator/locale 버전, key ID, 생성/갱신 이력. 공개 출력에는 원본 lookup·원본 해시·vault 경로·복원 키를 싣지 않는다. 근거: 현재 원문 포함 객체 (§2.5).
3. **키 수명**: CSPRNG로 master key 생성, 저장 암호화·lookup HMAC·persona 생성의 용도를 분리한다. OS keyring 또는 권한 제한 key file/secret mount로 전달하고 CLI 인자·git 설정 파일·로그에 원문 키를 넣지 않는다. passphrase 모드라면 Argon2id 등 검증된 KDF와 파라미터를 기록한다. SQLCipher 자체 passphrase KDF와 혼동하지 않는다. [S2], [S4]
4. **재실행 규칙**: 기존 entity의 persona/offset을 먼저 읽고, 새 entity만 생성한다. 저장 시 유일성 검사와 transaction/lock으로 동시 생성 충돌을 방지한다. 이름 공간이 부족할 때의 확대/중단 정책을 둔다. Presidio의 mapping 예제가 명시하는 동시성 한계가 참고된다. [P5]
5. **버전 고정**: model ID/revision/hash, tokenizer·threshold, detector policy, normalization/generator 버전, locale, 기준일을 run manifest에 기록한다. 모델 변경으로 기존 인물을 새 인물로 만들지 않도록 탐지 결과와 entity ID를 분리한다. 현재 cache key의 v2/v3+text/context/engine만으로는 실제 가중치 revision을 식별하지 못한다. (`src/lib/pipeline/run.ts:125`)
6. **회전·복구**: 암호화 키 회전과 persona 생성 키 회전을 구분한다. 전자는 기존 매핑을 재암호화해 출력 일관성을 유지할 수 있지만, 후자는 신규 생성 규칙이 바뀔 수 있다. 백업도 암호화하고, vault를 잃으면 불확실한 복원을 조용히 생성하지 말고 중단한다. [S1], [S2]
7. **cache/audit 분리**: 원본 텍스트·이미지·탐지 예시는 기본 영속 cache에서 제외하거나 같은 보안 경계로 암호화한다. plaintext 임시파일·로그·report 샘플도 점검한다. 현재 quota 오류를 삼키는 localStorage와 최근 run 일부만 정리하는 정책은 CLI의 durable commit 의미로 사용하지 않는다. (`src/lib/store.ts:35`, `src/lib/store.ts:75`, `src/lib/pipeline/utility.ts:311`)

가명화와 날짜 이동만으로 데이터 전체의 재식별 위험이 사라지지는 않는다. **[추정]** report에는 지표가 검사한 범위와 검사하지 못한 범위를 명시하고, 통계적 익명성이나 법적 준수를 보증하는 이름을 붙이지 않는다. OpenAI도 도구 자체를 익명화/준수 보증으로 해석하지 말라고 명시한다. [T1]

## 7. v0 범위 제안

이 절의 기능·명령·경로·목표는 모두 **[추정/설계 초안]**이다. 현재 구현된 CLI나 확보한 성능 약속이 아니다.

### 7.1 포함과 제외

| 포함 제안 | 이유·근거 |
|---|---|
| CSV 여러 테이블 + TXT/JSONL 노트, 명시적 person key/관계 schema | 현재 structured→text 매핑 흐름이 핵심 재사용 자산 (`src/lib/pipeline/run.ts:342`, `src/lib/pipeline/run.ts:419`) |
| 이름·ID·연락처 치환, 사람별 일관 날짜 이동, 매핑 충돌 검출 | 현재 규칙을 보안·Unicode·증분 처리 계약으로 고도화 (§2.4, §6) |
| CPU PII 모델 한 개 + 규칙, schema 우선 컬럼 역할 | 탐지와 resolver 분리; 실제 모델은 동일 조건 benchmark 후 선택 (§4.1–4.2) |
| 디지털 PDF 텍스트 추출 + 단순 인쇄 스캔 OCR; 결과는 masked TXT/JSONL | CPU OCR 경로 있음. 현 raster-only PDF와 다른 입력 어댑터 필요 (§2.6, §4.3) |
| 암호화 vault, `--offline`, 모델 revision/hash 고정 | 반복 매핑·로컬 약속의 실질적 조건 (§6) |
| 집계 JSON report + 로컬 HTML report, reproducibility manifest | 현재 지표를 독립 숫자 계약으로 분리 (§2.5); MOSTLY reports 패턴 [M2] |
| 재실행·행 순서 변경·증분 추가에 대한 일관성 검사 | 지금 키/별칭/유한 이름 풀의 한계 (§2.4) |

| 제외/후속 제안 | 이유·조건 |
|---|---|
| 얼굴 재생성, 동일 가상 얼굴 보장 | CPU/크기·identity 검증 공백 (§4.4) |
| 원본 레이아웃·이미지·첨부를 유지한 마스킹 PDF 배포 | 숨은 text layer·metadata·bbox·얼굴·서명까지 검증하는 별도 출력 문제. 현재 PDF/image 코드도 별도 캔버스 경로 (`src/lib/pipeline/pdf.ts:38`, `src/lib/pipeline/image.ts:413`) |
| 손글씨·복잡한 폼의 무검토 자동 통과 | OCR·읽기 순서·PII 잔존 평가 미완료 (§2.6, §4.3) |
| 음성 재합성·음성 파일 익명화 | 현재 audio 역할은 원본 레코드를 redaction 처리할 뿐, 로컬 음성 모델이 없음 (`src/lib/pipeline/run.ts:328`) |
| Claude 기반 데이터 랩·원격 GPU·클라우드 업로드 | CPU/offline 첫 경험과 범위 분리 (`src/lib/lab.ts:94`, `.env.example:3`) |
| 합성 모델 학습, DP·법적 익명성 보증 | v0는 원본 구조를 보존하는 치환이며 MOSTLY식 생성 모델 학습과 다른 목표 [M2]; 현재 검사도 보증 아님 (§2.5) |

**PDF 범위의 명시적 차이:** 이 v0 제안은 “PDF를 넣어 학습용 마스킹 텍스트를 얻기”까지다. **“원본처럼 보이는 안전한 PDF 파일을 받기”는 충족하지 않는다.** 후자가 필수면 출력 레인과 검증 범위를 늘려야 하며, 열린 결정으로 남긴다. 이미지·레이아웃이 빠진 결과를 성공으로 오인하지 않도록 report에 `output_modality=text`와 누락한 modality를 기록한다.

**한국어 범위:** 첫 안정 프로파일은 영어로 한정하는 안을 제안한다. 한국어는 지원을 조용히 가정하지 않고 실험 프로파일/검증 미완료 상태로 구분한다. 한국어 day-one가 필수라면 Unicode 이름 연결, 국내 ID·주소·전화·날짜 규칙, 한국어 gold corpus가 v0 선행 조건이다. OCR 한글 지원만으로 자유 텍스트 PII 지원이 완성되지 않는다. (`src/lib/mask.ts:141`, §4)

### 7.2 CLI 초안

`maskara-engine` 패키지 이름·extras·명령은 제안 이름이며 registry 사용 가능 여부를 확인하지 않았다. 아래 명령은 실행하지 않았다.

```bash
# Proposed installation; package name and extras are not finalized.
pip install "maskara-engine[cpu,pdf]"

# Download pinned model assets explicitly; no input data is uploaded.
maskara models fetch --profile cpu-en --lock models.lock.json
maskara init --config maskara.yaml --vault .maskara/vault.db

# Linked tables, notes and PDFs are declared in the config.
maskara mask --config maskara.yaml --offline --output out/run-001

# Render an existing aggregate report; do not copy raw PII examples.
maskara report out/run-001/report.json --format html --output out/run-001/report.html

# Proposed reproducible benchmark on synthetic or authorized gold data.
maskara bench --config bench.yaml --device cpu --threads 4 --seed 42 \
  --output out/bench-001

# Later batches reuse the same encrypted vault and namespace.
maskara mask --config batch-002.yaml --vault .maskara/vault.db \
  --namespace demo-cohort --offline --output out/run-002
```

`init`는 vault key를 안전한 별도 저장소에 만들고, config에는 키 참조만 남기는 안이다. `mask`는 미확정 schema·모델 누락·검증 실패에서 원본을 자동 통과시키지 않는다. 제안 종료 코드: 0 완료, 2 설정/지원 범위 오류, 3 실행 실패, 4 privacy/utility gate 실패. report가 없는 경우에는 성공 리포트를 합성하지 않는다. 로그/진행은 stderr, 데이터/JSON은 stdout 또는 명시한 파일에 둔다. 근거: 현재 keep/실패 처리 차이 (§2.5), Presidio 설정·Indra CLI 패턴 [P3], [O1C].

```yaml
# Proposed schema; not an existing configuration format.
version: 1
namespace: demo-cohort
locale: en-US
reference_date: "2026-01-01"
runtime:
  device: cpu
  offline: true
  models_lock: models.lock.json
vault:
  path: .maskara/vault.db
  key_ref: keyring:maskara/demo-cohort
tables:
  - path: input/people.csv
    name: people
    entity_key: person_id
    roles:
      person_id: person_key
      name: name
      birth_date: dob
      diagnosis: keep
documents:
  - manifest: input/documents.jsonl
    entity_key: person_id
    pdf_output: text
policy:
  unknown_column: error
  unsupported_language: error
  detection_failure: error
  persist_raw_examples: false
```

**[추정]** `documents.jsonl`은 문서 경로와 주체키를 명시적으로 연결한다. `keep`도 사용자가 의도한 정책으로 취급하고 report에 남긴다. 출력은 마스킹 CSV, 마스킹 문서 JSONL, 집계 report, run manifest로 제한한다. vault·원본 캐시·원본 예시를 결과 디렉터리에 동봉하지 않는다. 입력 파일명에도 PII가 있을 수 있으므로 공개 출력 파일명은 별도 run ID/불투명 ID로 만든다. 근거: 현재 원문 포함 출력 구조 (§2.5).

### 7.3 패키지 디렉터리 초안 — 추천 A를 택할 경우

```text
packages/
  engine/
    pyproject.toml
    src/maskara/
      api.py                 # MaskConfig, RunResult, mask(), report()
      cli.py                 # mask / report / bench / models / init
      contracts/             # versioned inputs, spans, events, reports
      core/                  # personas, aliases, entity resolution, dates
      policy/                # roles, locale rules, failure policy
      detectors/             # PII backend interface and adapters
      ocr/                   # local OCR adapters, page provenance
      io/                    # CSV, JSONL, text, PDF extraction
      vault/                 # encrypted state and transactions
      metrics/               # privacy, utility, aggregate report
      runtime/               # model registry, locks, offline behavior
    tests/fixtures/          # synthetic gold; no customer PII
    bench/                   # scoring definitions and hardware manifests
  contracts/                 # JSON Schema; generated TypeScript types
src/                         # existing Next.js frontend retained initially
```

코어는 파일 읽기·HTTP·React를 직접 호출하지 않고 detector/OCR/vault/clock/RNG/event sink를 주입하는 설계안이다. Python으로 옮길 때 TS UTF-16 offset과 Python code point의 차이를 계약에 명시하고, emoji·결합 문자·한국어·개행으로 왕복을 검증한다. 현재 span 계산은 JS 문자열의 slice/indexOf에 의존한다. (`src/lib/mask.ts:332`, `src/lib/pii/span-eval.ts:80`)

### 7.4 웹앱이 엔진을 쓰는 방법 [추정]

- **A 채택 시**: CLI와 Python SDK는 같은 엔진 API를 호출한다. 로컬 웹 실행은 엔진 프로세스와 stdin/stdout JSONL 또는 localhost API로 통신하고, Next 라우트는 요청/이벤트 변환만 담당한다. 브라우저 zustand는 UI 상태만 보관한다. 기존 파일별 HTTP 라우트의 책임을 좁히는 방향이다. (`src/app/api/detect-pii/route.ts:7`, `src/lib/store.ts:15`)
- **공개 호스팅 웹앱**이 서버에서 Python 엔진을 실행하면 사용자 데이터는 서버로 이동한다. 이를 로컬/offline과 같은 모드로 부르면 안 된다. 기본 로컬 경험은 로컬 UI 또는 파일로 내보낸 집계 report 열기로 제공하고, hosted 제품 연결은 별도 사용 모드로 결정한다. (`README.md:49`, `intents.md:21`)
- localhost API를 제공한다면 loopback 바인딩·세션 토큰·origin 허용·경로 접근 범위를 정의한다. C를 선택해도 같은 통신·보안 계약이 필요하다. B라면 공용 TS 코어를 직접 import하고 Node/browser 모델 adapter만 다르게 둘 수 있다. 근거: 현재 client 실행기/원격 경계 (§2.1), Node 추론 지원 [J1], [J2].

### 7.5 5분 데모와 benchmark의 합격 조건 초안 [추정]

1. 합성 예제: 연결 CSV 2개, 노트 10개, 디지털/스캔 PDF 각 1개. macOS ARM64와 Linux x86_64, CPU 4 threads/메모리 16GB를 우선 측정 대상으로 제안한다. 이것은 지원 확정/실측 수치가 아니다.
2. 최초 설치·모델 다운로드·cold load·처리·리포트 생성을 각각 측정한다. “5분”은 이 전체 시간인지 모델 캐시 이후 시간인지 공개한다. 파일 bytes, peak RSS, CPU/OS/runtime, p50/p95, docs/s·pages/s·characters/s를 기록한다. 후보별 속도 자료의 조건 차이(§4)를 해소하기 위한 절차다.
3. privacy: gold exact-span+type P/R/F1, 잔존 PII 문자율, 타입별 false negatives, false positives, OCR로 깨진 PII까지 포함한 end-to-end 점수. **gold 없는 실제 파일에는 recall=N/A**, 검사한 규칙과 검출된 문제 수만 표시한다. (§2.5)
4. utility: 행/컬럼·PK/FK·주체 연결·사람별 날짜 간격·비민감 값 보존·노트의 비민감 문자열 보존. 과잉 가림 비율도 측정한다. RL/AI task 성능은 별도의 사용자 평가이며 일반 utility 점수로 대신 주장하지 않는다. (`src/lib/pipeline/utility.ts:105`)
5. 동일 vault에서 재실행·행 순서 변경·배치 분할·새 행 추가, 동일 이름의 다른 사람, 성 변경, shared 전화번호, 윤일, 한글/emoji offset, 알파벳 ID, 충돌·중간 중단을 검증한다. 근거: §2.4의 구체적 취약 경계.
6. 최초 모델 준비 후 네트워크를 차단한 환경에서 모든 지원 입력이 처리되는지 검증한다. model manifest/checksum과 결과에 원문·민감 파일명·키가 섞이지 않는지도 검사한다. 정량 합격선은 데이터셋과 위험 허용도 결정 후 고정하며 이번 문서에서 임의로 인증 수치를 만들지 않는다. (§6)

## 8. 사용자가 결정해야 할 열린 질문

1. **언어**: A Python 추천을 받아들일지, 웹과 TS 코어 공유를 우선해 B로 갈지? C가 필요한 구체적인 Python 전용 모델은 무엇인지? (§3)
2. **한국어 출시 조건**: v0 안정 지원 언어가 영어여도 되는지, 한국어 이름·주민등록번호·주소·노트가 day-one 필수인지? (§2.4, §4)
3. **PDF 출력**: 학습용 마스킹 텍스트/JSONL로 충분한지, 레이아웃을 보존한 안전한 PDF가 필수인지? (§7.1)
4. **일관성 경계**: 한 파일·dataset·프로젝트·조직 중 어디까지 같은 사람을 연결할지? 다른 기관의 같은 ID/이름은 반드시 분리할지? (§2.4, §6)
5. **mapping 복원**: 원본을 복원할 필요가 있는지, 암호화 별칭/lookup만으로 충분한지? 보관 기간·백업·키 관리자·키 분실 정책은 무엇인지? (§6)
6. **실패 정책**: 불확실한 주체·미지원 언어·OCR 저신뢰 때 중단, 해당 항목 격리, 전체 가림 중 무엇을 허용할지? (§2.5, §7.2)
7. **라이선스**: 코드뿐 아니라 기본 가중치도 제한 없는 재배포를 요구하는지? Indra 같은 제한 있는 선택형 backend를 허용할지? (§4)
8. **설치 목표**: 5분에 모델 다운로드를 포함하는지? 최소 CPU/RAM/OS와 허용 다운로드 크기는 얼마인지? 단일 바이너리는 v0 필수인지? (§3, §7.5)
9. **persona/utility 정책**: 성별·가족 성·나이 구간·지역·날짜 간격 중 무엇을 유지할지? 실제 가정하면 안 되는 속성과 과잉 마스킹 허용 수준은 무엇인지? (`src/lib/personas.ts:65`, `src/lib/pipeline/utility.ts:208`)
10. **평가 corpus**: RL·AI 사용자가 승인한 gold 데이터와 downstream task는 무엇인지? 공개 synthetic fixture와 고객 평가의 경계를 어떻게 둘지? (§4.1, §7.5)
11. **웹 제품 모드**: 완전 로컬 UI, hosted 서버 처리, 선택형 localhost 연결 중 무엇을 유지할지? (§7.4)

## 웹 출처

모든 URL은 2026-10-25 열람 기준이다. `main`/`latest`는 변경될 수 있으므로 실제 채택 때 release·commit·모델 hash를 고정해야 한다. 위 표의 “미확인” 항목은 모델 다운로드나 실측으로 보완하지 않았다.

[T1]: https://huggingface.co/openai/privacy-filter
[T1B]: https://openai.com/index/introducing-openai-privacy-filter/
[T1C]: https://github.com/openai/privacy-filter
[T1F]: https://huggingface.co/openai/privacy-filter/tree/main/onnx
[T1SF]: https://huggingface.co/openai/privacy-filter/tree/main
[T2]: https://huggingface.co/fastino/gliner2-privacy-filter-PII-multi
[T2F]: https://huggingface.co/fastino/gliner2-privacy-filter-PII-multi/tree/main
[T2P]: https://arxiv.org/html/2605.09973v1
[T2C]: https://github.com/fastino-ai/GLiNER2
[T3]: https://huggingface.co/nvidia/gliner-PII
[T3F]: https://huggingface.co/nvidia/gliner-PII/tree/main
[T4]: https://github.com/Protegrity-AI-Developer-Edition/protegrity-ai-developer-edition
[T4L]: https://github.com/Protegrity-AI-Developer-Edition/protegrity-ai-developer-edition/blob/main/LICENSE
[T4P]: https://arxiv.org/html/2610.30518v1
[T4M]: https://huggingface.co/hbassi-proteg/protegrity-pii
[E1]: https://github.com/gauravvij/pii-filter-model-eval
[C1]: https://huggingface.co/fastino/gliner2-base-v1
[P0]: https://github.com/data-privacy-stack/presidio/blob/main/LICENSE
[P1]: https://microsoft.github.io/presidio/installation/
[P2]: https://github.com/data-privacy-stack/presidio/blob/main/docs/analyzer/languages.md
[P2K]: https://github.com/data-privacy-stack/presidio/blob/main/docs/analyzer/filtering_by_country.md
[P3]: https://github.com/data-privacy-stack/presidio/blob/main/docs/samples/python/no_code_config.ipynb
[P4]: https://github.com/data-privacy-stack/presidio/blob/main/docs/anonymizer/index.md
[P5]: https://github.com/data-privacy-stack/presidio/blob/main/docs/samples/python/pseudonymization.ipynb
[M0]: https://github.com/mostly-ai/mostlyai/blob/main/LICENSE
[M1]: https://mostly.ai/docs/python-sdk
[M2]: https://mostly-ai.github.io/mostlyai/api_client/
[M3]: https://mostly-ai.github.io/mostlyai/api_domain/
[O1]: https://huggingface.co/datalab-to/indra-ocr
[O1L]: https://huggingface.co/datalab-to/indra-ocr/blob/main/LICENSE
[O1C]: https://github.com/datalab-to/indra
[O2]: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md
[O2L]: https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
[O3]: https://github.com/tesseract-ocr/tessdata_fast
[O3F]: https://github.com/tesseract-ocr/tessdata_fast/blob/main/kor.traineddata
[O3D]: https://tesseract-ocr.github.io/tessdoc/Installation.html
[F1]: https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/README.md
[F1F]: https://huggingface.co/opencv/opencv_zoo/tree/d4938dfc9d4ec5d098bfa33e98b3f3345a236586/models/face_detection_yunet
[F1B]: https://github.com/opencv/opencv_zoo/blob/main/benchmark/README.md
[F2]: https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting/tree/main/unet
[F2P]: https://arxiv.org/abs/2112.10752
[F3]: https://github.com/huggingface/diffusers/blob/main/docs/source/en/stable_diffusion.md
[J1]: https://huggingface.co/docs/transformers.js/tutorials/node
[J2]: https://onnxruntime.ai/docs/get-started/with-javascript/node.html
[J3]: https://nodejs.org/api/single-executable-applications.html
[J4]: https://pyinstaller.org/en/stable/operating-mode.html
[S1]: https://doc.libsodium.org/secret-key_cryptography/secretstream
[S2]: https://www.zetetic.net/sqlcipher/design/
[S3]: https://cryptography.io/en/latest/hazmat/primitives/aead/
[S4]: https://doc.libsodium.org/password_hashing/default_phf

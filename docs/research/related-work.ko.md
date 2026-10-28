# 관련 연구

> 한국어 번역본. 논문 제목·링크와 기관·저자 고유명사는 원문을 유지했다. 검증·조사 범위 및 연구 공백에 관한 서술도 원문 기준이며, 번역 과정에서 새로 검증한 내용은 아니다. 용어: PII는 개인식별정보, PHI는 개인건강정보, DP는 차등 개인정보 보호, persona는 가상 인물, vault는 매핑 저장소를 뜻한다.

PII(개인식별정보) 마스킹, 비식별화, 합성 데이터, 재식별에 관한 출판 논문을 한 줄씩 요약했다. 연구실별로 분류하고 Maskara와 관련성이 높은 순서로 정리했다. 수집일: 2026-10-27.

- **중복 제거 후 351편.** 각 항목의 첫 줄에는 핵심 아이디어와 Maskara에 주는 시사점을, 둘째 줄에는 연도·연구실·논문 링크 등 메타데이터를 담았다.
- **검증:** arXiv 링크 228개를 모두 열어 인용 논문과 제목이 일치하는지 확인했다. PubMed ID 63개도 NCBI에서 조회해 대조했다. 나머지는 링크 접속을 확인했으나 IEEE, ACM, SSRN, Harvard 등 일부 사이트는 자동 요청을 차단해 열지 못했다. 연구실 정보는 PDF 머리말이 아닌 저자 목록과 초록을 바탕으로 작성했다. `*` 또는 ‘미검증’ 표시가 있는 소속은 추정이다.
- **조사 범위:** 수집 도중 웹 검색 한도에 도달해 금융·법률 분야와 일부 연구실의 조사량이 부족하다. [연구 공백](#연구-공백과-개척-가능한-영역)을 참고하라.

## 먼저 읽을 연구

Maskara의 기능이나 주장과 가장 직접적으로 관련된 30편이다.

### 지우기보다 대체하기

- 사실적인 대체 정보를 넣으면 탐지기가 놓친 식별정보가 가짜 정보 사이에 섞여 눈에 띄지 않는다. | `[REDACTED]` 대신 가상 인물 정보를 사용해야 한다는 핵심 근거.  
  [Hiding in plain sight](https://pubmed.ncbi.nlm.nih.gov/22771529/) — Kaiser WA, 2013

- 분류기가 잔존하는 실제 PHI(개인건강정보)와 대체 정보를 구분하도록 학습한다. | 우리 접근법에 대한 주요 공격. 보고서에 추가할 가치가 있다.  
  [Parrot attack on HIPS text](https://pubmed.ncbi.nlm.nih.gov/31390016/) — Kaiser WA, 2019

- 사람도 사실적인 대체 정보 사이에서 실제 유출 정보를 안정적으로 찾아내지 못한다. | 가상 인물 정보가 잔존 원본의 위험을 줄인다는 근거.  
  [HIPS vs. hostile human readers](https://pubmed.ncbi.nlm.nih.gov/32930712/) — Kaiser WA, 2020

- 탐지기가 일부 PHI를 놓칠 때 일관된 대체, 무작위 대체, 마르코프 기반 대체를 비교한다. | ‘한 사람 = 하나의 가상 인물’ 설계의 대가를 직접 평가한다.  
  [Markov chain surrogate replacement](https://pubmed.ncbi.nlm.nih.gov/41122293/) — UAB, 2025

- 대체 정보를 넣은 임상 텍스트로 사전학습해도 6개 작업에서 원본과 비슷한 성능을 낸다. | ‘학습 데이터로서 유용성을 유지한다’는 주장을 수치로 뒷받침한다.  
  [Downstream BERT on de-identified data](https://aclanthology.org/2022.lrec-1.451) — Stockholm, 2022

- 사전학습과 미세조정 데이터를 모두 가명처리해도 정확도 손실이 거의 없다. | 위와 같은 시사점.  
  [End-to-end pseudonymization of clinical BERT](https://pubmed.ncbi.nlm.nih.gov/38915012/) — Stockholm, 2024

- 블러는 학습된 모델의 성능을 떨어뜨리지만 사실적인 대체는 영향이 작다. | 사진에서도 ‘지우기보다 대체하기’가 유효하다.  
  [Does image anonymization impact CV training?](https://arxiv.org/abs/2306.05135) — NTNU, 2023

- 원격 LLM에 보내기 전 식별정보를 일관된 가명으로 바꾸고 이후 복원한다. | Maskara의 텍스트 처리에 가장 가까운 선행 연구.  
  [LOPSIDED](https://arxiv.org/abs/2510.27016) — 2025


### 날짜, ID, 매핑 저장소(vault)

- 환자별로 하나의 무작위 날짜 이동값을 적용하고 데이터셋 경계를 잘라 갱신 시 실제 날짜가 새지 않게 한다. | 개인별 날짜 이동의 선행 연구. 경계 절단 단계도 도입할 가치가 있다.  
  [Shift and Truncate](https://pubmed.ncbi.nlm.nih.gov/27013522/) — Columbia, 2016

- 요일과 공휴일 패턴으로 공격자가 실제 날짜 이동값을 알아낼 수 있다. | 이동을 주 단위로 제한하거나 이동값의 탐지 가능성을 측정해야 한다.  
  [Unshifting date-shifted clinical data](https://pubmed.ncbi.nlm.nih.gov/42863778/) — UTHealth, 2026

- 계절과 요일 신호로 날짜가 이동되었다는 사실을 알아낼 수 있다. | 보고서에 날짜 이동 탐지 가능성 검사를 추가할 근거.  
  [Detection of date shifting](https://pubmed.ncbi.nlm.nih.gov/37459888/) — TriNetX, 2023

- 값의 형식을 유지하는 rank-then-encipher 및 Feistel 구성을 엄밀하게 다룬다. | `CUS-575198` → `CUS-224730` 변환의 이론적 기반.  
  [Format-Preserving Encryption](https://eprint.iacr.org/2009/251) — UCSD/UC Davis, 2009

- HMAC 연결 키의 안전성에는 가정이 필요하며 보조 테이블로 재식별이 가능했다. | 키 기반 해시 저장소와 그 출력물의 위협 모델에 참고.  
  [Similarity tables + pseudonymisation](https://arxiv.org/abs/1712.00871) — Melbourne, 2017

- 여러 시스템의 환자 ID를 연결하는 키 기반의 복원 가능한 가명처리 서비스. | 매핑 저장소의 선행 연구.  
  [Pseudonymization for translational research](https://pubmed.ncbi.nlm.nih.gov/23883409/) — Oslo, 2013


### 평가 보고서: 무엇을 측정할 것인가

- GDPR의 세 위험인 개별 대상 구별, 연결 가능성, 추론을 공격 기반으로 평가한다. | 연결 공격 결과와 함께 제시할 규제 친화적 위험 지표.  
  [Anonymeter](https://arxiv.org/abs/2211.10459) — Statice, 2023

- 합성 데이터도 유출 또는 유용성 손실을 겪으며 기존 익명화보다 무조건 유리하지 않다. | 주장의 범위 설정과 연결 공격 설계에 참고.  
  [Synthetic Data – Anonymisation Groundhog Day](https://arxiv.org/abs/2011.07018) — EPFL, 2022

- 가장 가까운 레코드까지의 거리로는 안전해 보이는 데이터도 멤버십 공격에 취약하다. | 거리 지표를 개인정보 보호의 증거로 보고해서는 안 된다.  
  [The DCR Delusion](https://arxiv.org/abs/2505.01524) — Imperial/UCL, 2025

- 코퓰라 모델로 개인별 고유성을 평가한다. 인구통계 속성 15개로 미국인의 99.98%를 고유하게 구별한다. | 유지하는 준식별자에 대해 레코드별 고유성 점수를 계산할 근거.  
  [Estimating re-identification success](https://pmc.ncbi.nlm.nih.gov/articles/PMC6650473) — Imperial, 2019

- 구매 기록 4개로 카드 소지자의 90%를 고유하게 구별한다. | 은행 거래 테이블은 이름만 바꾸는 것으로 부족하다.  
  [Unique in the shopping mall](https://dspace.mit.edu/handle/1721.1/96321) — MIT, 2015

- LLM은 무해해 보이는 글에서도 위치·나이·소득을 추론한다. | 이름을 바꿔도 추론 가능한 속성이 남으므로 시험해야 한다.  
  [Beyond Memorization](https://arxiv.org/abs/2310.07298) — ETH SRI, 2023

- LLM 에이전트가 가명 사용자를 재현율 68%, 정밀도 90%로 재식별한다. | 연결 공격 평가에서 모사해야 할 공격자.  
  [Large-scale online deanonymization with LLMs](https://arxiv.org/abs/2602.16800) — ETH/Anthropic, 2026

- LLM이 비식별화된 진료 기록의 실제 환자를 알아내려 시도한다. | 마스킹된 텍스트에 적용할 구체적인 LLM 연결 공격.  
  [DIRI](https://pubmed.ncbi.nlm.nih.gov/40502277/) — Cornell Tech, 2025

- 유럽인권재판소 사건 문서에 직접식별자·준식별자를 표시하고 개인정보 보호·유용성 지표를 제공한다. | 텍스트 기능의 공개 벤치마크.  
  [Text Anonymization Benchmark (TAB)](https://arxiv.org/abs/2202.00443) — Oslo/NR, 2022

- 재식별 연구 그룹의 새로운 텍스트 익명화 벤치마크. | 추가로 사용할 수 있는 최신 벤치마크.  
  [RAT-Bench](https://arxiv.org/abs/2602.12806) — Imperial, 2026


### 탐지

- 8종 PII를 탐지하며 로컬에서 실행되는 소형 공개 가중치 토큰 분류기. | GLiNER2와 비교 평가할 탐지기.  
  [OpenAI Privacy Filter](https://openai.com/index/introducing-openai-privacy-filter/) — OpenAI, 2026

- 합성 인물 레코드 10만 건으로 GLiNER를 미세조정했으며 55종 이상 PII를 지원한다. | 탐지기 비교 대상이며 데이터셋도 바로 평가에 사용할 수 있다.  
  [GLiNER-PII + Nemotron-PII](https://huggingface.co/nvidia/gliner-PII) — NVIDIA, 2025

- LLM 기반 PII 탐지기는 모호한 문맥에서 이름을 놓친다. | 이름 재현율이 약점이므로 별도 평가가 필요하다.  
  [Can LLMs really recognize your name?](https://arxiv.org/abs/2505.14549) — UMass/Google, 2025

- Transformer 탐지기와 규칙 기반의 사실적인 대체 정보를 결합하며 모델을 공개한다. | Maskara와 같은 설계에 대해 출판된 성능 수치가 있다.  
  [Stanford radiology de-id with HIPS](https://pubmed.ncbi.nlm.nih.gov/36416419/) — Stanford AIMI, 2023


### 향후 확장: 사진과 PDF

- StyleGAN 공간에서 비밀번호로 정체성을 암호화한다. 같은 키면 같은 가짜 얼굴을 얻는다. | 얼굴에서도 ‘한 사람 = 하나의 가상 인물’을 구현한다.  
  [RiDDLE](https://arxiv.org/abs/2303.05171) — CASIA, 2023

- 남은 글자 간격으로 검게 가린 이름을 알아낼 수 있다. | PDF에서는 상자만 그리지 말고 글리프 위치를 재구성해야 한다.  
  [Glyph positions break PDF redaction](https://petsymposium.org/popets/2023/popets-2023-0069.php) — UIUC, 2023


## 연구 공백과 개척 가능한 영역

**이번 조사만으로 같은 설계의 존재 여부를 확정하지 못했으며, 독창성은 미입증이다.** 조사가 불완전하므로 문서·테이블·반복 실행에 걸친 키 기반의 일관된 대체에 선행 연구가 없다고 단정할 수 없다. HIPS, 환자 중심 가명처리, LOPSIDED는 이미 중요한 구성 요소를 다룬다. 방법론 논문에는 최초라는 주장보다 정확한 비교 범위와 강한 비교군 대비 측정된 개선이 필요하다.

**상용 제품과의 중복도 고려해야 한다.** Tonic은 Textual과 Structural 사이에서 일부 대체값을 일치시키고, 실행·DB 간 통계 시드를 공유하는 기능을 문서화했다([공식 문서](https://docs.tonic.ai/textual/dataset-configure-redaction/textual-datasets-synthesis-options/enable-structural-consistency.md), 2026-10-27 확인). 형식 간 일관성만으로 차별점이 입증된 것은 아니다. Maskara의 다음 평가는 탐지·날짜 처리·인물 연결을 공통으로 두고 대체 표현의 효과를 분리한다. [벤치마크 결과](bench-results.md)를 참고하라.

**여러 모달리티의 정체성 일관성은 이번 조사에서 열린 연구 질문이다.** 텍스트·얼굴·음성에서 한 사람을 하나의 합성 정체성에 매핑하는 종단간 비교를 확립하지 못했으며, 그런 연구가 없다는 뜻은 아니다. 관련 요소는 RiDDLE의 키 기반 가짜 얼굴, 영상의 정체성 일관성 연구, 가상 화자 음성 연구다. 멀티모달 확장은 우선 텍스트·테이블의 유용성과 위험을 더 강한 비교군으로 측정한 뒤 진행한다.

**날짜 이동에는 알려진 공격이 있다.** 정식 참고 연구는 Shift and Truncate다. 2023년과 2026년 논문은 요일과 계절 패턴이 날짜 이동을 드러낼 수 있음을 보여준다.

**조사가 부족한 분야:**
- 금융: 확인한 연구는 J.P. Morgan 논문 2편과 금융 문서 PII 논문 1편뿐이다. Capital One, Bloomberg, Mastercard, Visa, Amex의 연구와 합성 거래 연구(PaySim, IBM AML)는 찾지 못했다.
- 법률: 판결문 논문 3편, TAB, 한국어 판결문 데이터셋 정도다.
- 연구실: Stanford, CMU, UW/AI2, Princeton, CISPA, Kakao, Samsung, Upstage, NTT, Baidu, ByteDance 등의 연구가 부족하다.
- 주제: 문맥적 무결성 벤치마크(ConfAIde, PrivacyLens), SDMetrics, SyntheRela, ENISA 가명처리 보고서가 빠져 있다.

**한국어·일본어·중국어:** PII 데이터셋은 대부분 임상·법률 분야이며 은행 데이터는 없다. 음성 익명화는 거의 영어와 중국어로만 평가된다.

## 텍스트 익명화와 LLM 개인정보 보호: 대학 연구실

29편. 관련성이 높은 순서.

- 판결문에 직접식별자와 준식별자를 표시하고 텍스트 익명화의 개인정보 보호·유용성 지표를 제공한다. | Maskara 자유 텍스트 보고서에 바로 쓸 벤치마크와 지표.  
  2022 · Univ. of Oslo / Norwegian Computing Center (Pilán, Lison, Øvrelid) + Rovira i Virgili (Sánchez, Batet) · [The Text Anonymization Benchmark (TAB): A Dedicated Corpus and Evaluation Framework for Text Anonymization](https://arxiv.org/abs/2202.00443)

- 개인 속성을 추측하는 LLM 공격자의 안내에 따라 여러 차례 글을 고쳐 NER 기반 익명화보다 좋은 성능을 낸다. | 로컬 LLM 익명화 설계와 보고서에 추가할 적대적 검사.  
  2024 · ETH Zurich SRI Lab (Staab, Vero, Balunović, Vechev) · [Large Language Models are Advanced Anonymizers](https://arxiv.org/abs/2402.13846)

- 표준 익명화 후에도 LLM은 무해해 보이는 글에서 위치·나이·소득 등을 추론한다. | 이름 대체만으로는 추론 가능한 속성이 남으므로 검사해야 한다.  
  2023 · ETH Zurich SRI Lab (Staab, Vero, Balunović, Vechev) · [Beyond Memorization: Violating Privacy Via Inference with Large Language Models](https://arxiv.org/abs/2310.07298)

- 재식별 연구 그룹의 새 텍스트 익명화 벤치마크. 세부 내용은 제목과 초록 검색 결과 이상으로 확인하지 않았다. | Maskara 텍스트 파이프라인을 평가할 최신 벤치마크.  
  2026 · Imperial College London (de Montjoye, Krčo, Meeus) · [RAT-Bench: A Comprehensive Benchmark for Text Anonymization](https://arxiv.org/abs/2602.12806)

- 민감 구간을 사실에 부합하는 일반화 표현으로 바꾸며 LLM 재식별 공격을 모사해 표현을 고른다. | 합성 정보 대체의 대안이자 공격 기반 대체값 선택 방식.  
  2024 · Norwegian Computing Center / Oslo (Pilán, Lison) + Rovira i Virgili (Sánchez, Manzanares-Salor) · [Truthful Text Sanitization Guided by Inference Attacks](https://arxiv.org/abs/2412.12928)

- PII 탐지와 위험 지표(LM 확률, 웹 검색, 분류기)를 결합해 마스킹 구간을 결정한다. | 보고서의 잔존 PII 항목에 쓸 구간별 위험 점수.  
  2023 · Univ. of Oslo / Norwegian Computing Center (Papadopoulou, Lison, Øvrelid, Pilán) · [Neural Text Sanitization with Privacy Risk Indicators: An Empirical Analysis](https://arxiv.org/abs/2310.14312)

- 검색과 정보 연결로 사람을 재식별하는 에이전트 공격자를 상대로 LLM 익명화를 평가한다(제목에서 추정). | 연결 공격 모듈에서 도구 사용 에이전트를 고려해야 한다.  
  2026 · Northeastern Univ. (Tianshi Li) · [LLM Anonymization Against Agentic Re-Identification](https://arxiv.org/abs/2605.30848)

- 임상 텍스트를 가명처리하고 문서별 재식별 위험도 평가하는 도구. | 병원용 가명처리와 위험 보고서를 결합한 유사 사례.  
  2024 · Univ. of Manchester (Han, Nenadic) + Leiden (Verberne) · [DeIDClinic: A Risk-Aware Pseudonymization Framework for Clinical Text De-identification and Re-identification Risk Assessment](https://arxiv.org/abs/2410.01648)

- 규칙과 신경망 NER를 결합한 가명처리를 파리 병원 데이터 웨어하우스에 배포하고 검증했다. | 우리와 유사한 규칙+NER 설계의 실제 병원 배포 사례.  
  2023 · Sorbonne Univ. / AP-HP (Tannier) · [Development and validation of a natural language processing algorithm to pseudonymize documents in the context of a clinical data warehouse](https://arxiv.org/abs/2303.13451)

- 탐지한 PHI를 마르코프 체인의 사실적인 대체값으로 바꿔 누락 PHI가 섞여 보이게 한다(HIPS). | 삭제보다 합성 대체값을 쓰는 근거이며 일관성 설계에 참고.  
  2022 · Univ. of Alabama at Birmingham (Osborne, Kennedy) · [BRATsynthetic: Text De-identification using a Markov Chain Replacement Strategy for Surrogate Personal Identifying Information](https://arxiv.org/abs/2210.16125)

- 추출·복원·추론 공격으로 정제나 DP 학습 후에도 언어 모델에서 PII가 유출됨을 보인다. | 미세조정 전에 학습 데이터를 정제해야 하는 이유.  
  2023 · Univ. of Waterloo (Lukas) + Microsoft Research · [Analyzing Leakage of Personally Identifiable Information in Language Models](https://arxiv.org/abs/2302.00539)

- GPT-2 질의로 이름·전화·이메일을 포함한 학습 텍스트를 그대로 복원한다. | 남은 원본이 학습된 모델에 들어간다는 핵심 동기.  
  2020 · Google + Stanford, UC Berkeley, Northeastern et al. (Carlini, Tramèr, Wallace) · [Extracting Training Data from Large Language Models](https://arxiv.org/abs/2012.07805)

- 정제된 출력에서 복원 공격으로 원본 비공개 텍스트를 복구한다. 기존 도구의 유출은 주장보다 크다. | 개인정보 보호 보고서에 복원 공격을 추가해야 한다.  
  2024 · USTC (Kejiang Chen et al.) · [On the Vulnerability of Text Sanitization](https://arxiv.org/abs/2410.17052)

- LLM이 단어 단위 DP로 정제된 텍스트에서 원본을 복원한다. | 단어 단위 DP 잡음은 약한 비교 기준일 수 있다는 경고.  
  2024 · Nanjing Univ. of Sci. & Tech. / CSIRO Data61 (Pang, Xue) (소속 미확인) · [Reconstruction of Differentially Private Text Sanitization via Large Language Models](https://arxiv.org/abs/2410.12443)

- 공격자 피드백을 받아 강화학습한 소형 LLM이 사용자 글을 익명화하며 로컬 실행이 가능하다. | 소형 로컬 익명화 모델은 망분리 배포에 적합하다.  
  2025 · Tsinghua Univ. (Yong Li, Fengli Xu) · [AgentStealth: Reinforcing Large Language Model for Anonymizing User-generated Text](https://arxiv.org/abs/2506.22508)

- 필요한 부분만 수정하는 로컬 적대적 LLM 익명화(제목에서 추정). | 비용이 낮은 로컬 LLM 적대적 익명화 반복 과정.  
  2025 · Duan, Zhang et al. (소속 미확인) · [Look Twice before You Leap: A Rational Framework for Localized Adversarial Anonymization](https://arxiv.org/abs/2512.06713)

- 학습 없이 LLM 재작성 후보를 트리 탐색해 개인정보 보호와 의미 보존을 절충한다(제목에서 추정). | 자유 텍스트 재작성의 유용성·개인정보 보호 프리셋 조정.  
  2025 · Monash Univ. (Haffari, Qu, Yuan) · [Zero-Shot Privacy-Aware Text Rewriting via Iterative Tree Search](https://arxiv.org/abs/2509.20838)

- 임상 텍스트 익명화용 LLM과 평가 지표를 비교한다. | LLM 기반 임상 비식별화 평가 설계에 참고.  
  2024 · Fraunhofer Portugal AICOS (Rolla et al.) · [Unlocking the Potential of Large Language Models for Clinical Text Anonymization: A Comparative Study](https://arxiv.org/abs/2406.00062)

- 민감 토큰을 유사 단어로 바꾸는 단어 단위 로컬 DP이며 학습 유용성을 유지한다. | 가상 인물 대체와 비교할 DP 기준 모델.  
  2021 · CUHK (Sherman Chow) + collaborators (Yue, Du, Wang) · [Differential Privacy for Text Analytics via Natural Text Sanitization (SanText)](https://arxiv.org/abs/2106.01221)

- 토큰별 출력 집합을 맞춤 구성하는 DP 단어 대체로 SanText보다 유용성이 높다. | 프리셋의 유용성 보존 대체 방식에 참고.  
  2022 · East China Normal Univ. (Cen Chen) et al. · [A Customized Text Sanitization Mechanism with Differential Privacy (CusText)](https://arxiv.org/abs/2207.01193)

- BART 오토인코더와 가지치기·잡음으로 문서 전체를 로컬 DP 하에 재작성한다. | ‘최대 개인정보 보호’ 프리셋의 형식적 보장 옵션.  
  2023 · TU Darmstadt (Habernal) · [DP-BART for Privatized Text Rewriting under Local Differential Privacy](https://arxiv.org/abs/2302.07636)

- 정해진 샘플링 온도로 문서를 바꾸어 써 로컬 DP를 얻고 저자를 숨긴다. | 선택적 텍스트 보호 단계로 로컬 LLM 바꿔쓰기 활용.  
  2023 · Cohere For AI (Hooker) / IBM Research (Pin-Yu Chen) · [Locally Differentially Private Document Generation Using Zero Shot Prompting (DP-Prompt)](https://arxiv.org/abs/2310.16111)

- DP-Prompt와 비DP LLM 재작성을 비교하며 텍스트에서 DP 보장의 의미를 비판적으로 검토한다. | DP 보호 주장의 강도를 조정할 근거.  
  2024 · TU Munich (Meisenbacher, Matthes) · [Thinking Outside of the Differential Privacy Box: A Case Study in Text Privatization with Language Model Prompting](https://arxiv.org/abs/2410.00751)

- 클라우드 LLM 전송 전 프롬프트에 DP 교란을 적용하고 로컬 모델로 답을 재구성한다. | 정제된 글을 외부 LLM에 보내는 설계에 참고.  
  2023 · USTC (Kejiang Chen, Jie Zhang) · [InferDPT: Privacy-Preserving Inference for Closed-box Large Language Model](https://arxiv.org/abs/2310.12214)

- 소형 로컬 모델이 정제 후 LLM 출력의 유용성 손실을 전송 전에 예측한다(제목에서 추정). | 실행 전 프리셋별 유용성 손실 예측.  
  2024 · Macquarie Univ. (Kaafar) · [Preempting Text Sanitization Utility in Resource-Constrained Privacy-Preserving LLM Interactions](https://arxiv.org/abs/2411.11521)

- 비공개 내용과 작업 내용을 분리해 협업 에이전트 간 전달 텍스트를 정제한다(제목에서 추정). | 향후 다중 에이전트 파이프라인의 PII 흐름에 관련.  
  2026 · Rice / Xia Hu group et al. (소속 미확인) · [Privacy-Preserving Text Sanitization for Distributed Agents Collaboration via Disentangled Representations](https://arxiv.org/abs/2606.15335)

- 문서 VQA 모델은 이미지에서 가린 PII도 학습 문서에서 암기해 출력한다. | PDF 확장에서도 문서 이미지 정제가 중요하다.  
  2024 · Oxford (Torr) + ETH Zurich (Tramèr) + Google · [Extracting Training Data from Document-Based VQA Models](https://arxiv.org/abs/2407.08707)

- 확산 언어 모델이 빈칸 채우기 질의로 학습 데이터를 유출한다(제목에서 추정). | 새로운 언어 모델 구조에도 유출 위험이 존재한다.  
  2026 · Univ. of Waterloo (Asokan) · [Extracting Training Data from Diffusion Language Models via Infilling](https://arxiv.org/abs/2605.24173)

- 원격 LLM 전송 전 식별정보를 일관된 가명으로 바꾸고 응답에서 복원한다. | Maskara 방식을 채팅에 적용한 가장 가까운 선행 연구.  
  2025 · (범위 밖; 아시아 연구실 조사에서 발견) · [Semantically-Aware LLM Agent to Enhance Privacy in Conversational AI Services (LOPSIDED)](https://arxiv.org/abs/2510.27016)


## 임상·금융·법률 비식별화

78편. 관련성이 높은 순서.

- PHI를 사실적인 가짜 값으로 바꿔 도구가 놓친 식별정보가 섞이고 독자가 알아채지 못하게 한다. | 삭제 대신 가상 인물 정보를 넣어야 한다는 핵심 근거.  
  2013 · Kaiser Permanente WA (Carrell) · [Hiding in plain sight: use of realistic surrogates to reduce exposure of protected health information in clinical text](https://pubmed.ncbi.nlm.nih.gov/22771529)

- 일관된 대체·무작위 대체·마르코프 대체를 비교한다. PHI 누락 시 마르코프 방식이 보호와 유용성의 균형이 좋다. | ‘한 사람 = 하나의 가상 인물’ 절충을 직접 평가한다.  
  2025 · UAB (Osborne) · [A Markov Chain Replacement Strategy for Surrogate Identifiers: Minimizing Re-Identification Risk While Preserving Text Reuse](https://pubmed.ncbi.nlm.nih.gov/41122293)

- HIPS 텍스트의 잔존 실제 PHI와 대체값을 구분하는 ML 공격. | 가상 인물로 대체한 텍스트의 위협 모델. 연결 공격 보고서에 추가.  
  2019 · Kaiser Permanente WA (Carrell) · [The machine giveth and the machine taketh away: a parrot attack on clinical text deidentified with hiding in plain sight](https://pubmed.ncbi.nlm.nih.gov/31390016)

- 사람 공격자는 사실적인 대체값 사이에서 실제 유출 식별정보를 찾기 어렵다. | 대체값이 잔존 원본의 위험을 줄인다는 근거.  
  2020 · Kaiser Permanente WA (Carrell) · [Resilience of clinical text de-identified with "hiding in plain sight" to hostile reidentification attacks by human readers](https://pubmed.ncbi.nlm.nih.gov/32930712)

- Transformer PHI 탐지기와 규칙 기반 사실적 대체값 삽입을 결합한다. Hugging Face에 모델을 공개했다. | Maskara와 같은 혼합 설계(NER+규칙+대체값).  
  2023 · Stanford AIMI (Chambon, Langlotz) · [Automated deidentification of radiology reports combining transformer and "hide in plain sight" rule-based methods](https://pubmed.ncbi.nlm.nih.gov/36416419)

- 대체값을 넣은 글로 비식별화 모델을 학습·평가하면 정확도가 달라진다. 재합성이 탐지에 미치는 영향을 분석한다. | 가상 인물 텍스트가 후속 NER와 탐지 동작을 바꿀 수 있다.  
  2010 · Vanderbilt/MITRE (Yeniterzi, Malin) · [Effects of personal identifier resynthesis on clinical text de-identification](https://pubmed.ncbi.nlm.nih.gov/20190058)

- 환자별 무작위 날짜 이동 후 데이터셋 경계를 자르는 ‘Shift and Truncate’로 날짜 유출 한계를 증명한다. | Maskara 개인별 날짜 이동의 이론적 기반.  
  2016 · Columbia (Hripcsak) · [Preserving temporal relations in clinical data while maintaining privacy](https://pubmed.ncbi.nlm.nih.gov/27013522)

- 요일과 공휴일 패턴으로 공격자가 실제 이동값을 복구한다. | 요일을 유지하거나 이 공격에 대해 날짜 이동을 감사해야 한다.  
  2026 · UTHealth Houston (Kudlicki) · [Leveraging routine scheduling patterns to unshift Date-Shifted clinical data](https://pubmed.ncbi.nlm.nih.gov/42863778)

- 계절·요일·일회성 사건으로 실제 데이터의 날짜 이동 여부를 알아낸다. | 보고서에 날짜 이동 탐지 가능성 검사 추가.  
  2023 · TriNetX (Evans) · [The Detection of Date Shifting in Real-World Data](https://pubmed.ncbi.nlm.nih.gov/37459888)

- LLM으로 날짜를 추출하고 대체 날짜를 생성한다. 형식은 유지하지만 생성 오류가 남는다. | Maskara처럼 로컬 LLM의 대체 날짜 검증이 필요하다.  
  2026 · UT Houston (Wang) · [Leveraging Large Language Models for Temporal PHI De-identification in Real-World Clinical Notes](https://pubmed.ncbi.nlm.nih.gov/42818405)

- PHI 대체 및 날짜 정규화를 적용한 병리 보고서 공동 과제. 참가 팀 77%가 LLM을 사용했다. | 비식별화와 날짜 처리를 함께 평가할 벤치마크.  
  2025 · NKUST Taiwan (Dai) · [Leveraging large language models for the deidentification and temporal normalization of sensitive health information in electronic health records](https://pubmed.ncbi.nlm.nih.gov/40804132)

- LLM이 비식별화 기록의 환자를 재식별하도록 해 비식별화 품질을 측정한다. | 보고서의 LLM 기반 연결 공격 설계에 참고.  
  2025 · Cornell Tech (Morris) · [DIRI: Adversarial Patient Reidentification with Large Language Models for Evaluating Clinical Text Anonymization](https://pubmed.ncbi.nlm.nih.gov/40502277)

- 담당 임상의가 비식별화 후에도 자기 환자를 알아보는지 시험한다. | 임상 내용만으로도 재식별이 가능함을 보인다.  
  2014 · Kaiser Permanente WA / Utah (Meystre) · [Can physicians recognize their own patients in de-identified notes?](https://pubmed.ncbi.nlm.nih.gov/25160293)

- 비식별화된 자유 텍스트의 잔존 재식별 위험 추정 방법을 검토한다. | Maskara 보고서의 위험 평가 점검 항목.  
  2025 · Brighton & Sussex Med School (Ford) · [What is the patient re-identification risk from using de-identified clinical free text data for health research?](https://pubmed.ncbi.nlm.nih.gov/40978336)

- 가명처리는 후속 NER에 영향이 작지만 문장 삭제는 성능을 크게 떨어뜨린다. | 가상 인물 대체가 삭제보다 ML 유용성을 잘 보존한다는 근거.  
  2020 · Stockholm Univ (Berg, Henriksson, Dalianis) · [The Impact of De-identification on Downstream Named Entity Recognition in Clinical Text](https://aclanthology.org/2020.louhi-1.1)

- 대체값을 넣은 임상 텍스트로 BERT를 사전학습해도 6개 작업에서 원본과 비슷한 성능을 낸다. | 가상 인물 대체 데이터로 AI를 학습할 때의 유용성을 강하게 뒷받침한다.  
  2022 · Stockholm Univ (Vakili, Dalianis) · [Downstream Task Performance of BERT Models Pre-Trained Using Automatically De-Identified Clinical Data](https://aclanthology.org/2022.lrec-1.451)

- 사전학습과 미세조정 데이터를 모두 가명처리해도 정확도 손실이 거의 없다. | ‘AI 학습용 데이터’라는 제안의 직접적인 근거.  
  2024 · Stockholm Univ (Vakili) · [End-to-end pseudonymization of fine-tuned clinical BERT models: Privacy preservation with maintained data utility](https://pubmed.ncbi.nlm.nih.gov/38915012)

- CRF와 규칙으로 PHI를 제거·마스킹하거나 대체값으로 바꾸는 스웨덴 도구. | Maskara 프리셋과 같은 마스킹·대체 선택지를 제공한다.  
  2021 · Stockholm Univ (Berg, Dalianis) · [HB Deid - HB De-identification tool demonstrator](https://aclanthology.org/2021.nodalida-main.54)

- 독일어 PHI를 유형이 맞는 가짜 값으로 대체하며 문법·개연성 오류는 1% 미만이다. | Maskara 형식 유효성 검사와 유사한 대체값 품질 측정.  
  2021 · Jena JULIE Lab (Lohr, Hahn) · [Pseudonymization of PHI Items in German Clinical Reports](https://pubmed.ncbi.nlm.nih.gov/34042748)

- Stanford 학습 데이터를 확대해 Stanford·Penn 보고서에서 클라우드 업체 비식별화 서비스를 능가했다. | 온프레미스 모델의 경쟁력이 망분리 제품 주장을 뒷받침한다.  
  2025 · Stanford AIMI (Prakash, Langlotz) · [Improving the Performance of Radiology Report De-identification with Large-Scale Training and Benchmarking Against Cloud Vendor Methods](https://arxiv.org/abs/2511.04079)

- 재현율을 우선한 규칙·통계 PHI 필터로 완전히 온프레미스에서 실행된다. | Maskara와 유사한 재현율 우선·온프레미스 설계.  
  2020 · UCSF (Norgeot) · [Protected Health Information filter (Philter): accurately and securely de-identifying free-text clinical notes](https://pubmed.ncbi.nlm.nih.gov/32337372)

- Philter 기반으로 UCSF 전체 기록을 비식별화하며 HIPAA 인증과 정기 갱신을 적용한다. | 병원 규모의 운영·인증 모델.  
  2023 · UCSF (Radhakrishnan) · [A certified de-identification system for all clinical text documents for information extraction at scale](https://pubmed.ncbi.nlm.nih.gov/37416449)

- MIMIC에 사용된 어휘·정규식 기반 PhysioNet ‘deid’ 도구이며 사실적인 대체값을 사용한다. | Maskara 정규식처럼 대체값을 쓰는 고전적 규칙 기준 모델.  
  2008 · MIT LCP (Neamatullah) · [Automated de-identification of free-text medical records](https://pubmed.ncbi.nlm.nih.gov/18652655)

- 최상위 성능의 BERT PHI 태거이며 PhysioNet에 코드를 공개했다. | GLiNER2와 비교할 공개 기준 모델.  
  2020 · MIT LCP (Johnson, Bulgarelli, Pollard) · [Deidentification of free-text medical records using pre-trained bidirectional transformers](https://doi.org/10.1145/3368555.3384455)

- i2b2·MIMIC에서 규칙과 CRF보다 뛰어난 양방향 LSTM PHI 태거. | 신경망 탐지 기준 모델.  
  2017 · MIT (Dernoncourt) · [De-identification of patient notes with recurrent neural networks](https://pubmed.ncbi.nlm.nih.gov/28040687)

- 네덜란드어 기록에 조회 목록·규칙·퍼지 매칭을 적용한다. 이름 재현율 0.96이며 Python 패키지다. | Maskara 규칙과 비교할 비영어권 규칙 기반 탐지기.  
  2018 · UMC Utrecht (Menger, Spruit) · [DEDUCE: A pattern matching method for automatic de-identification of Dutch medical text](https://researchinformation.umcutrecht.nl/en/publications/deduce-a-pattern-matching-method-for-automatic-de-identification-)

- 대체값을 넣은 퇴원 요약문을 사용하는 2006 i2b2 공동 과제. | 표준 벤치마크 말뭉치.  
  2007 · i2b2 (Uzuner) · [Evaluating the state-of-the-art in automatic de-identification](https://pubmed.ncbi.nlm.nih.gov/17600094)

- 환자별 여러 기록에 걸친 종단적 비식별화 과제. | 환자의 여러 문서 간 일관성을 시험한다.  
  2015 · i2b2/UTHealth (Stubbs, Uzuner) · [Automated systems for the de-identification of longitudinal clinical narratives: Overview of 2014 i2b2/UTHealth shared task Track 1](https://pubmed.ncbi.nlm.nih.gov/26225918)

- 환자 기록 전반의 주석과 일관된 대체값 생성 방법을 설명한다. | 기록 간 일관된 대체값 생성 방법에 참고.  
  2015 · i2b2/UTHealth (Stubbs, Uzuner) · [Annotating longitudinal clinical narratives for de-identification: The 2014 i2b2/UTHealth corpus](https://pubmed.ncbi.nlm.nih.gov/26319540)

- PHI 밀도가 높은 정신과 기록의 비식별화로 모델의 도메인 전이가 실패함을 보인다. | 탐지의 도메인 변화에 대한 경고.  
  2017 · CEGS N-GRID (Stubbs) · [De-identification of psychiatric intake records: Overview of 2016 CEGS N-GRID shared tasks Track 1](https://pubmed.ncbi.nlm.nih.gov/28614702)

- 라벨이 다른 여러 말뭉치에서 비식별화 도구 6개를 비교하는 공개 프레임워크. | Maskara 탐지 벤치마크에 재사용할 평가 도구.  
  2024 · MUSC (Heider) · [An Extensible Evaluation Framework Applied to Clinical Text Deidentification NLP Tools: Multisystem and Multicorpus Study](https://pubmed.ncbi.nlm.nih.gov/38805692)

- 규칙·Transformer·대체값 생성을 결합하며 OpenDeID 말뭉치를 공개한다. | 유사한 구조와 추가 평가 말뭉치.  
  2023 · UNSW (Liu) · [OpenDeID Pipeline for Unstructured EHR Text Notes Based on Rules and Transformers](https://pubmed.ncbi.nlm.nih.gov/38055317)

- 대체값 옵션이 있는 빠르고 설정 가능한 Python 규칙 기반 비식별화 도구. | 직접적인 Python 경쟁·비교 대상.  
  2025 · Unity Health Toronto (Sundrelingam) · [pyDeid: an improved, fast, flexible, and generalizable rule-based approach for deidentification of free-text medical records](https://pubmed.ncbi.nlm.nih.gov/39845288)

- VA 기록에서 높은 재현율을 내도록 조정한 규칙+ML 혼합 시스템. | 혼합 탐지 설계에 참고.  
  2013 · Utah/VA (Ferrández) · [BoB, a best-of-breed automated text de-identification system for VHA clinical documents](https://pubmed.ncbi.nlm.nih.gov/22947391)

- 대체값 교체 기능이 있는 학습 가능한 비식별화 도구 MIST. | 대체값을 생성하는 초기 도구.  
  2010 · MITRE (Aberdeen) · [The MITRE Identification Scrubber Toolkit: design, training, and assessment](https://pubmed.ncbi.nlm.nih.gov/20951082)

- 비식별화 방법과 평가에 대한 기초 문헌 검토. | 배경과 용어 정리.  
  2010 · Utah (Meystre) · [Automatic de-identification of textual documents in the electronic health record: a review of recent research](https://pubmed.ncbi.nlm.nih.gov/20678228)

- 임상 텍스트 비식별화 방법에 대한 최신 체계적 문헌 검토. | 경쟁 방법의 전체 구도.  
  2024 · Novi Sad/Manchester (Kovačević) · [De-identification of clinical free text using natural language processing: A systematic review of current approaches](https://pubmed.ncbi.nlm.nih.gov/38555848)

- n2c2 비식별화 데이터셋의 발표 성능을 정리한다. | Maskara 탐지 점수의 비교 위치를 정하는 데 참고.  
  2022 · Norwegian Centre for E-health (Chomutare) · [Clinical Notes De-Identification: Scoping Recent Benchmarks for n2c2 Datasets](https://pubmed.ncbi.nlm.nih.gov/35062150)

- 5개 데이터셋과 여러 국가에서 LLM·규칙·혼합 비식별화를 비교한다. | 로컬 LLM 선택의 근거.  
  2026 · CGD Health (Panchal) · [Benchmarking large language models for de-identification of electronic health record notes](https://pubmed.ncbi.nlm.nih.gov/42481207)

- GPT-4 제로샷 프롬프트로 의미를 유지하면서 PHI를 제거한다. | LLM 기반 탐지의 비교 기준.  
  2023 · UGA/MGH (Liu, Li) · [DeID-GPT: Zero-shot Medical Text De-Identification by GPT-4](https://arxiv.org/abs/2303.11032)

- GPT-4 제로샷 비식별화는 정밀도가 높지만 재현율은 약 0.83이다. 합성 데이터도 생성한다. | LLM 재현율의 한계가 혼합 설계의 필요성을 뒷받침한다.  
  2025 · King Hussein Cancer Center (Altalla') · [Evaluating GPT models for clinical note de-identification](https://pubmed.ncbi.nlm.nih.gov/39890969)

- 중간 크기 로컬 LLM으로 실제 운영 환경의 응급실 기록을 안정적으로 비식별화한다. | 망분리 로컬 LLM 접근법을 뒷받침한다.  
  2025 · Bordeaux Univ Hospital (Dorémus) · [Harnessing Moderate-Sized Language Models for Reliable Patient Data Deidentification in Emergency Department Records](https://pubmed.ncbi.nlm.nih.gov/40605780)

- 임상의가 주석한 영국 기록 3,650건에서 Azure·AnonCAT·GPT-4를 비교한다. | 현실적인 영국 병원 벤치마크.  
  2025 · Oxford (Kuo) · [Benchmarking transformer-based models for medical record de-identification in a single center multi-specialty evaluation](https://pubmed.ncbi.nlm.nih.gov/41438050)

- 7개 언어·28종 PHI를 포함하는 합성 기록 6,034건. | GLiNER2 다국어 평가 데이터.  
  2026 · Microsoft (Surana) · [MDeID: A dataset for multilingual medical de-identification](https://pubmed.ncbi.nlm.nih.gov/42914068)

- LLM 생성 학습 기록은 실제 기록과 분포가 다르며 그 차이로 비식별화 정확도 저하를 예측할 수 있다. | 합성 텍스트로 탐지기를 학습할 때 주의가 필요하다.  
  2026 · IDSIA (Cornelius) · [Measuring the gap: correlating synthetic-to-real drift with PHI de-identification performance](https://pubmed.ncbi.nlm.nih.gov/42063194)

- 적대적 합성 PHI 질의로 비식별화와 처리 후 검색 유용성을 평가한다. | 잔존 원본 검사에 쓸 적대적 사례.  
  2026 · UTMB (Weatherhead) · [ASQ-PHI: An adversarial synthetic data benchmark for clinical de-identification and search utility](https://pubmed.ncbi.nlm.nih.gov/41737797)

- 프롬프트 설계의 영향이 가장 크며 로컬 GPT-OSS가 F1 0.90을 달성한다. | 독일어에서도 공개 가중치 LLM이 작동하므로 온프레미스에 적합하다.  
  2026 · TU Dresden (Teschner) · [Evaluating Prompt Strategies for LLM-Based De-Identification of German Discharge Letters: A Feasibility Study Using GraSCCo](https://pubmed.ncbi.nlm.nih.gov/42393951)

- 독일 병원 문서용 Transformer 파이프라인. | 독일 시장의 탐지 참고 연구.  
  2025 · Essen IKIM (Arzideh) · [A Transformer-Based Pipeline for German Clinical Document De-Identification](https://pubmed.ncbi.nlm.nih.gov/39778706)

- 독일어 임상 PHI 주석 체계. | 독일어 데이터 라벨 집합.  
  2019 · Jena (Kolditz) · [Annotating German Clinical Documents for De-Identification](https://pubmed.ncbi.nlm.nih.gov/31437914)

- 스페인어 임상 비식별화에서 인코더 모델과 LLM을 비교한다. | 스페인어 시장의 탐지 참고 연구.  
  2026 · Spain (Vallejo-Sanchez) · [Towards reliable Spanish clinical text de-identification through comparative evaluation of language model approaches](https://pubmed.ncbi.nlm.nih.gov/42458625)

- 공개 일반 도메인 데이터로 스웨덴어 비식별화 모델을 학습한다. | 비공개 학습 데이터 없이 탐지기를 구축하는 방법.  
  2020 · Norway (Chomutare) · [De-Identifying Swedish EHR Text Using Public Resources in the General Domain](https://pubmed.ncbi.nlm.nih.gov/32570364)

- 정규식으로 BERT 비식별화 모델의 학습 데이터를 자동 라벨링한다. | Maskara 자체 정규식으로 GLiNER2 미세조정 시작 가능.  
  2025 · Korea (An) · [De-identification of clinical notes with pseudo-labeling using regular expression rules and pre-trained BERT](https://pubmed.ncbi.nlm.nih.gov/39962485)

- 한국어 기록의 딥러닝 PHI 탐지. | 한국 시장 참고 연구.  
  2024 · Korea (Chang) · [A De-Identification Model for Korean Clinical Notes: Using Deep Learning Models](https://pubmed.ncbi.nlm.nih.gov/38269694)

- 한국어·영어 혼합 기록의 비식별화. | 혼합 언어 텍스트 처리.  
  2015 · Asan Medical Center (Shin) · [A De-identification method for bilingual clinical texts of various note types](https://pubmed.ncbi.nlm.nih.gov/25552878)

- 일본어 의료 비식별화용 LLM을 비교한다. | 일본 시장 참고 연구.  
  2025 · Japan (Yagahara) · [Comparing the Accuracy of Deidentification in Japanese Text Using Large Language Models](https://pubmed.ncbi.nlm.nih.gov/40776161)

- 하나의 비식별화 시스템이 여러 데이터셋에서 성능을 유지하는지 평가한다. | 데이터셋 간 강건성 평가.  
  2014 · CSIRO (Zuccon) · [De-identification of health records using Anonym: effectiveness and robustness across datasets](https://pubmed.ncbi.nlm.nih.gov/24791676)

- 기성 비식별화 도구는 호주 일반의 진료 기록에서 정확도가 떨어진다. | 지역 형식 때문에 범용 도구가 실패하므로 국가별 ID 규칙이 필요하다.  
  2023 · Univ Melbourne (El-Hayek) · [An evaluation of existing text de-identification tools for use with patient progress notes from Australian general practice](https://pubmed.ncbi.nlm.nih.gov/36870249)

- 성공한 공격 대부분은 제대로 비식별화되지 않은 데이터를 겨냥했다. | Maskara 연결 공격 평가의 근거.  
  2011 · CHEO/Ottawa (El Emam) · [A systematic review of re-identification attacks on health data](https://pubmed.ncbi.nlm.nih.gov/22164229)

- 공격자의 자원을 고려해 검사·언론인·마케터 유형의 위험을 결합한다. | 최악의 경우만 보는 k-익명성보다 나은 위험 평가.  
  2021 · Vanderbilt (Xia, Malin) · [Enabling realistic health data re-identification risk assessment through adversarial modeling](https://pubmed.ncbi.nlm.nih.gov/33448306)

- 공격자 유형·동기·피해를 목록화한다. | 보고서 프리셋에 쓸 위협 모델 목록.  
  2024 · Berlin Institute of Health (Meurers) · [Health Data Re-Identification: Assessing Adversaries and Potential Harms](https://pubmed.ncbi.nlm.nih.gov/39176596)

- 테이블 재식별 요인과 Five Safes 완화 방안을 다룬다. | EU 고객용 테이블 위험 설명에 참고.  
  2024 · IAB Germany (Drechsler) · [[Re-identification potential of structured health data]](https://pubmed.ncbi.nlm.nih.gov/38231225)

- 연구 시스템 간 환자 ID를 연결하는 키 기반의 복원 가능한 가명 서비스. | 키 기반 해시 저장소와 테이블 간 조인의 선행 연구.  
  2013 · Oslo (Aamot) · [Pseudonymization of patient identifiers for translational research](https://pubmed.ncbi.nlm.nih.gov/23883409)

- 합성 레코드로 학습 데이터 포함 여부를 추론하는 개선된 공격. | 합성·가상 인물 데이터에 추가할 공격.  
  2022 · Vanderbilt (Zhang) · [Membership inference attacks against synthetic health data](https://pubmed.ncbi.nlm.nih.gov/34920126)

- 전문가 합의: 유사도 지표 대신 멤버십과 속성 노출을 측정해야 한다. | 보고할 개인정보 보호 지표 선택에 참고.  
  2025 · Ottawa (Pilgram, El Emam) · [A consensus privacy metrics framework for synthetic data](https://pubmed.ncbi.nlm.nih.gov/41142908)

- 실제 환자당 합성 레코드 하나를 만드는 ‘Avatar’를 CT-GAN·Synthpop과 비교한다. | 개인당 가상 인물 설계와 유사한 EU 경쟁 도구.  
  2023 · Octopize (Guillaudeux) · [Patient-centric synthetic data generation, no reason to risk re-identification in biomedical data analysis](https://pubmed.ncbi.nlm.nih.gov/36899082)

- 환자의 평생 이력과 기록 전체를 합성하는 규칙 기반 시뮬레이터. | 사실적인 가상 인물 속성과 평가 데이터의 공급원.  
  2018 · MITRE (Walonoski) · [Synthea: An approach, method, and software mechanism for generating synthetic patients and the synthetic electronic health care record](https://pubmed.ncbi.nlm.nih.gov/29025144)

- Synthea 데이터는 실제 의료 품질 지표와 차이가 있다. | 완전 합성은 유용성을 잃지만 가상 인물 대체는 실제 신호를 보존한다.  
  2019 · Evolent Health (Chen) · [The validity of synthetic clinical data: a validation study of a leading synthetic data generator (Synthea) using clinical quality measures](https://pubmed.ncbi.nlm.nih.gov/30871520)

- 오토인코더+GAN으로 이산 EHR 코드를 생성하고 신원·속성 노출을 검사한다. | 합성 EHR 대안의 기준 모델.  
  2017 · Georgia Tech/Vanderbilt (Choi, Malin, Sun) · [Generating Multi-label Discrete Patient Records using Generative Adversarial Networks (medGAN)](https://arxiv.org/abs/1703.06490)

- 합성 EHR을 위한 개선된 medGAN 변형. | 합성 EHR 비교 대상.  
  2019 · Baowaly et al. · [Synthesizing electronic health records using improved generative adversarial networks](https://pubmed.ncbi.nlm.nih.gov/30535151)

- MIMIC으로 합성 EHR 방법 7개의 충실도·유용성·개인정보 보호·비용을 비교한다. | 보고서에 반영할 평가 차원.  
  2025 · Univ Michigan (Chen) · [Generating synthetic electronic health record data: a methodological scoping review with benchmarking on phenotype data and open-source software](https://pubmed.ncbi.nlm.nih.gov/40460023)

- 시간 순서가 있는 합성 EHR 평가 지표. | 변환 후 날짜 간격이 유지되는지 검사.  
  2024 · Leiden (Achterberg) · [On the evaluation of synthetic longitudinal electronic health records](https://pubmed.ncbi.nlm.nih.gov/39143466)

- 합성 금융 데이터의 목표·개인정보 보호 요구·함정을 정의한다. | 은행 구매 담당자와 공유할 용어.  
  2020 · J.P. Morgan AI Research (Assefa et al.) · [Generating Synthetic Data in Finance: Opportunities, Challenges and Pitfalls](https://papers.ssrn.com/abstract=3634235)

- 은행의 개인정보 보호·공정성·사기·자금세탁 방지(AML) 등 합성 데이터 활용을 조사한다. | Maskara가 겨냥하는 은행 활용 사례를 정리한다.  
  2024 · J.P. Morgan AI Research (Potluru et al.) · [Synthetic Data Applications in Finance](https://arxiv.org/abs/2401.00081)

- Faker 금융 문서로 학습한 spaCy NER와 규칙을 결합해 PII를 자리표시자로 바꾼다. | 금융 PII 기준 모델. Maskara는 자리표시자 대신 가상 인물을 쓴다.  
  2025 · Symbiosis Inst. Tech (Mishra) · [A hybrid rule-based NLP and machine learning approach for PII detection and anonymization in financial documents](https://doi.org/10.1038/s41598-025-04971-9)

- 텍스트 익명화가 NER를 넘어 명시적 노출 위험 측정으로 나아가야 한다고 주장한다. | 탐지 성능뿐 아니라 위험을 보고해야 한다는 근거.  
  2021 · Norwegian Computing Center (Lison) · [Anonymisation Models for Text Data: State of the Art, Challenges and Future Directions](https://aclanthology.org/2021.acl-long.323)

- LLM은 익명화된 Wikipedia 글은 잘 재식별하지만 스위스 판결문에서는 아직 성능이 낮다. | LLM 연결 공격 방법과 벤치마크.  
  2024 · BFH / Univ Bern (Nyffenegger, Niklaus) · [Anonymity at Risk? Assessing Re-Identification Capabilities of Large Language Models in Court Decisions](https://aclanthology.org/2024.findings-naacl.157)

- 학생들이 독일 판결문의 인물을 재식별했으며 이니셜 처리가 특히 취약했다. | 이니셜·부분 마스킹은 유출 위험이 있으며 가상 인물 대체로 이를 피한다.  
  2023 · FAU/CMU (Deuber, Christin) · [Assessing Anonymity Techniques Employed in German Court Decisions](https://www.usenix.net/system/files/usenixsecurity23-deuber.pdf)

- 독일 판결문의 민감 텍스트를 ML로 탐지하고 가명처리 학습 데이터를 만든다. | 법률 탐지용 가명처리 학습 데이터.  
  2021 · TU Munich sebis (Glaser, Matthes) · [Anonymization of German Legal Court Rulings](https://www.cs.cit.tum.de/sebis/publications/2021/gl21c)


## 합성 데이터, 재식별 위험, 형식적 익명화

61편. 관련성이 높은 순서.

- 섀도 모델 연결·추론 공격으로 합성 데이터도 유출과 유용성 손실을 피하지 못하며 기존 익명화보다 낫지 않음을 보인다. | 연결 공격 항목의 설계에 참고. ‘합성=안전’ 주장을 제한한다.  
  2022 · EPFL (Stadler, Oprisanu, Troncoso) · [Synthetic Data – Anonymisation Groundhog Day (USENIX Sec '22)](https://arxiv.org/abs/2011.07018)

- 생성기를 블랙박스로 보고 GDPR의 개별 대상 구별·연결 가능성·추론 위험을 공격 기반으로 평가한다. | 보고서에 바로 쓸 GDPR 부합 위험 지표.  
  2023 · Statice (Giomi et al.) · [A Unified Framework for Quantifying Privacy Risk in Synthetic Data (Anonymeter, PoPETs)](https://arxiv.org/abs/2211.10459)

- 합성 데이터 공개를 감사할 위협 모델과 공격(Groundhog 포함)을 제공하는 모듈형 도구. | Maskara 보고서에 외부 감사 도구로 연결할 수 있다.  
  2022 · Alan Turing Inst. / Imperial (Houssiau, Jordon et al.) · [TAPAS: a Toolbox for Adversarial Privacy Auditing of Synthetic Data](https://arxiv.org/abs/2211.06550)

- 코퓰라로 개인별 고유성을 예측한다. 표본 데이터에서도 인구통계 속성 15개로 미국인의 99.98%를 재식별한다. | 유지하는 준식별자의 레코드별 고유성 점수에 참고.  
  2019 · Imperial (Rocher, Hendrickx, de Montjoye) · [Estimating the success of re-identifications in incomplete datasets using generative models (Nat. Comms)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6650473)

- 공개 레코드마다 준식별자 기준으로 최소 k−1개의 다른 레코드와 구별되지 않아야 한다. | Maskara의 k-익명성 검사 기반.  
  2002 · Harvard/CMU (Sweeney) · [k-anonymity: a model for protecting privacy (IJUFKS)](https://dataprivacylab.org/projects/kanonymity/index3.html)

- k-익명성과 최소 일반화·억제를 정의해 필요한 정도 이상으로 데이터를 왜곡하지 않도록 한다. | 유용성·개인정보 보호 프리셋의 일반화 로직.  
  2001 · Milan (Samarati) · [Protecting Respondents' Identities in Microdata Release (IEEE TKDE)](https://samarati.di.unimi.it/k-anonymity.html)

- 우편번호·성별·생년월일로 미국 인구의 87%를 고유하게 구별할 수 있다고 추정한다. | 날짜 이동과 지역·나이 재설정이 필요한 이유.  
  2000 · CMU (Sweeney) · [Simple Demographics Often Identify People Uniquely](https://dataprivacylab.org/projects/identifiability/paper1.pdf)

- k-익명 집단의 민감값이 모두 같으면 유출되므로 값의 다양성을 요구한다. | 보고서의 k 값 옆에 ℓ-다양성 추가.  
  2006 · Cornell (Machanavajjhala, Gehrke, Kifer et al.) · [ℓ-Diversity: Privacy Beyond k-Anonymity (ICDE)](https://www.cs.rochester.edu/~muthuv/ldiversity.pdf)

- 각 집단의 민감값 분포가 전체 분포와 가까워야 한다. Earth Mover’s Distance로 측정한다. | 유지하는 열에 대한 더 강한 속성 노출 지표.  
  2007 · Purdue/AT&T (N. Li, T. Li, Venkatasubramanian) · [t-Closeness: Privacy Beyond k-Anonymity and ℓ-Diversity (ICDE)](https://www.cerias.purdue.edu/assets/pdf/bibtex_archive/2007-78.pdf)

- ‘술어 기반 개별 대상 구별’ 공격을 형식화한다. DP는 막지만 k-익명성은 막지 못한다. | 보고서가 보장하지 못하는 범위를 법적 관점에서 설명할 근거.  
  2020 · Harvard / BGU (Cohen, Nissim) · [Towards formalizing the GDPR's notion of singling out (PNAS)](https://arxiv.org/abs/1904.06009)

- IMDb를 보조 정보로 Netflix 평점을 재식별하며 잡음·오류에도 공격이 작동한다. | 은행 기록 같은 희소 거래 데이터에서는 단순 가명만으로 부족하다.  
  2008 · UT Austin (Narayanan, Shmatikov) · [Robust De-anonymization of Large Sparse Datasets (IEEE S&P)](https://arxiv.org/abs/cs/0610105)

- 110만 카드 소지자의 90%를 구매 4건으로 고유하게 구별한다. 데이터를 거칠게 해도 효과가 작다. | Maskara 은행 거래 테이블에 대한 직접적 경고.  
  2015 · MIT (de Montjoye, Radaelli, Singh, Pentland) · [Unique in the shopping mall: On the reidentifiability of credit card metadata (Science)](https://dspace.mit.edu/handle/1721.1/96321)

- 위치·시간 지점 4개로 150만 명 중 95%를 고유하게 식별한다. | 날짜 이동 후에도 사건 시각은 준식별자다.  
  2013 · MIT/UCLouvain (de Montjoye et al.) · [Unique in the Crowd: The privacy bounds of human mobility (Sci. Reports)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3607247)

- 형식 보존 암호화를 최초로 엄밀히 다룬다. rank-then-encipher, Feistel 구성, cycle-walking 증명을 제시한다. | 조인을 유지하는 ID 형식 보존 대체의 이론.  
  2009 · UC San Diego/UC Davis (Bellare, Ristenpart, Rogaway, Stegers) · [Format-Preserving Encryption (SAC)](https://eprint.iacr.org/2009/251)

- 데이터를 보지 않는 서비스가 연결 불가능한 가명으로 레코드를 저장하고 요청 시에만 연결한다. | 단일 키 기반 해시 저장소의 대안으로 연결 확산을 제한한다.  
  2019 · IBM Zurich (Lehmann) · [ScrambleDB: Oblivious (Chameleon) Pseudonymization-as-a-Service (PoPETs)](https://petsymposium.org/popets/2019/popets-2019-0048.php)

- HMAC 연결 키의 안전성에는 가정이 필요하다. 추가 보조 테이블로 실제 재식별 공격이 가능했다. | 키 기반 해시 저장소와 부가 출력의 위협 모델.  
  2017 · Melbourne (Culnane, Rubinstein, Teague) · [Vulnerabilities in the use of similarity tables in combination with pseudonymisation… ONS Privacy-Preserving Record Linkage](https://arxiv.org/abs/1712.00871)

- 최근접 원본 거리 검사를 통과해도 멤버십·속성·복원(ReconSyn) 공격은 성공한다. | 보고서에서 유사도 지표에만 의존해서는 안 된다.  
  2025 · Hazy/UCL (Ganev, De Cristofaro) · [The Inadequacy of Similarity-based Privacy Metrics: Privacy Attacks against "Truly Anonymous" Synthetic Datasets (IEEE S&P)](https://arxiv.org/abs/2312.05114)

- 유사도는 개별 대상 구별·연결 가능성·동기 있는 침입자 시험을 놓치므로 규정 준수를 입증하지 못한다. | 보고서의 ‘측정하지 못한 것’ 설명에 참고.  
  2024 · UCL/SAS (Ganev) · [Synthetic Data, Similarity-based Privacy Metrics, and Regulatory (Non-)Compliance](https://arxiv.org/abs/2407.16929)

- 최근접 원본 거리상 안전한 데이터도 멤버십 공격에 매우 취약하다. 멤버십 공격을 표준으로 권고한다. | 보고서에 최근접 거리 대신 멤버십 공격을 넣어야 한다는 근거.  
  2025 · Imperial/UCL (Yao, Krčo, Ganev, de Montjoye) · [The DCR Delusion: Measuring the Privacy Risk of Synthetic Data](https://arxiv.org/abs/2505.01524)

- 최근접 이웃 거리로 가장 위험한 레코드를 고른 후 공격하면 임의 선정 방식보다 효과적이다. | 연결 공격에서 집중 시험할 가상 인물·레코드 선정.  
  2023 · Imperial (Meeus, Guépin, Creţu, de Montjoye) · [Achilles' Heels: Vulnerable Record Identification in Synthetic Data Publishing](https://arxiv.org/abs/2306.10308)

- 공격자가 공개 합성 데이터만 가지고 있어도 멤버십 공격이 작동한다. | Maskara 출력에 대한 현실적인 공격자 모델.  
  2023 · Imperial (Guépin, Meeus, Creţu, de Montjoye) · [Synthetic is all you need: removing the auxiliary data assumption for membership inference attacks against synthetic data](https://arxiv.org/abs/2307.01701)

- 밀도비 공격으로 생성기의 국소 과적합을 찾는다. 희귀·소수 집단 레코드가 특히 취약하다. | 보고서에 쓸 저비용의 해석 가능한 멤버십 점수.  
  2023 · Cambridge (van Breugel, Sun, Qian, van der Schaar) · [Membership Inference Attacks against Synthetic Data through Overfitting Detection (DOMIAS, AISTATS)](https://arxiv.org/abs/2302.12580)

- 선형 복원으로 모든 레코드의 숨긴 속성을 추론한다. 합성 행이 많을수록 공격이 강해진다. | 유지하는 준식별자에 대한 속성 추론 검사.  
  2024 · UCL (Annamalai), Oxford (Gadotti, Rocher) · [A Linear Reconstruction Approach for Attribute Inference Attacks against Synthetic Data (USENIX Sec)](https://arxiv.org/abs/2301.10053)

- 최근접 거리·완전 일치·PII 재출력·모사 공격 등 경험적 지표와 표준 부재를 검토한다. | Maskara 보고서를 비교할 업체 평가 목록.  
  2025 · Gretel (Steier, Ramaswamy, Manoel, Haushalter) · [Synthetic Data Privacy Metrics](https://arxiv.org/abs/2501.03941)

- 합성 행과 학습 행 사이 거리, 합성 행과 홀드아웃 행 사이 거리를 비교한다. 비슷하면 암기가 없음을 시사한다. | 개인정보 보호 항목의 간단한 홀드아웃 비교 기준.  
  2021 · MOSTLY AI / WU Vienna (Platzer, Reutterer) · [Holdout-Based Empirical Assessment of Mixed-Type Synthetic Data (Frontiers in Big Data)](https://doi.org/10.3389/fdata.2021.679939)

- 분포 비교·임베딩 유사도·최근접 이웃 보호 검사를 결합한 홀드아웃 프레임워크. | 가상 인물 대체가 유용성을 보존하는지 보여줄 충실도 지표.  
  2025 · MOSTLY AI (Sidorenko, Platzer et al.) · [Benchmarking Synthetic Tabular Data: A Multi-Dimensional Evaluation Framework](https://arxiv.org/abs/2504.01908)

- 기존 지표를 비판하고 충실도·개인정보 보호·유용성 지표를 개선하며 12개 데이터셋에서 합성기 8종을 비교한다. | 실행 보고서의 최신 지표 설계에 참고.  
  2024 · Purdue (Du, N. Li) · [Systematic Assessment of Tabular Data Synthesis (CCS '25)](https://arxiv.org/abs/2402.06806)

- 멤버십 공격 13종 라이브러리. 고품질 합성 테이블일수록 유출이 많은 경향이 있다. | Maskara 감사에 바로 쓸 공격 도구 모음.  
  2025 · (Ward, Lin, Wang, Cheng) · [Synth-MIA: A Testbed for Auditing Privacy Leakage in Tabular Data Synthesis](https://arxiv.org/abs/2509.18014)

- 자식 테이블 통계를 부모에 집계하고 스키마 전체를 샘플링해 관계형 DB를 모델링한다. | 다중 테이블 참고 방식. Maskara는 실제 행을 유지한다.  
  2016 · MIT DAI Lab (Patki, Wedge, Veeramachaneni) · [The Synthetic Data Vault (IEEE DSAA)](https://doi.org/10.1109/DSAA.2016.49)

- 거래·방문 등 개체별 사건 시퀀스의 확률적 자기회귀 모델. | 날짜 이동 시 개인별 타임라인 보존과 관련.  
  2022 · MIT DAI Lab (Zhang, Patki, Veeramachaneni) · [Sequential Models in the Synthetic Data Vault](https://arxiv.org/abs/2207.14406)

- 혼합형 테이블용 조건부 GAN·VAE로 모드별 정규화와 샘플링 기반 학습을 사용한다. | Maskara와 비교하게 될 표준 기준 모델.  
  2019 · MIT DAI Lab (Xu, Skoularidou, Cuesta-Infante, Veeramachaneni) · [Modeling Tabular data using Conditional GAN (CTGAN, NeurIPS)](https://arxiv.org/abs/1907.00503)

- 클러스터 라벨로 부모·자식 테이블을 연결해 확산 모델이 외래 키 전반의 장거리 의존성을 포착한다. | 조인 무결성 주장을 비교할 최신 다중 테이블 기준 모델.  
  2024 · Waterloo / RBC Borealis (Pang, Shafieinejad, Liu, Hazlewood, He) · [ClavaDDPM: Multi-relational Data Synthesis with Cluster-guided Diffusion Models (NeurIPS)](https://arxiv.org/abs/2405.17724)

- 부모·조부모 행을 조건으로 자식 테이블을 생성해 테이블 간 관계를 보존한다. | 다중 테이블 경쟁 방법. 관계 지표를 Maskara에도 적용할 수 있는지 확인.  
  2023 · Croesus Lab (Gueye, Attabi, Dumas) · [Row Conditional-TGAN for generating synthetic relational databases (ICASSP)](https://arxiv.org/abs/2211.07588)

- GPT-2로 부모, seq2seq로 자식 테이블을 생성한다. 목표 마스킹과 통계로 복사를 방지한다. | LLM 관계형 기준 모델이며 복사 검사를 재사용할 수 있다.  
  2023 · World Bank (Solatorio, Dupriez) · [REaLTabFormer: Generating Realistic Relational and Tabular Data using Transformers](https://arxiv.org/abs/2302.02041)

- 행을 문장으로 바꿔 LLM을 미세조정한다. 임의의 열 부분집합을 조건으로 생성할 수 있다. | 사실적인 가상 인물 속성을 뽑을 수 있는 LLM 방식.  
  2023 · Tübingen/TUM (Borisov et al.) · [Language Models are Realistic Tabular Data Generators (GReaT, ICLR)](https://arxiv.org/abs/2210.06280)

- 수치 열에는 가우시안 잡음, 범주 열에는 다항 잡음을 쓰는 확산 모델로 혼합형 충실도가 높다. | 단일 테이블의 강력한 비교 기준.  
  2023 · Yandex (Kotelnikov, Baranchuk, Rubachev, Babenko) · [TabDDPM: Modelling Tabular Data with Diffusion Models (ICML)](https://arxiv.org/abs/2209.15421)

- VAE 잠재공간과 점수 기반 확산을 결합해 열별·열 쌍 통계 오차를 크게 줄인다. | 충실도에서 비교할 최신 선도 모델.  
  2024 · Amazon/UIUC (Zhang et al.) · [Mixed-Type Tabular Data Synthesis with Score-based Diffusion in Latent Space (TabSyn, ICLR)](https://arxiv.org/abs/2310.09656)

- 생성기와 공정성·개인정보 보호·증강 지표를 통합한 공개 평가 라이브러리. | 보고서 지표 코드를 재사용하거나 교차 검증할 수 있다.  
  2023 · Cambridge (Qian, Cebere, van der Schaar) · [Synthcity: facilitating innovative use cases of synthetic data in different data modalities](https://arxiv.org/abs/2301.07573)

- 플러그인 API로 여러 데이터 유형·활용 사례의 생성기를 간편하게 비교한다. | Maskara와 생성기 비교에 쓸 평가 도구.  
  2023 · Cambridge (Qian, Davis, van der Schaar) · [Synthcity: a benchmark framework for diverse use cases of tabular synthetic data (NeurIPS D&B)](https://papers.nips.cc/paper_files/paper/2023/hash/09723c9f291f6056fd1885081859c186-Abstract-Datasets_and_Benchmarks.html)

- 교사 앙상블(PATE) 판별기로 레코드별 영향력을 제한해 DP GAN을 만든다. | 개인정보 보호 프리셋에서 인용할 형식적 DP 대안.  
  2019 · Cambridge/Oxford (Jordon, Yoon, van der Schaar) · [PATE-GAN: Generating Synthetic Data with Differential Privacy Guarantees (ICLR)](https://openreview.net/forum?id=S1zk9iRqF7)

- 합성 환자가 실제 환자와 너무 가깝지 않도록 식별 가능성 제약을 둔 GAN. | 가상 인물의 원본 유사도를 조정하는 Maskara 설정과 유사.  
  2020 · Cambridge/UCLA (Yoon, Drumright, van der Schaar) · [Anonymization through Data Synthesis using GANs (ADS-GAN) (IEEE JBHI)](https://ieeexplore.ieee.org/document/9034117)

- α-정밀도·β-재현율·진정성으로 표본별 충실도·다양성·복사를 측정한다. | 보고서의 가상 인물별 진정성 표시.  
  2022 · Berkeley/Cambridge (Alaa, van Breugel, Saveliev, van der Schaar) · [How Faithful is your Synthetic Data? Sample-level Metrics for Evaluating and Auditing Generative Models (ICML)](https://arxiv.org/abs/2102.08921)

- 저차원 주변분포에 잡음을 넣고 그래프 모델을 적합해 샘플링한다. 2018 NIST 대회 우승 방식. | 높은 보호 수준 프리셋의 대표 DP 기준 모델.  
  2021 · UMass (McKenna, Miklau, Sheldon) · [Winning the NIST Contest: A scalable and general approach to differentially private synthetic data (MST, JPC)](https://arxiv.org/abs/2108.04978)

- 여러 잡음 주변분포에 일관된 그래프 모델을 적합한다. 후처리로 DP 보장을 유지한다. | MST·AIM의 엔진이며 가능한 DP 백엔드.  
  2019 · UMass (McKenna, Sheldon, Miklau) · [Graphical-model based estimation and inference for differential privacy (Private-PGM)](https://arxiv.org/abs/1901.09136)

- 목표 질의 작업에 맞춰 측정할 주변분포를 적응적으로 고르고 Private-PGM으로 생성한다. | 은행이 후속 작업을 지정할 때 작업 맞춤 DP 활용.  
  2022 · UMass (McKenna, Mullins, Sheldon, Miklau) · [AIM: An Adaptive and Iterative Mechanism for Differentially Private Synthetic Data (PVLDB)](https://arxiv.org/abs/2201.12677)

- DP 생성기를 체계적으로 비교한다. 다수가 단순 기준 모델을 능가하지 못한다. | DP와 가상 인물 대체의 절충을 논의할 근거.  
  2021 · Tumult/UMass/Duke (Tao, McKenna, Hay, Machanavajjhala, Miklau) · [Benchmarking Differentially Private Synthetic Data Generation Algorithms](https://arxiv.org/abs/2112.09238)

- NIST 참가 방식의 정확도와 데이터 제공자 관점의 실용성을 평가한다. | 규제 기관이 이미 접한 유용성 지표.  
  2021 · Urban Inst./RAND (Bowen, Snoke) · [Comparative Study of Differentially Private Synthetic Data Algorithms from the NIST PSCR Differential Privacy Synthetic Data Challenge (JPC)](https://arxiv.org/abs/1911.12704)

- DP 베이지안 네트워크를 학습하고 저차원 주변분포에 잡음을 넣어 합성 행을 샘플링한다. | 가상 인물 속성 샘플링의 고전적 DP 기준 모델.  
  2014 · AT&T/Warwick/NUS (Zhang, Cormode et al.) · [PrivBayes: Private Data Release via Bayesian Networks (SIGMOD)](https://doi.org/10.1145/2588555.2588573)

- 지리 계층에 zCDP 잡음과 후처리를 적용하되 정책상 불변량은 정확히 유지한다. | Maskara가 정확히 보존하는 통계를 명시하는 방식에 참고.  
  2022 · US Census Bureau (Abowd et al.) · [The 2020 Census Disclosure Avoidance System TopDown Algorithm (HDSR)](https://arxiv.org/abs/2204.08986)

- SDNist로 비식별화 제출물의 충실도·유용성·개인정보 보호를 평가하는 공개 벤치마크이며 순위표는 아니다. | Maskara 출력을 제출해 중립적인 제3자 평가를 받을 수 있다.  
  2024 · NIST (Task, Bhagat, Streat, Howarth) · [NIST Collaborative Research Cycle Data and Metrics Archive (SDNist)](https://pages.nist.gov/privacy_collaborative_research_cycle)

- 민감도에 비례하는 잡음으로 차등 개인정보 보호(DP)를 정의한다. | 보고서의 ‘DP 아님’ 설명에 쓸 공식 참고 문헌.  
  2006 · Microsoft/BGU/PSU (Dwork, McSherry, Nissim, Smith) · [Calibrating Noise to Sensitivity in Private Data Analysis (TCC)](https://doi.org/10.1007/11681878_14)

- 검증된 공개 DP 통계 라이브러리를 구축하기 위한 커뮤니티 계획. | 잡음을 넣은 집계 통계에 활용할 DP 라이브러리 후보.  
  2020 · Harvard OpenDP Team · [The OpenDP White Paper](https://privacytools.seas.harvard.edu/publications/opendp-white-paper)

- 검증 가능한 DP 파이프라인을 구성하는 조합 가능한 기본 요소. | Maskara에 DP 옵션을 추가할 경우의 설계 패턴.  
  2020 · Harvard/BU/Tumult (Hay, Gaboardi, Vadhan) · [A Programming Framework for OpenDP](https://salil.seas.harvard.edu/publications/programming-framework-opendp)

- 정부 데이터 공개에 쓰이는 운영용 DP 프레임워크(Tumult Core와 Python API). | 별도 집계 결과 공개를 위한 운영용 DP 옵션.  
  2022 · Tumult Labs (Berghel, Bohannon, Desfontaines, Hay, Machanavajjhala, Miklau et al.) · [Tumult Analytics: a robust, easy-to-use, scalable, and expressive framework for differential privacy](https://arxiv.org/abs/2212.04133)

- DP 생성기는 소수 집단의 크기를 왜곡하고 해당 집단의 후속 정확도를 낮춘다. | 인구통계 매칭 프리셋에서 하위집단 충실도를 살펴야 한다.  
  2022 · Hazy/UCL/Turing (Ganev, Oprisanu, De Cristofaro) · [Robin Hood and Matthew Effects: Differential Privacy Has Disparate Impact on Synthetic Data (ICML)](https://arxiv.org/abs/2109.11429)

- 판별기로 과적합된 학습 레코드를 찾는 초기 GAN 멤버십 공격. | 보고서 멤버십 검사의 역사적 기반.  
  2019 · UCL (Hayes, Melis, Danezis, De Cristofaro) · [LOGAN: Membership Inference Attacks Against Generative Models (PoPETs)](https://arxiv.org/abs/1705.07663)

- 생성기 출력만 필요한 표본 기반 몬테카를로 멤버십 공격. | 가상 인물 출력에 적용할 블랙박스 공격 변형.  
  2019 · (Hilprecht et al.) · [Monte Carlo and Reconstruction Membership Inference Attacks against Generative Models (PoPETs)](https://doi.org/10.2478/popets-2019-0067)

- 포함 여부를 아는 데이터로 섀도 모델을 학습해 학습 레코드를 구별하는 공격 모델을 만든다. | 합성 데이터 감사에 쓰이는 섀도 모델 방법.  
  2017 · Cornell (Shokri, Stronati, Song, Shmatikov) · [Membership Inference Attacks against Machine Learning Models (IEEE S&P)](https://arxiv.org/abs/1610.05820)

- 개인정보 보호 목적 합성 데이터와 놓치기 쉬운 함정을 쉽게 설명하는 입문서. | 은행·병원 이해관계자에게 인용할 설명 자료.  
  2022 · Turing/Oxford/Warwick (Jordon, Szpruch, Houssiau et al.) · [Synthetic Data – what, why and how?](https://arxiv.org/abs/2205.03257)

- 온프레미스 임상 기록 PII 탐지·가명처리. 실제·합성 기록으로 학습한 모델 모두 높은 재현율을 낸다. | Maskara 자유 텍스트 기능과 병원 온프레미스 배포 패턴에 참고.  
  2026 · Antwerp (Hellemans, …, Laukens) · [MedDeID enables locally governed clinical-text de-identification from real or synthetic training data](https://arxiv.org/abs/2609.10049)

- 업체의 합성 EHR 데이터에 대해 충실도와 개인정보 보호를 함께 평가한다. | 비교할 병원형 평가 틀.  
  2021 · Syntegra (Mendelevitch, Lesh) · [Fidelity and Privacy of Synthetic Medical Data](https://arxiv.org/abs/2101.08658)


## 선도 AI 연구소: OpenAI, Anthropic, Google DeepMind, Google Research

72편. 관련성이 높은 순서.

- 로컬 하드웨어에서 한 번에 8종 PII를 찾아 가리는 소형 공개 가중치 토큰 분류기(Apache-2.0, 문맥 128k). | GLiNER2와 비교하거나 대안으로 쓸 로컬 PII 탐지기.  
  2026 · OpenAI · [Introducing OpenAI Privacy Filter (open-weight PII model)](https://openai.com/index/introducing-openai-privacy-filter)

- 기성·맞춤 임상 비식별화를 비교한다. 재현율은 기성이 대체로 90% 초과, 맞춤형은 97~99%다. | 병원 비식별화 기준과 도메인 적응의 효과.  
  2020 · Google Research · [Customization scenarios for de-identification of clinical notes](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6993314)

- LLM PII 탐지기가 모호한 문맥에서 이름을 놓치는 문제를 새 벤치마크로 측정한다. | 이름 재현율은 Maskara 탐지의 가장 약한 지점.  
  2025 · Google Research (공동 저자; UMass 주도) · [Can Large Language Models Really Recognize Your Name?](https://arxiv.org/abs/2505.14549)

- LLM 에이전트가 가명 사용자를 대규모 재식별한다(정밀도 90%에서 재현율 68%). 비LLM 방식은 약 0%다. | 보고서의 연결 공격이 모사해야 할 위협 모델.  
  2026 · Anthropic (공동 저자 Carlini; ETH 주도) · [Large-scale online deanonymization with LLMs](https://arxiv.org/abs/2602.16800)

- 인코더·디코더와 GAN으로 혼합·시변 특성의 합성 EHR을 만든다. 이를 이용한 모델의 정확도 손실은 3% 미만이다. | 병원 테이블 데이터의 유용성·개인정보 보호 평가 틀.  
  2023 · Google Cloud AI · [EHR-Safe: generating high-fidelity and privacy-preserving synthetic electronic health records](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10421926)

- LLM API 호출만으로 Private Evolution을 테이블에 적용하나 표준 DP 기준을 안정적으로 능가하지 못한다. | LLM만으로 DP 테이블 데이터가 더 좋아지지 않는다는 경고.  
  2025 · Google Research · [Is API Access to LLMs Useful for Generating Private Synthetic Tabular Data?](https://arxiv.org/abs/2502.06555)

- 테이블·텍스트·이미지 DP 합성 데이터의 시스템 설계와 평가를 설명하는 실무 가이드. | 향후 DP 프리셋과 평가 지표에 참고.  
  2025 · Google Research · [How to DP-fy Your Data: A Practical Guide to Generating Synthetic Data With Differential Privacy](https://arxiv.org/abs/2512.03238)

- 실제 배포된 암호 프로토콜로 두 주체가 원본 ID를 공개하지 않고 식별자 조인과 집계를 수행한다. | 저장소 공유 없이 키 기반 ID로 기관 간 조인.  
  2020 · Google · [Private Intersection-Sum Protocols with Applications to Attributing Aggregate Ad Conversions](https://eprint.iacr.org/2019/723)

- 여러 행에 걸친 사용자 기여를 제한해 사용자 단위 보장을 제공하는 DP SQL 엔진. | 개인정보 보호 단위가 사람이라는 점에서 개인당 가상 인물과 일치.  
  2019 · Google · [Differentially Private SQL with Bounded User Contribution](https://arxiv.org/abs/1909.01917)

- 카나리 비밀값을 심고 ‘노출도’를 측정해 모델 암기를 정량화한다. | 보고서의 카나리 기반 잔존 정보 검사.  
  2019 · Google Brain · [The Secret Sharer: Evaluating and Testing Unintended Memorization in Neural Networks](https://arxiv.org/abs/1802.08232)

- LiRA는 섀도 모델의 우도비로 멤버십을 추론하며 낮은 오탐률에서의 참양성률로 평가한다. | 보고서의 공격 지표를 강화할 표준 방식.  
  2022 · Google · [Membership Inference Attacks From First Principles](https://arxiv.org/abs/2112.03570)

- 한 번의 학습에 많은 카나리를 넣어 DP 보장을 감사한다. | 후속 모델의 저비용 경험적 개인정보 보호 감사.  
  2023 · Google · [Privacy Auditing with One (1) Training Run](https://arxiv.org/abs/2305.08846)

- 발산 공격으로 정렬된 ChatGPT가 PII 등 암기한 학습 데이터를 대규모 출력하게 한다. | 정렬만으로 유출을 막지 못하므로 데이터를 먼저 정제해야 한다.  
  2023 · Google DeepMind · [Scalable Extraction of Training Data from (Production) Language Models](https://arxiv.org/abs/2311.17035)

- LLM이 대화를 요약·PII 정제·군집화하고 사람이 보기 전에 개인정보 보호를 검사한다. | 다층 LLM 기반 PII 정제 설계와 평가.  
  2024 · Anthropic · [Clio: Privacy-Preserving Insights into Real-World AI Use](https://arxiv.org/abs/2412.13678)

- Clio식 LLM 대화 군집화·요약에 형식적 DP를 추가한다. | 자유 텍스트 분석 출력의 DP 옵션.  
  2025 · Google Research · [Urania: Differentially Private Insights into AI Use](https://arxiv.org/abs/2506.04681)

- LLM을 DP 미세조정해 합성 텍스트를 샘플링한다. 후속 성능은 실제 데이터 학습에 가깝다. | 텍스트 대체를 보완하거나 대신할 DP 방식.  
  2023 · Google · [Harnessing large-language models to generate private synthetic text](https://arxiv.org/abs/2306.01684)

- 미세조정 없이 추론 시 다음 토큰 예측을 보호해 DP 합성 텍스트를 생성한다. | 로컬 LLM의 추론 전용 DP 모드 후보.  
  2024 · Google · [Private prediction for large-scale synthetic text generation](https://arxiv.org/abs/2407.12108)

- DP 언어 모델로 질의 단위 개인정보 보호를 제공하는 검색 모델 학습용 합성 질의를 만든다. | 후속 작업에서 DP 합성 텍스트의 유용성을 확인하는 사례.  
  2023 · Google · [Synthetic Query Generation for Privacy-Preserving Deep Retrieval Systems using DP LMs](https://arxiv.org/abs/2305.05973)

- 실제 프롬프트 대신 DP 합성 사용자 지시를 SFT/RLHF에 사용하며 유용성 손실이 작다. | 학습용 채팅 로그를 공유하는 고객에게 적합.  
  2024 · Google · [Privacy-Preserving Instructions for Aligning Large Language Models](https://arxiv.org/abs/2402.13659)

- 임상 기록에서 DP BERT와 DP WordPiece 어휘를 학습해 개체를 추출한다(ε≈1.1). | 비공개 데이터를 보호하며 학습하는 임상 NER·온프레미스 탐지기 경로.  
  2021 · Google · [Learning and Evaluating a Differentially Private Pre-trained Language Model](https://aclanthology.org/2021.findings-emnlp.102)

- 공개 LLM의 합성 사전학습 데이터로 Gboard DP 연합 모델을 개선한다. | 공개 합성 데이터와 비공개 데이터의 결합 패턴.  
  2024 · Google · [Prompt Public Large Language Models to Synthesize Data for Private On-device Applications](https://arxiv.org/abs/2404.04360)

- 몇 개 표본만으로 특정 사용자 데이터가 미세조정에 쓰였는지 알아낸다. | 개인 단위 보호와 연결 공격 설계.  
  2023 · Google Research · [User Inference Attacks on Large Language Models](https://arxiv.org/abs/2310.09266)

- 대규모 LLM 미세조정에서 표본 단위와 사용자 단위 DP-SGD를 비교한다. | 개인 단위 보장이 가상 인물 단위 일관성과 부합한다.  
  2024 · Google · [Fine-Tuning Large Language Models with User-Level Differential Privacy](https://arxiv.org/abs/2407.07737)

- 레코드 단위 DP는 기록이 많은 사용자를 충분히 보호하지 못하므로 사용자 단위 DP가 필요하다. | 여러 테이블의 개인 기록은 사용자 단위 보호가 필요하다.  
  2024 · Google · [Mind the Privacy Unit! User-Level Differential Privacy for Language Model Fine-Tuning](https://arxiv.org/abs/2406.14322)

- LLM 도우미가 문맥적 무결성에 따라 양식 필드에 적합한 데이터를 판단하게 한다. | 남길 필드와 제거할 필드를 정하는 문맥 기반 프리셋.  
  2024 · Google DeepMind · [Operationalizing Contextual Integrity in Privacy-Conscious Assistants](https://arxiv.org/abs/2408.02373)

- 도우미의 적절한 정보 공유를 평가하는 정보 흐름 합성 벤치마크. | 합성 가상 인물 평가 데이터 아이디어.  
  2024 · Google DeepMind · [CI-Bench: Benchmarking Contextual Integrity of AI Assistants on Synthetic Data](https://arxiv.org/abs/2409.13903)

- 별도 최소화 모듈이 작업에 필요한 사용자 데이터만 에이전트에 전달해 탈취로 인한 유출을 막는다. | 로컬 LLM 파이프라인의 데이터 최소화 패턴.  
  2024 · Google Research · [AirGapAgent: Protecting Privacy-Conscious Conversational Agents](https://arxiv.org/abs/2405.05175)

- 음성의 화자 식별과 근거 없는·민감 속성 추론을 평가하고 완화한다. | 오디오 확장: 음성 자체가 식별자다.  
  2024 · OpenAI · [GPT-4o System Card](https://arxiv.org/abs/2410.21276)

- 이미지의 인물 식별을 시험하며 얼굴로 이름을 말하는 기능을 제한한다. | 얼굴 확장: VLM은 얼굴을 재식별할 수 있다.  
  2023 · OpenAI · [GPT-4V(ision) System Card](https://cdn.openai.com/papers/GPTV_System_Card.pdf)

- 원문 그대로의 출력을 막는 필터는 문체를 바꾼 프롬프트로 쉽게 우회된다. | 완전 일치 기반 잔존 원본 검사만으로는 부족하다.  
  2022 · Google · [Preventing Verbatim Memorization in Language Models Gives a False Sense of Privacy](https://arxiv.org/abs/2210.17546)

- 암기는 모델 크기·중복·프롬프트 길이에 따라 로그 선형적으로 증가한다. | 중복 PII 레코드는 유출 위험을 특히 높인다.  
  2022 · Google · [Quantifying Memorization Across Neural Language Models](https://arxiv.org/abs/2202.07646)

- 유사 중복 제거로 암기 출력을 약 10분의 1로 줄이고 모델도 개선한다. | 가명처리와 함께 중복 제거 적용.  
  2021 · Google Brain · [Deduplicating Training Data Makes Language Models Better](https://arxiv.org/abs/2107.06499)

- 희귀 개별 표본 암기와 흔한 텍스트 암기를 구분한다. | 희귀한 개인이 가장 위험하며 k-익명성과 연결된다.  
  2021 · Google Brain · [Counterfactual Memorization in Neural Language Models](https://arxiv.org/abs/2112.12938)

- 가장 취약한 레코드를 없애면 다음 취약 계층이 드러난다. | 반복적인 이상치 억제는 수렴하지 않는다.  
  2022 · Google · [The Privacy Onion Effect: Memorization is Relative](https://arxiv.org/abs/2206.10469)

- 초기 표본은 학습 중 잊히지만 후기·반복 표본은 더 많이 유출된다. | 데이터 순서가 유출 위험에 영향을 준다.  
  2022 · Google · [Measuring Forgetting of Memorized Training Examples](https://arxiv.org/abs/2207.00099)

- 탐욕적 추출 지표 대신 샘플링으로 시퀀스를 추출할 확률을 사용한다. | 모델 감사의 개선된 유출 지표.  
  2024 · Google DeepMind · [Measuring memorization in language models via probabilistic extraction](https://arxiv.org/abs/2410.19482)

- LiRA를 10억 매개변수 언어 모델로 확대한다. 공격은 작동하지만 AUC<0.7이며 표본별로 불안정하다. | 멤버십 추론 지표에 대한 기대를 조정한다.  
  2025 · Google DeepMind · [Exploring the limits of strong membership inference attacks on large language models](https://arxiv.org/abs/2505.18773)

- 잡음 마스킹 공격으로 ASR 학습 음성의 이름을 복구하고 완화책을 제안한다. | 오디오 확장: 전사문에서 이름이 유출된다.  
  2022 · Google · [Extracting Targeted Training Data from ASR Models, and How to Mitigate It](https://arxiv.org/abs/2204.08345)

- 언어 모델을 결합한 음성 인식기의 카나리 기반 암기 검사. | 오디오 파이프라인 유출 검사.  
  2022 · Google · [Detecting Unintended Memorization in Language-Model-Fused ASR](https://arxiv.org/abs/2204.09606)

- 얼굴 정체성 데이터를 포함한 임베딩 모델의 사용자 단위 DP 학습. | 얼굴 확장: 얼굴 모델의 개인정보 보호.  
  2022 · Google · [Learning to Generate Image Embeddings with User-level Differential Privacy](https://arxiv.org/abs/2211.10844)

- DP 미세조정 확산 모델이 후속 학습에 유용한 합성 이미지를 생성한다. | 사진 확장: DP 합성 이미지.  
  2023 · Google DeepMind · [Differentially Private Diffusion Models Generate Useful Synthetic Images](https://arxiv.org/abs/2302.13861)

- 확산 모델이 식별 가능한 얼굴을 포함한 학습 이미지를 재생성한다. | 생성 모델 학습에서 얼굴이 유출될 수 있다.  
  2023 · Google (+DeepMind) · [Extracting Training Data from Diffusion Models](https://arxiv.org/abs/2301.13188)

- 처음부터 완전히 DP로 학습한 10억 매개변수 공개 가중치 LLM. | 망분리 배포용 로컬 DP 모델.  
  2025 · Google Research / DeepMind · [VaultGemma: A Differentially Private Gemma Model](https://arxiv.org/abs/2510.15001)

- DP LLM 학습의 계산량·개인정보 보호·유용성 스케일링 법칙. | 고객 DP 학습의 규모 결정에 참고.  
  2025 · Google Research · [Scaling Laws for Differentially Private Language Models](https://arxiv.org/abs/2501.18914)

- T5의 DP 사전학습은 품질을 유지하며 구간 손상 학습이 다음 토큰 예측보다 덜 암기한다. | 정제 출력에 대한 DP 학습이 가능하다.  
  2022 · Google · [Training Text-to-Text Transformers with Privacy Guarantees](https://aclanthology.org/2022.findings-acl.171)

- 매우 큰 배치로 BERT를 대규모 DP-SGD 사전학습한다. | DP NER 탐지기 학습 경로.  
  2021 · Google · [Large-Scale Differentially Private BERT](https://arxiv.org/abs/2108.01624)

- 보호 단위·ε 선택·결과 보고 등 DP ML 실무 가이드. | 보고서 문구와 프리셋 정의에 참고.  
  2023 · Google · [How to DP-fy ML: A Practical Guide to Machine Learning with Differential Privacy](https://arxiv.org/abs/2303.00654)

- DP-SGD는 표본별 기울기를 클리핑하고 잡음을 더하며 moments accountant로 보호 예산을 추적한다. | 이들 논문 대부분의 기반인 DP 방법.  
  2016 · Google · [Deep Learning with Differential Privacy](https://arxiv.org/abs/1607.00133)

- 언어 모델의 사용자 단위 DP 연합학습. | 사용자 단위 개인정보 보호의 출발점.  
  2017 · Google · [Learning Differentially Private Recurrent Language Models](https://arxiv.org/abs/1710.06963)

- 정식 보장을 갖춘 Gboard 운영용 DP 연합 언어 모델. | 실제 운영의 기기 내·로컬 개인정보 보호.  
  2023 · Google · [Federated Learning of Gboard Language Models with Differential Privacy](https://arxiv.org/abs/2305.18465)

- 연합학습+DP로 운영 중인 키보드 언어 모델의 카나리 암기를 막는다. | 운영 환경의 카나리 감사.  
  2020 · Google · [Training Production Language Models without Memorizing User Data](https://arxiv.org/abs/2009.10031)

- 사용자 군집화와 DP가 연합학습 암기에 미치는 영향을 측정한다. | 사용자별 묶음 구성이 유출에 영향을 준다.  
  2020 · Google · [Understanding Unintended Memorization in Federated Learning](https://arxiv.org/abs/2006.07490)

- 공개 LLM과 분포 매칭으로 비공개 연합 언어 모델을 개선한다. | 공개 데이터로 비공개 학습의 유용성을 높일 수 있다.  
  2023 · Google Research (co-author) · [Can Public Large Language Models Help Private Cross-device Federated Learning?](https://arxiv.org/abs/2305.12132)

- ‘공개’ 웹 사전학습 데이터에도 비공개 정보가 있음을 지적하며 DP 주장을 검토한다. | 공개 사전학습 데이터도 PII가 없지는 않다.  
  2022 · Google (co-author) · [Position: Considerations for Differentially Private Learning with Large-Scale Public Pretraining](https://arxiv.org/abs/2212.06470)

- PATE는 교사 모델의 잡음 투표로 공개 데이터를 라벨링해 학생 모델을 비공개 학습한다. | 탐지기 학습용 비공개 라벨링 경로.  
  2016 · Google Brain · [Semi-supervised Knowledge Transfer for Deep Learning from Private Training Data](https://arxiv.org/abs/1610.05755)

- 확신도가 높은 결과를 선택적으로 잡음 집계해 PATE를 확장한다. | 위와 같은 시사점.  
  2018 · Google Brain · [Scalable Private Learning with PATE](https://arxiv.org/abs/1802.08908)

- DP-SGD의 경험적 ε를 정밀하게 구하는 감사 방법. | DP 주장을 경험적으로 검증한다.  
  2023 · Google · [Tight Auditing of Differentially Private Machine Learning](https://arxiv.org/abs/2302.07956)

- DP 공격자를 구체화해 ε의 경험적 하한을 구한다. | 감사 방법론.  
  2021 · Google · [Adversary Instantiation: Lower Bounds for Differentially Private Machine Learning](https://arxiv.org/abs/2101.04535)

- 강력한 공격자가 모델로부터 개별 학습 레코드를 복원한다. | 보고서의 최악 상황 위협 모델.  
  2022 · Google DeepMind · [Reconstructing Training Data with Informed Adversaries](https://arxiv.org/abs/2201.04845)

- DP 아래 복원 위험 경계로 ε를 더 의미 있게 해석한다. | 은행·병원에 ε를 설명하는 데 참고.  
  2023 · Google DeepMind · [Bounding Training Data Reconstruction in DP-SGD](https://arxiv.org/abs/2302.07225)

- 학습 데이터 오염이 특정 대상의 멤버십·속성 유출을 증폭한다. | 여러 주체 간 데이터 공유 위험.  
  2022 · Google · [Truth Serum: Poisoning Machine Learning Models to Reveal Their Secrets](https://arxiv.org/abs/2204.00032)

- ML 파이프라인의 중복 제거·필터·토크나이저가 개인정보 부채널을 만든다. | Maskara 자체 파이프라인에서도 유출이 가능하다.  
  2023 · Google DeepMind (co-author) · [Privacy Side Channels in Machine Learning Systems](https://arxiv.org/abs/2309.05610)

- MoE 라우팅으로 공격자가 다른 사용자의 프롬프트를 복구한다. | 공유 추론의 유출 위험이 온프레미스 필요성을 뒷받침한다.  
  2024 · Google DeepMind · [Stealing User Prompts from Mixture of Experts](https://arxiv.org/abs/2410.22884)

- 개인정보 필터링과 암기 평가를 포함하는 공개 모델 보고서. | 로컬 LLM 후보와 PII 필터링 관행.  
  2025 · Google DeepMind · [Gemma 3 Technical Report](https://arxiv.org/abs/2503.19786)

- 사전학습 데이터의 암기·카나리 분석을 보고한다. | 업계의 암기 결과 보고 방식.  
  2023 · Google · [PaLM 2 Technical Report](https://arxiv.org/abs/2305.10403)

- 공개 데이터로 개인을 식별하는 등의 개인정보 위험을 다루는 시스템 카드. | 속성·신원 추론 위험.  
  2023 · OpenAI · [GPT-4 Technical Report](https://arxiv.org/abs/2303.08774)

- 비공개 데이터 유출과 민감정보 추론을 포함하는 위험 분류 체계. | 개인정보 위험 문서화의 틀.  
  2021 · Google DeepMind · [Ethical and social risks of harm from Language Models](https://arxiv.org/abs/2112.04359)

- PII를 정제하고 비식별화한 대화를 자동 LLM 분류기로 분석하는 사용 연구. | 분석 전 PII 정제 사례.  
  2025 · OpenAI · [How People Use ChatGPT](https://www.nber.org/papers/w34255)

- Clio의 개인정보 보호 파이프라인으로 대화를 경제적 작업에 연결한다. | 정제 텍스트의 유용성 보존 분석.  
  2025 · Anthropic · [Which Economic Tasks are Performed with AI? Evidence from Millions of Claude Conversations](https://arxiv.org/abs/2503.04761)

- TEE와 DP로 서버 측 연합 집계를 검증 가능하게 한다. | 공유 처리의 신뢰 실행 환경 옵션.  
  2024 · Google · [Confidential Federated Computations](https://arxiv.org/abs/2404.10764)

- 규모와 조정 기법으로 DP-SGD가 ImageNet에서 높은 정확도를 달성한다. | 사진·얼굴 모델의 비공개 학습.  
  2022 · Google DeepMind · [Unlocking High-Accuracy Differentially Private Image Classification through Scale](https://arxiv.org/abs/2204.13650)

- 보상 모델·RL에 쓰인 데이터는 SFT 데이터보다 덜 유출된다. | 정제 데이터를 어느 학습 단계에 사용할지 판단하는 데 참고.  
  2024 · Google DeepMind · [Measuring memorization in RLHF for code completion](https://arxiv.org/abs/2406.11715)


## 대형 기술 기업: Microsoft, Meta, Apple, Amazon, NVIDIA, IBM, Salesforce, Intel

48편. 관련성이 높은 순서.

- 합성 인물 기반 레코드 10만 건으로 GLiNER를 미세조정해 55종 이상 PII·PHI 구간을 탐지한다. | GLiNER2 탐지기의 대체·보완 후보이며 합성 데이터는 벤치마크로 쓸 수 있다.  
  2025 · NVIDIA · [GLiNER-PII model + Nemotron-PII dataset (model card / dataset, not a paper)](https://huggingface.co/nvidia/gliner-PII)

- 단일 주석기는 일부 텍스트에서만 잘 작동하므로 여러 PII 주석기를 혼합 프레임워크로 결합한다. | 정규식+NER 혼합 탐지 설계를 뒷받침한다.  
  2019 · IBM · [An Extensible De-Identification Framework for Privacy Protection of Unstructured Health Information](https://research.ibm.com/publications/an-extensible-de-identification-framework-for-privacy-protection-of-unstructured-health-information-creating-sustainable-privacy-infrastructures)

- 높은 perplexity 접미사를 붙인 분포 내 카나리로 공개 합성 텍스트만 사용해 멤버십을 추론한다. | 대체·합성 텍스트 출력의 유출 감사 방법.  
  2025 · Microsoft · [The Canary's Echo: Auditing Privacy Risks of LLM-Generated Synthetic Text](https://arxiv.org/abs/2502.14921)

- Granite 사전학습 데이터 구축에 쓰인 확장 가능한 공개 데이터 준비 도구이며 PII 필터·삭제 모듈이 있다. | 가장 가까운 기업용 PII 파이프라인 경쟁 도구이자 통합 후보.  
  2024 · IBM · [Data-Prep-Kit: getting your data ready for LLM application development](https://arxiv.org/abs/2409.18164)

- 모델 정확도로 k-익명 일반화를 유도해 일반 k-익명성보다 유용성이 좋고 멤버십 공격에도 저항한다. | 유용성과 k-익명성 프리셋의 비교 기준.  
  2020 · IBM · [Anonymizing Machine Learning Models](https://arxiv.org/abs/2007.13086)

- 학습 모델의 지식으로 입력 특성을 제거·일반화하며 정확도 손실이 작다. | 은행·병원 대상 유용성·보호 프리셋의 GDPR 설명에 참고.  
  2020 · IBM · [Data Minimization for GDPR Compliance in Machine Learning Models](https://arxiv.org/abs/2008.04113)

- Private Evolution은 미세조정 없이 LLM 추론 호출만으로 DP 합성 텍스트를 만든다. | 로컬 LLM으로 실행할 학습 불필요 DP 텍스트 경로.  
  2024 · Microsoft · [Differentially Private Synthetic Data via Foundation Model APIs 2: Text (Aug-PE)](https://arxiv.org/abs/2403.01749)

- 사전학습 언어 모델의 DP 미세조정으로 유용한 합성 텍스트를 만들고 실제 고객 데이터로 검증한다. | 가상 인물 대체를 넘어 향후 완전 합성 텍스트 모드의 기준 모델.  
  2022 · Microsoft · [Synthetic Text Generation with Differential Privacy: A Simple and Practical Recipe](https://arxiv.org/abs/2210.14348)

- 저비용 휴리스틱 연산으로 테이블에 Private Evolution을 적용한다. AIM보다 정확도 최대 10% 향상, 속도 28배다. | 온프레미스에서 실행할 DP 테이블 합성 옵션.  
  2026 · Microsoft · [Differentially Private Synthetic Data via APIs 4: Tabular Data (Tab-PE)](https://www.microsoft.com/en-us/research/publication/differentially-private-synthetic-data-via-apis-4-tabular-data)

- 행을 문장으로 보고 DP-SGD로 언어 모델(SynLM)을 학습해 비공개 테이블 데이터를 생성한다. | 유용성을 비교할 다른 DP 테이블 생성기.  
  2023 · Meta · [Privately generating tabular data using language models](https://arxiv.org/abs/2306.04803)

- 단어 임베딩에 metric-DP 잡음을 넣고 최근접 단어로 바꾼다. 유용성 손실은 2% 미만이다. | 자유 텍스트의 단어 대체에 형식적 보호를 제공하는 경로.  
  2019 · Amazon · [Privacy- and Utility-Preserving Textual Analysis via Calibrated Multivariate Perturbations](https://arxiv.org/abs/1910.08902)

- 절단 지수 메커니즘으로 임의 거리 척도 아래 단어를 보호하며 유용성을 높인다. | 준식별자 단어의 보정된 대체값 선택.  
  2021 · Amazon · [TEM: High Utility Metric Differential Privacy on Text](https://arxiv.org/abs/2107.07928)

- 첫째·둘째 최근접 이웃 사이를 Vickrey 경매 방식으로 선택해 원래 단어 복구를 막는다. | 단순 최근접 이웃 대체는 역변환될 수 있다는 경고.  
  2021 · Amazon · [On a Utilitarian Approach to Privacy Preserving Text Generation](https://arxiv.org/abs/2104.11838)

- 임베딩 공분산에 맞춘 타원형 잡음으로 같은 유용성에서 보호를 높인다. | 임베딩 기반 대체값 샘플링 개선.  
  2020 · Amazon · [A Differentially Private Text Perturbation Method Using a Regularized Mahalanobis Metric](https://arxiv.org/abs/2010.11947)

- 멤버십·속성·집단 특성·DP 구별·복원 위험을 형식적 게임으로 통합한다. | 보고서 연결 공격 지표의 형식적 설명에 참고.  
  2022 · Microsoft · [SoK: Let the Privacy Games Begin! A Unified Treatment of Data Inference Privacy in ML](https://arxiv.org/abs/2212.10986)

- 공격의 오탐·미탐률에서 ε의 사후분포를 구해 구간을 최대 40% 좁힌다. | 연결 공격 결과를 보정된 보호 수치로 변환한다.  
  2022 · Microsoft · [Bayesian Estimation of Differential Privacy](https://arxiv.org/abs/2206.05199)

- DP-SGD 하의 멤버십·속성 추론 위험을 빠른 닫힌 형태 경계로 계산한다. | 준식별자 위험 보고와 관련된 속성 추론 경계.  
  2024 · Microsoft · [Closed-Form Bounds for DP-SGD against Record-level Inference](https://arxiv.org/abs/2402.14397)

- 기업 에이전트 벤치마크에서 개인정보 침해율은 15.8~50.9%이며 유용성이 높을수록 유출도 늘어나는 경향이 있다. | 기업 에이전트에 전달하기 전에 가상 인물로 대체해야 하는 근거.  
  2026 · Microsoft · [CI-Work: Benchmarking Contextual Integrity in Enterprise LLM Agents](https://arxiv.org/abs/2604.21308)

- 프롬프트 시 정보 흐름 추출과 공개·보류 판단으로 에이전트 유출을 약 35%에서 8%로 줄인다. | 로컬 LLM에도 적용할 모델 독립적 보호 패턴.  
  2025 · Microsoft · [Privacy in Action: Towards Realistic Privacy Mitigation and Evaluation for LLM-Powered Agents (PrivacyChecker)](https://arxiv.org/abs/2509.17488)

- 문맥적 무결성 추론의 사고 과정과 RL 학습으로 작업 유용성을 유지하며 부적절한 공개를 줄인다. | LLM 기반 문맥 인식 익명화에 참고.  
  2025 · Microsoft · [Contextual Integrity in LLMs via Reasoning and Reinforcement Learning](https://arxiv.org/abs/2506.04245)

- 웹 에이전트가 작업에 필요할 때만 민감정보를 사용하는지 평가하는 종단간 벤치마크. | 가상 인물 대체 데이터의 후속 유출 평가 아이디어.  
  2025 · Meta · [AgentDAM: Privacy Leakage Evaluation for Autonomous Web Agents](https://arxiv.org/abs/2503.09780)

- 데이터 추상화 방화벽이 에이전트 전달 전에 주소 등 개인정보를 최소한으로 변환한다. | 에이전트 경계에서 형식 보존 대체하는 방식과 유사.  
  2025 · Microsoft · [Firewalls to Secure Dynamic LLM Agentic Networks](https://arxiv.org/abs/2502.01822)

- CRM 에이전트는 기밀성 인식이 거의 없고 이를 요구하는 프롬프트는 작업 성공률을 떨어뜨린다. | 에이전트가 보기 전에 CRM 데이터를 비식별화할 사업적 근거.  
  2025 · Salesforce · [CRMArena-Pro: Holistic Assessment of LLM Agents Across Diverse Business Scenarios](https://arxiv.org/abs/2505.18878)

- GPT형 모델은 매개변수당 약 3.6비트를 저장하며 용량·데이터 크기를 멤버십 추론과 연결하는 스케일링 법칙을 보인다. | 원본 PII 학습의 위험을 정량화한다.  
  2025 · Meta · [How much do language models memorize?](https://arxiv.org/abs/2505.24832)

- 큰 모델은 더 빨리 암기하며 명사·숫자(식별자)를 먼저 암기한다. | LLM이 ID·이름을 먼저 암기하므로 대체해야 한다.  
  2022 · Meta · [Memorization Without Overfitting: Analyzing the Training Dynamics of LLMs](https://arxiv.org/abs/2205.10770)

- 신뢰하는 로컬 언어 모델로 DP 합성 few-shot 예시를 오프라인 생성하고 비신뢰 LLM 프롬프트에 넣는다. | 망분리 로컬 LLM 작업 흐름과 부합한다.  
  2023 · Microsoft · [Privacy-Preserving In-Context Learning with Differentially Private Few-Shot Generation](https://arxiv.org/abs/2309.11765)

- 매개변수 효율적 DP 미세조정으로 ε=6.7에서 비보호 모델에 가까운 정확도를 낸다. | 고객의 후속 DP 학습 옵션.  
  2021 · Microsoft · [Differentially Private Fine-tuning of Language Models](https://arxiv.org/abs/2110.06500)

- 비공개 데이터와 유사하도록 고른 공개 데이터로 사전학습하면 작은 DP 모델이 크게 개선된다. | 고객의 후속 비공개 학습에 유용한 지침.  
  2023 · Microsoft · [Selective Pre-training for Private Fine-tuning](https://arxiv.org/abs/2305.13865)

- 접근 제어 메타데이터와 검색으로 사용자 단위 비간섭을 제공하며 유용성에서 DP 미세조정을 능가한다. | ‘익명화 후 학습’과 비교할 대안 구조.  
  2023 · Microsoft · [Rethinking Privacy in ML Pipelines from an Information Flow Control Perspective](https://arxiv.org/abs/2311.15792)

- DP 메커니즘·ML 모델·보호 예산 계산을 제공하는 Python 라이브러리. | 보고서·집계값에 잡음을 추가할 기본 DP 기능.  
  2019 · IBM · [Diffprivlib: The IBM Differential Privacy Library](https://arxiv.org/abs/1907.02444)

- PyTorch에서 약 두 줄로 효율적인 표본별 기울기 DP-SGD를 적용한다. | Maskara에 DP 학습을 추가할 경우의 표준 도구.  
  2021 · Meta · [Opacus: User-Friendly Differential Privacy Library in PyTorch](https://arxiv.org/abs/2109.12298)

- 단어 임베딩에 대한 블랙박스 멤버십 추론이 후속 분류기·언어 모델에도 이어진다. | 원본 텍스트로 학습한 임베딩도 유출되므로 먼저 가상 인물로 바꿔야 한다.  
  2021 · Microsoft · [Membership Inference on Word Embedding and Beyond](https://arxiv.org/abs/2106.11384)

- 갱신 전후 모델 스냅샷을 비교해 추가 학습 텍스트를 알아낸다. | 반복 실행에서 데이터 재공개 위험이 있으며 일관된 가상 인물이 필요하다.  
  2019 · Microsoft · [Analyzing Information Leakage of Updates to Natural Language Models](https://arxiv.org/abs/1912.07942)

- 프롬프트 튜닝으로 암기 데이터 추출을 늘리거나(공격) 최대 97.7% 줄인다(방어). | 후속 모델 시험의 추출률 지표.  
  2023 · Amazon · [Controlling the Extraction of Memorized Data from LLMs via Prompt-Tuning](https://arxiv.org/abs/2305.11759)

- 디코딩 시 출력 분포와 균등분포를 섞어 재학습 없이 ε-DP를 얻는다. | 로컬 LLM 재작성의 저비용 추론 시 보호.  
  2022 · Amazon · [Differentially Private Decoding in Large Language Models](https://arxiv.org/abs/2205.13621)

- Private Evolution의 DP 합성 텍스트로 훨씬 낮은 비용에 기기 내 학습을 대체한다. | DP 합성 텍스트가 연합학습 유용성에 필적할 수 있음을 보인다.  
  2024 · Meta (with CMU) · [PrE-Text: Training Language Models on Private Federated Data in the Age of LLMs](https://arxiv.org/abs/2406.02958)

- 합성 이메일 임베딩을 DP로 기기 내 데이터와 매칭하고 집계 신호만 외부로 보낸다. | 개인정보를 보호하는 합성 텍스트 선별의 운영 사례.  
  2025 · Apple · [Understanding Aggregate Trends for Apple Intelligence Using Differential Privacy (research blog)](https://machinelearning.apple.com/research/differential-privacy-aggregate-trends)

- DP 알고리즘·벤치마크가 내장된 빠른 비공개 연합학습 시뮬레이터. | 익명화와 함께 연합 공유를 제공할 경우에 참고.  
  2024 · Apple · [pfl-research: simulation framework for accelerating research in Private Federated Learning](https://arxiv.org/abs/2404.06430)

- 부분 임베딩 갱신과 LoRA로 DP 잡음을 줄여 큰 어휘의 언어 모델을 기기에서 비공개 학습한다. | 기기 내 DP 언어 모델 학습 참고 연구.  
  2022 · Apple · [Training Large-Vocabulary Neural Language Models by Private Federated Learning for Resource-Constrained Devices](https://arxiv.org/abs/2207.08988)

- 비공개 학습 모델에서 토크나이저를 구축해 추가 보호 비용을 피한다. | 어휘 자체도 PII를 유출할 수 있음을 보인다.  
  2022 · Apple · [Training a Tokenizer for Free with Private Federated Learning](https://arxiv.org/abs/2203.09943)

- 사용자 단위 DP로 비공개 말뭉치의 다수 n-gram을 공개한다(DP 집합 합집합의 일반화). | 구문 사전·대체값 어휘의 안전한 공개.  
  2021 · Microsoft · [Differentially Private n-gram Extraction](https://arxiv.org/abs/2108.02831)

- CLIP은 캡션에 없는 개별 학습 이미지의 사물도 기억한다. 텍스트 무작위화가 도움이 된다. | 사진 확장: 캡션 수준 PII를 넘어 이미지가 정보를 유출한다.  
  2024 · Meta · [Déjà Vu Memorization in Vision–Language Models](https://arxiv.org/abs/2402.02103)

- 데이터셋 상관관계를 이용한 단순 분류기로 단일 모델의 암기를 검사한다. | 이미지 공개의 저비용 암기 감사.  
  2025 · Meta · [Measuring Déjà vu Memorization Efficiently](https://arxiv.org/abs/2504.05651)

- f-DP 곡선으로 한 번의 학습에서 경험적 개인정보 보호 감사를 수행한다. | 저비용 경험적 감사 기법.  
  2024 · Meta · [Auditing f-Differential Privacy in One Run](https://arxiv.org/abs/2410.22235)

- Rényi DP와 Fisher 정보 유출로 표본별 추정을 포함한 복원 오차 경계를 구한다. | 보고서의 레코드별 위험 점수 아이디어.  
  2022 · Meta · [Bounding Training Data Reconstruction in Private (Deep) Learning](https://arxiv.org/abs/2201.12383)

- 의료 연합학습의 기울기에서 현실적인 이미지 유출을 측정한다. | 병원에서 연합학습도 익명화 없이는 유출될 수 있다.  
  2022 · NVIDIA · [Do Gradient Inversion Attacks Make Federated Learning Unsafe?](https://arxiv.org/abs/2202.06924)

- 국제 의료 컨소시엄에서 사용하는 Intel 연합학습 프레임워크. | Maskara와 경쟁하거나 결합할 데이터 공유 대안.  
  2021 · Intel · [OpenFL: An open-source framework for Federated Learning](https://arxiv.org/abs/2105.06413)

- 구문 구조, 발화의 두 단계 DP 생성으로 비공개 합성 사용자 질의를 만든다. | 구조를 먼저 생성하는 DP 텍스트 합성 아이디어.  
  2022 · Microsoft · [Privacy-Preserving Domain Adaptation of Semantic Parsers](https://arxiv.org/abs/2212.10520)


## 아시아 연구실: 한국, 중국, 일본, 싱가포르

25편. 관련성이 높은 순서.

- 질의의 민감 구간을 찾아 대체한 후 클라우드 LLM에 보내고 답에서 원본을 복원한다. 중·영 데이터 5만 7천 건을 제공한다. | 우리 대체·복원 파이프라인과 유사하며 중국어 평가 데이터로 활용 가능.  
  2025 · Ant Group · [PRIV-QA: Privacy-Preserving Question Answering for Cloud Large Language Models](https://arxiv.org/abs/2502.13564)

- 소형 로컬 ‘Hide’ 모델이 프롬프트를 익명화하고 로컬 ‘Seek’ 모델이 클라우드 답변에 실제 개체를 복원한다. | 복원 가능한 로컬 대체. 후속 HaS 모델은 한국어·일본어·중국어를 지원한다.  
  2023 · Yu Chen, T. Li, H. Liu, Y. Yang (연구실 미확인; HaS model listed under `xuanwulab` on Hugging Face) · [Hide and Seek (HaS): A Lightweight Framework for Prompt Privacy Protection](https://arxiv.org/abs/2309.03057)

- 한국어 고유 PII 범주를 갖춘 대화 데이터셋. 언어 모델은 공통 PII보다 한국어 특유 PII에서 성능이 훨씬 낮다. | GLiNER2·정규식 탐지기의 한국어 벤치마크.  
  2024 · Yonsei Univ (Hansaem Kim lab) · [KDPII: A New Korean Dialogic Dataset for the Deidentification of Personally Identifiable Information (IEEE Access 12)](https://zenodo.org/records/16759166)

- 최초로 주석된 한국어 판결문 데이터셋, PII 범주 체계, 종단간 신경망 비식별화 파이프라인. | 한국어 법률 PII 범주와 평가 데이터.  
  2025 · Seoul National Univ* (Jaejin Lee group) · [Thunder-DeID: Accurate and Efficient De-identification Framework for Korean Court Judgments](https://aclanthology.org/2025.findings-emnlp.682)

- 39개 법률 분야의 대규모 한국어 판결문 벤치마크. KLUE-BERT-CRF의 개체 micro-F1은 0.992다. | 비교할 강력한 경량 한국어 기준 모델.  
  2026 · 한국 연구팀 (연구실 미검증) · [K-LegalDeID: A Benchmark Dataset and KLUEBERT-CRF for De-identification in Korean Court Judgments](https://aclanthology.org/2026.eacl-long.103)

- 일본 APPI의 ‘요배려 개인정보’를 LLM으로 주석한 데이터셋과 분류기를 구축한다. | 이름·ID를 넘어서는 일본의 민감 속성 범주.  
  2026 · Minamoto, Oda, Kawahara (Waseda/NII*) · [Detecting Sensitive Personal Information in Japanese Pre-Training Corpora for Large Language Models](https://arxiv.org/abs/2606.12114)

- 표본 2,842개와 PII 55종. 모델은 PII를 잘 찾지만 질의에 실제로 필요한 PII는 잘 판단하지 못한다. | 벤치마크와 ‘관련 없는 정보만 마스킹’하는 아이디어.  
  2025 · Fudan* (Weili Han group) · [PII-Bench: Evaluating Query-Aware Privacy Protection Systems](https://arxiv.org/abs/2502.18545)

- 일본 임상 데이터셋 3개에서 규칙·CRF·LSTM을 비교한다(최고 F1 약 68~84). | 일본 병원 기준 모델과 PHI 태그 집합.  
  2020 · 일본 학계 연구팀 (Kajiyama et al.) · [De-identifying free text of Japanese electronic health records](https://pmc.ncbi.nlm.nih.gov/articles/PMC7504663)

- 경량 TinyBERT의 NER로 중국어 의료 기록을 비식별화한다. | 온프레미스에 적합한 경량 중국어 임상 PII 탐지.  
  2022 · Chongqing Univ + Peking Univ · [An Efficient Method for Deidentifying Protected Health Information in Chinese Electronic Health Records](https://pmc.ncbi.nlm.nih.gov/articles/PMC9472063)

- 단어별 작업 중요도·개인정보 위험을 평가해 위험하고 중요하지 않은 단어만 제거한다. 모바일에서 실행된다. | 계산량이 적은 유용성 인식 정제.  
  2024 · Nanjing Univ* (Hua, Zhong) · [The Fire Thief Is Also the Keeper: Balancing Usability and Privacy in Prompts (ProSan)](https://arxiv.org/abs/2406.14318)

- 미세조정 LLM이 PII를 찾고 재작성으로 식별자·속성 연결을 끊으며 유용성 지표를 제공한다. | 보고서에 추가할 개인정보 보호·유용성 지표.  
  2024 · Xidian Univ · [DePrompt: Desensitization and Evaluation of Personal Identifiable Information in Large Language Model Prompts](https://arxiv.org/abs/2408.08930)

- 민감 단어를 가린 뒤 대리 모델의 기울기 피드백으로 작업은 유지하고 추론은 실패하게 하는 대체값을 고른다. | 후속 작업을 유지하는 대체값 선택.  
  2025 · Shanghai Jiao Tong Univ · [Anti-adversarial Learning: Desensitizing Prompts for Large Language Models (PromptObfus, AAAI 2026)](https://arxiv.org/abs/2505.01273)

- 클라이언트에서 비공개 구간을 삭제하고 서버에서 활성값 조정 벡터로 의미를 복원한다. | 의료·법률 프롬프트에서 대체 방식의 대안.  
  2024 · South China Univ of Technology · [PrivacyRestore: Privacy-Preserving Inference in Large Language Models via Privacy Removal and Restoration (ACL 2025)](https://arxiv.org/abs/2406.01394)

- 클라이언트가 임베딩 층을 실행하고 잡음을 넣은 뒤 서버 출력을 로컬에서 잡음 제거한다. | 텍스트를 외부로 보내야 할 때의 옵션.  
  2024 · NUS* · [Split-and-Denoise: Protect Large Language Model Inference with Local Differential Privacy (ICML)](https://arxiv.org/abs/2310.09130)

- 군집 ‘프로토타입’ 주변에서 단어 표현을 교란해 서버의 원본 단어 복원을 막는다. | 원문 대신 임베딩을 보내도 유출될 수 있음을 보인다.  
  2023 · Fudan Univ · [TextObfuscator: Making Pre-trained Language Model a Privacy Protector via Obfuscating Word Representations](https://aclanthology.org/2023.findings-acl.337)

- 개인이 자기 PII 일부를 모델에 제공해 나머지를 유출하는지 시험한다. | 보고서의 유출 검사 방법.  
  2023 · NAVER AI Lab + Seoul National Univ · [ProPILE: Probing Privacy Leakage in Large Language Models (NeurIPS)](https://arxiv.org/abs/2307.01881)

- 다중 턴 탈옥 프롬프트로 ChatGPT·New Bing의 개인정보를 추출한다. | 원본 PII를 클라우드 LLM에서 멀리해야 하는 이유.  
  2023 · HKUST · [Multi-step Jailbreaking Privacy Attacks on ChatGPT](https://arxiv.org/abs/2304.05197)

- 실제 공격으로 개인정보 보호 언어 모델을 비교하는 공통 파이프라인. | 보고서의 공격 기반 평가 설계.  
  2024 · HKUST + Peking Univ (+Amazon) · [PrivLM-Bench: A Multi-level Privacy Evaluation Benchmark for Language Models](https://aclanthology.org/2024.acl-long.4)

- 세분화된 PII 라벨의 중국 법률 데이터셋. 한 연합 클라이언트가 다른 클라이언트 PII의 최대 56.6%를 복구한다. | 미세조정 전 익명화 필요성과 중국어 PII 라벨 체계.  
  2025 · Zenglin Xu group (연구실 미검증) · [Simple Yet Effective: Extracting Private Data Across Clients in Federated Fine-Tuning of Large Language Models](https://arxiv.org/abs/2506.06060)

- 목표 시퀀스에 기울기 상승을 적용해 재학습 없이 모델이 해당 내용을 잊게 한다. | PII가 이미 모델에 들어간 경우의 사후 대응.  
  2023 · KAIST + LG AI Research · [Knowledge Unlearning for Mitigating Privacy Risks in Language Models](https://aclanthology.org/2023.acl-long.805)

- LoRA 미세조정으로 선택한 민감 사실에 ‘모른다’고 답하게 한다. | 파이프라인에 쓰는 로컬 LLM 보강.  
  2023 · Kyoto Univ + RIKEN AIP · [Knowledge Sanitization of Large Language Models](https://arxiv.org/abs/2309.11852)

- 희소 오토인코더 특성으로 PII 유출의 내부 신호를 찾아 억제한다. | PII를 본 로컬 모델의 방어책.  
  2025 · Huawei Munich Research Center · [PrivacyScalpel: Enhancing LLM Privacy via Interpretable Feature Intervention with Sparse Autoencoders](https://arxiv.org/abs/2503.11232)

- 주석 단계에서 모든 PII를 마스킹하는 한국어 LLM 데이터 파이프라인. | 학습 시 PII를 마스킹하는 국내 산업계 관행.  
  2025 · NAVER Cloud · [HyperCLOVA X THINK Technical Report](https://arxiv.org/abs/2506.22403)

- 한국어 대화에 일반 개체와 PII 개체를 모두 표시해 비교한다. | 일반 NER가 한국어 PII를 놓치는 이유.  
  2024 · Sookmyung Women's Univ · [한국어 일반 개체명과 개인정보 특화 개체명 비교 연구 (Korean general vs. privacy-specific named entities)](https://scholarworks.sookmyung.ac.kr/item/ad945639-8f5b-4a67-bfc8-9718ba440f13)

- 로컬 Qwen3-30B로 한국어 데이터를 정제했다. 정규식만 쓴 첫 시도는 거짓 양성률 91%였다. | 한국어에서 정규식 단독 방식이 실패한 실제 사례.  
  2026 · 연구실 미검증 · [TIDES: A Longitudinal Bilingual Dataset for Modeling Multi-Party Social Dynamics](https://arxiv.org/abs/2608.01724)


## 멀티모달: 얼굴, 음성, 문서 — 향후 확장

38편. 관련성이 높은 순서.

- 사람을 탐지하고 전신·얼굴을 GAN이 만든 사실적인 대체 이미지로 바꾼다. 공개 도구 모음이다. | 사진 확장에 바로 쓸 공개 기준 모델.  
  2023 · NTNU · [DeepPrivacy2: Towards Realistic Full-Body Anonymization (WACV)](https://openaccess.thecvf.com/content/WACV2023/html/Hukkelas_DeepPrivacy2_Towards_Realistic_Full-Body_Anonymization_WACV_2023_paper.html)

- DensePose 신체 표면 지도로 생성을 유도해 자세·형태를 유지한다. | 얼굴뿐 아니라 사람 전체를 대체한다.  
  2023 · NTNU · [Realistic Full-Body Anonymization with Surface-Guided GANs (WACV)](https://openaccess.thecvf.com/content/WACV2023/html/Hukkelas_Realistic_Full-Body_Anonymization_With_Surface-Guided_GANs_WACV_2023_paper.html)

- GAN 잠재 코드를 최적화해 속성은 유지하며 얼굴 정체성을 바꾼다. 추가 학습이 필요 없다. | 대체 후 유용성을 유지하는 설계의 얼굴 버전.  
  2023 · QMUL + Trento · [Attribute-Preserving Face Dataset Anonymization via Latent Code Optimization (FALCO, CVPR)](https://openaccess.thecvf.com/content/CVPR2023/html/Barattin_Attribute-Preserving_Face_Dataset_Anonymization_via_Latent_Code_Optimization_CVPR_2023_paper.html)

- 재구성만으로 학습한 확산 모델이며 설정 하나로 익명화 강도를 조절한다. 랜드마크·마스크가 필요 없다. | 로컬 배포를 위한 단순하고 조절 가능한 얼굴 대체.  
  2024 · Trento + Oulu + NUS · [Face Anonymization Made Simple (WACV 2025)](https://arxiv.org/abs/2411.00762)

- 이미지를 잡음으로 역변환한 후 정체성 임베딩을 바꿔 재생성한다. 특정 얼굴 영역을 선택할 수 있다. | 학습이 불필요해 온프레미스 실행 비용이 낮다.  
  2025 · Trento + Oulu + NUS · [NullFace: Training-Free Localized Face Anonymization](https://arxiv.org/abs/2503.08478)

- 학습 시 정체성과 다른 특성을 분리해 잔존 신원 유출을 줄인다. | 대체 얼굴의 재식별 위험 감소.  
  2025 · Yang et al. (연구실 미검증) · [Beyond Inference Intervention: Identity-Decoupled Diffusion for Face Anonymization](https://arxiv.org/abs/2510.24213)

- StyleGAN 잠재공간의 정체성을 비밀번호로 암호화한다. 같은 비밀번호면 같은 가짜 얼굴이며 올바른 비밀번호로 복원한다. | 키 기반의 일관된 얼굴: ‘한 사람 = 하나의 가상 인물’의 시각 버전.  
  2023 · Chinese Academy of Sciences (CASIA)* · [RiDDLE: Reversible and Diversified De-identification with Latent Encryptor (CVPR)](https://arxiv.org/abs/2303.05171)

- 조건부 GAN으로 이미지·영상의 얼굴·신체를 제어 가능한 목표 정체성으로 바꾼다. | 정체성 선택 제어는 개인당 가상 인물 매핑에 적합하다.  
  2020 · TUM · [CIAGAN: Conditional Identity Anonymization Generative Adversarial Networks (CVPR)](https://arxiv.org/abs/2005.09544)

- 조건부 GAN으로 자세·배경을 유지하며 얼굴을 바꾼다. | 기초적인 얼굴 대체 방법.  
  2019 · NTNU · [DeepPrivacy: A Generative Adversarial Network for Face Anonymization](https://arxiv.org/abs/1909.04538)

- 블러는 학습 모델 성능을 크게 떨어뜨리지만 사실적인 대체의 손실은 작고 얼굴에서 특히 작다. | 이미지에서도 ‘삭제보다 대체’의 근거.  
  2023 · NTNU · [Does Image Anonymization Impact Computer Vision Training? (CVPRW)](https://arxiv.org/abs/2306.05135)

- 순전파 신경망으로 실시간 영상의 자세·조명·표정은 유지하고 정체성을 바꾼다. | 빠른 영상 얼굴 익명화.  
  2019 · Facebook AI + Tel Aviv · [Live Face De-Identification in Video (ICCV)](https://arxiv.org/abs/1911.08348)

- 확산 인페인팅으로 새 얼굴을 만들고 시간적 일관성이 있는 얼굴 교체로 영상 전체에 적용한다. | 모든 영상 프레임에서 같은 가짜 정체성 유지.  
  2025 · CTU Prague · [BLANKET: Anonymizing Faces in Infant Video Recordings](https://arxiv.org/abs/2512.15542)

- 확산 오토인코더로 프레임 간 하나의 가짜 정체성을 일관되게 유지한다. | 우리의 일관성 목표를 영상에 적용한 사례.  
  2024 · UTS · [Identity-Consistent Video De-identification via Diffusion Autoencoders (BMSB)](https://opus.lib.uts.edu.au/handle/10453/180726)

- 별도의 자세·표정 추출기 없이 합성 정체성을 생성하고 프레임 간 일관성을 유지한다. | 한국 연구실의 합성 얼굴 정체성 연구.  
  2024 · Kyungpook National Univ* · [IDDiffuse: Dual-Conditional Diffusion Model for Enhanced Facial Image anonymization (title truncated in source; ACCV)](https://research.knu.ac.kr/en/publications/iddiffuse-dual-conditional-diffusion-model-forenhanced-facial-ima)

- 기성 얼굴 교체 모델로 자연스럽게 연결되고 신원을 숨기는 영상 익명화를 수행한다. | 일관된 영상 가상 인물을 얻는 저비용 방식.  
  2025 · İTÜ* (Ekenel) · [Assessing the Use of Face Swapping Methods as Face Anonymizers in Videos (DSP)](https://arxiv.org/abs/2505.20985)

- 공개 FasterRCNN 얼굴·번호판 탐지기, 블러, 공정성 분석을 제공한다. | 얼굴·사진 확장에 바로 쓸 탐지 기준 모델.  
  2023 · Meta · [EgoBlur: Responsible Innovation in Aria](https://arxiv.org/abs/2308.13093)

- 텍스트를 제거해도 남은 글자 간격으로 가린 이름을 복구한다. Acrobat 등 도구 11개가 영향을 받는다. | PDF 출력은 상자만 그리지 말고 글리프 위치를 재구성해야 한다.  
  2023 · UIUC · [Story Beyond the Eye: Glyph Positions Break PDF Text Redaction (PoPETs)](https://petsymposium.org/popets/2023/popets-2023-0069.php)

- 문서 이미지 500장과 약 1만 2천 PII 라벨. 도구를 쓰는 최상위 모델도 대부분 페이지에 유출을 남긴다. | 스캔 문서 확장의 페이지별 유출 지표.  
  2026 · 연구실 미검증 · [LeakageBench: Document-Level Leakage Risk for Redacting Personally Identifiable Information in Document Images](https://arxiv.org/abs/2609.02207)

- 비전·언어 OCR의 이미지 토큰을 가려도 환자정보가 유출되고 OCR 후 삭제만으로는 일부를 놓친다. | 병원 문서의 비전 LLM OCR 단계에 대한 경고.  
  2025 · 연구실 미검증 · [Vision Token Masking Alone Cannot Prevent PHI Leakage in Medical Document OCR: A Systematic Evaluation](https://arxiv.org/abs/2511.18272)

- 이미 익명화된 대응 참조 양식을 찾아 동일 유형 새 문서에 가림 패턴을 복사한다. | 템플릿 기반 스캔 양식 익명화.  
  2025 · 연구실 미검증 · [Anonymization of Documents for Law Enforcement with Machine Learning](https://arxiv.org/abs/2501.07334)

- 실제 빈 양식에 가짜 데이터를 채워 레이아웃은 실제이고 내용은 가짜다. | 우리 가상 인물처럼 가짜지만 사실적인 문서 채우기.  
  2026 · 연구실 미검증 · [RealDocBench: A Benchmark for Field-Level QA and Layout Understanding on Real-World Regulated Documents](https://arxiv.org/abs/2606.07401)

- 음성 인식+강제 정렬+NER로 PII 음성 구간을 무음으로 바꾼다. | 오디오 발화 내용 삭제의 기본 파이프라인.  
  2022 · ÉTS Montreal* (Baril, Cardinal, Koerich) · [Named Entity Recognition for Audio De-Identification](https://arxiv.org/abs/2204.12622)

- 고객이 PII 개체를 말하기 시작하면 통화 음성을 실시간 마스킹한다. | 은행과 관련 있는 콜센터 활용 사례.  
  2023 · 연구실 미검증 · [Trustera: A Live Conversation Redaction System](https://arxiv.org/abs/2303.09438)

- 표준 과제·데이터·공격 모델·스크립트로 단어·감정은 유지하고 화자 정체성을 숨긴다. | 음성 익명화에 바로 쓸 평가 규약.  
  2024 · Inria, EURECOM et al. · [The VoicePrivacy 2024 Challenge Evaluation Plan](https://arxiv.org/abs/2404.02677)

- 첫 챌린지의 기준 모델·공격자 모델·객관적 지표·청취 평가 결과. | 음성 개인정보 보호 지표의 배경.  
  2021 · Inria, EURECOM et al. · [The VoicePrivacy 2020 Challenge: Results and Findings (Computer Speech and Language)](https://arxiv.org/abs/2109.00648)

- 익명화 음성의 화자를 재식별하는 공격 시스템을 동일 오류율(EER)로 평가한다. | 우리 연결 공격 검사의 음성 버전.  
  2024 · VoicePrivacy organizers · [First VoicePrivacy Attacker Challenge](https://arxiv.org/abs/2410.07428)

- 화자 임베딩을 무작위 화자들의 평균으로 바꾼 뒤 음성을 재합성한다. | 초기 가상 화자 교체로 가상 인물의 음성 버전.  
  2019 · NII Japan + EURECOM · [Speaker Anonymization Using X-vector and Neural Waveform Models (SSW)](https://arxiv.org/abs/1905.13561)

- 양자화 신경 코덱 토큰으로 화자 정체성을 걸러 재합성한다. 이후 VPC 2024 기준 모델이 되었다. | 로컬 실행 가능한 현대적 음성 교체 옵션.  
  2024 · EURECOM + Microsoft · [Speaker anonymization using neural audio codec language models (ICASSP)](https://arxiv.org/abs/2309.14129)

- 영어 전용 ASR 대신 자기지도 음성 특성을 사용하며 영어·중국어로 평가했다. | 영어 외 언어에도 작동하므로 한·중·일 음성과 관련.  
  2022 · NII Japan · [Language-independent Speaker Anonymization Approach Using Self-supervised Pre-trained Models (Odyssey)](https://arxiv.org/abs/2202.13097)

- 학습한 회전으로 화자마다 구별되는 언어 중립적 가상 화자를 매핑한다. | 개인마다 구별되는 하나의 가상 음성.  
  2023 · NII Japan + Inria · [Speaker Anonymization Using Orthogonal Householder Neural Network (TASLP)](https://arxiv.org/abs/2305.18823)

- 도메인 밖 음성에서는 출력이 왜곡되며 보코더와 가상 화자 벡터가 주원인이다. | 실제 은행·병원 녹음의 강건성에 대한 교훈.  
  2022 · NII Japan · [Analyzing Language-Independent Speaker Anonymization Framework under Unseen Conditions (Interspeech)](https://www.isca-archive.org/interspeech_2022/miao22_interspeech.html)

- 무작위 가중치를 준 화자들의 자기지도 특성을 섞어 구별되는 가상 음성을 만든다. | 익명화 후에도 사람마다 다른 목소리를 유지한다.  
  2023 · NWPU* (Lei Xie) · [SALT: Distinguishable Speaker Anonymization Through Latent Space Transformation (ASRU)](https://arxiv.org/abs/2310.05051)

- VPC 기준 모델보다 적은 계산으로 화자 특성을 가상 도메인으로 옮긴다. | 온프레미스 음성 익명화의 계산량 절감.  
  2023 · NICT/Japan* · [Reprogramming Self-supervised Learning-based Speech Representations for Speaker Anonymization (MM Asia)](https://arxiv.org/abs/2311.10664)

- GAN이 만든 인공 화자 임베딩을 음성→텍스트→음성 파이프라인에 사용한다. | 합성 가상 인물에 대응하는 합성 음성 정체성.  
  2022 · Univ of Stuttgart (IMS) · [Anonymizing Speech with Generative Adversarial Networks to Preserve Speaker Privacy (SLT)](https://arxiv.org/abs/2210.07002)

- 음높이·에너지를 무작위 오프셋과 함께 복사해 자연스러움은 유지하고 정체성을 바꾼다. | 익명화 음성의 유용한 운율을 보존한다.  
  2023 · Univ of Stuttgart (IMS) · [Prosody Is Not Identity: A Speaker Anonymization Approach Using Prosody Cloning (ICASSP)](https://doi.org/10.1109/ICASSP49357.2023.10096607)

- 감정 손실의 주원인은 취약한 중간 표현이다. | 임상 음성 등 감정이 중요한 경우의 유용성 검사.  
  2025 · FAU Erlangen* (Gaznepoglu, Peters) · [Why disentanglement-based speaker anonymization systems fail at preserving emotions? (ICASSP)](https://arxiv.org/abs/2501.13000)

- GAN으로 만든 가짜 화자 프로필을 낮은 지연으로 주입하는 스트리밍 익명화. | 실시간 통화의 음성 옵션.  
  2025 · Texas A&M* · [DarkStream: real-time speech anonymization with low latency (ASRU)](https://arxiv.org/abs/2509.04667)

- VLM이 여러 모달리티에서 한 사람의 비공개 정보를 연결·추론하는 능력을 평가한다. | 우리 연결 보고서와 맞닿는 교차 모달 연결 위험.  
  2025 · 연구실 미검증 · [MultiPriv: Benchmarking Individual-Level Privacy Reasoning in Vision-Language Models](https://arxiv.org/abs/2511.16940)


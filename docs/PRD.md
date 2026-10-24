# PRD — Handover (노하우 팩 마켓 + 매칭)

Ambition for Korea 해커톤 · 2026-10-24 · 주제 5 "AI로 사라질 직업 1000만 명을 구할 제품" · 기획서 v3 기준
한 줄: Handover — 사라질 직업의 노하우를 Claude가 인계서로 뽑아 블라인드 카드로 기업·AI와 매칭하고, 팩 판매·건당 호출·채용까지 잇는 노하우 팩 마켓
화면 문구·가격은 영어·USD. 이 문서는 한국어.

## 1. 첫 고객과 문제
- **판매자:** 필리핀 마닐라 BPO의 감원 대상 상담원. 5년 쌓은 판단이 이력서에 "Customer Service Representative, 5 years" 한 줄로 남는다. 판단을 증명할 자료(회사 로그)는 합법적으로 들고 나올 수 없다.
- **구매자 ①** 상담 AI 운영 기업(Sierra·Decagon·Intercom Fin 급 벤더 또는 자체 운영사): AI가 못 푼 케이스를 넘길 사람이 필요한데, 그 사람들이 지금 해고되는 중.
- **구매자 ②** AI 평가 데이터 회사(Mercor·Surge 급): 전문가 시간은 사지만 현장 판단(상담 AI가 틀리기 쉬운 지점)의 소스가 없다.
- 수치(출처 있는 것만): 미국 상담원 1년 새 130,180명(4.8%) 감소(BLS OEWS, 2025.5) / 필리핀 BPO 190만 명, 2028 고용 목표 250만 → 185만~214만 하향(IBPAP) / 기업 전직 지원비 1인당 약 $1,660(IBISWorld 2026). 수요 측 단가·미해결률은 **미확인**.

## 2. MVP 범위

### P0 (반드시 돌아가야 함)
| # | 기능 | 화면 | API |
|---|---|---|---|
| 1 | 인터뷰 폼: 직무·경력 + 시드 4문항 + 본인 메모(선택). 회사 로그 붙여넣기 거부(안내 문구 + 서버 거부) | 화면 1 | POST /api/sellers, POST /api/interviews |
| 2 | Claude 꼬리질문 2~3개 → 응답 입력 | 화면 1 | (위 응답) |
| 3 | 봉인: Claude 추출·일반화 → 인계서(봉인) + 블라인드 카드 생성. 판매자 본인은 인계서 열람 | 화면 1 | POST /api/interviews/{id}/seal, GET /api/packs/{id}/note |
| 4 | 블라인드 카드 목록 | 화면 2 | GET /api/cards |
| 5 | 수요문 입력 → Claude 매칭 상위 3 + 이유 | 화면 2 | POST /api/buyers, POST /api/requests |
| 6 | Sealed Q&A: 카드에 질문 → 원문 안 열고 답 + "Based on 3 of 22 sealed items" | 화면 2 | POST /api/cards/{id}/ask |
| 7 | 구매(목업 결제) → 인계서 열람 | 화면 2 | POST /api/packs/{id}/purchase, GET /api/packs/{id}/note |
| 8 | "What Claude did" 패널: 실측 6개 | 화면 3 | GET /api/packs/{id}/trace |

### P1 (시간 남으면)
- 가격 표시: 팩 `clamp(item_count×7, 49, 499)`, 건당 `8 + rarity×3` — 서버 상수, 화면에 표시만
- 수입 경로 3개 상태 칩(Pack · Overflow · Hire)
- Sealed Q&A 구매 전 3회 제한

### 데모용 목업(정적 화면, 동작 없음)
- "Route cases to this expert"(Overflow 라우팅) 화면
- "Send hiring offer"(Hire) 화면
- 일본어 토글
- 판매자 Revival Record

### 제외
- 실결제, 로그인·계정, 알림, 실제 벤더 연동, Claude 가격 산정 호출, 추적 기능 일체

## 3. 데모 장면
직무 입력("Telecom billing CSR, 5 yrs") → 시드 4문항 답변 → Claude가 2개 더 묻는다 → 답변 → **약 60초**(실측) → 인계서 N항목(희소 판단 M개, 일반화 고유명사 K개)과 블라인드 카드 1장 → 구매자 화면에서 "Our AI can't resolve roaming disputes after a mid-cycle plan change"를 적으면 카드 3장 매칭 → 1번 카드에 "What do you do at day 58 of the loyalty window?"를 물으면 **원문 안 열고 답이 나온다** ("Based on 3 of 22 sealed items") → Unlock $149(목업) → 인계서 열림 → What Claude did 패널에 숫자 6개 → "이 사람은 어제 해고됐고, 회사 데이터 한 줄 없이 오늘 첫 매물이 올라갔다."

심사위원이 눈으로 볼 숫자: 인터뷰 → 카드 등록 초 / 인계서 항목 수 / 희소 판단 비율 / 일반화한 고유명사 수 / 매칭 초 / Sealed Q&A 응답 초.

## 4. AI가 하는 일 (입력 → Claude → 출력)

| # | 단계 | 입력 | Claude | 출력 | 보조(코드) |
|---|---|---|---|---|---|
| ① | 꼬리질문 | 직무·경력·시드 4답변·메모 | 매뉴얼 지식 vs 희소 판단 구분, 숫자·상황·근거가 빠진 희소 쪽을 겨냥해 질문 2~3개 | `followup_questions[]` | 호출 전 입력 검사(40자 미만·2,500자 초과·대화 패턴·타임스탬프·PII) → 거부 |
| ② | 추출·일반화·카드 | ① 입력 + 꼬리질문 응답 | Rules / Exceptions / Judgment calls / Common mistakes / Never do 구조화(항목마다 rare/manual, 출처 문항). 회사·시스템·고객·사람·지명을 일반어로 치환하고 로그. 카드의 field·difficulty·rarity·one_liner 산정 | 인계서 JSON(봉인) · 일반화 로그 · 카드 | 정규식 PII 1차 마스킹, 항목 집계, 가격 상수 |
| ③ | 매칭 | 수요문 + 카드 공개 필드·항목 수(원문 없음) | 수요와 카드 대조, 상위 3개에 점수·이유 1줄 | `matches[]` | DB 조회·저장 |
| ④ | Sealed Q&A | 질문 + 카드 + 봉인 인계서(서버만) | 인계서 근거로만 답. 근거 항목 id. 없으면 covered=false | 답 + 근거 수 | 응답에 원문·항목 내용 제거 |

(로드맵, MVP 제외) ⑤ Overflow 라우팅 ⑥ 일본어 번역 ⑦ Claude 가격 산정

## 5. 심사 기준과의 연결 — "같은 자원으로 얼마나 높은 가치를 만드는가"
| | 자원 | 산출 |
|---|---|---|
| 지금 | 경력 5년 + 전직 지원비 $1,660 | 이력서 1부. 판단 소멸. 로그 들고 나오면 불법 |
| Handover | 같은 경력 + 인터뷰 15분 + Claude 약 60초 | 봉인 인계서 + 블라인드 카드 + 열지 않고 검증(Sealed Q&A) + 수요 매칭 + 수입 경로 3개 |

실측 6개는 `GET /api/packs/{id}/trace`에서 그대로 나온다. 데모는 실시간 호출로 하고, 숫자는 화면 3에 띄운다.

## 6. 확장 후보 (MVP 검증 뒤, 지시 시 하나씩)
1. 출력: Pack → Overflow(건당 호출, 수익 중심) → Hire → Enterprise 피드
2. 직군: 상담 → 회계 보조 → 번역 검수 → 보험 심사 보조 → 접수·백오피스 (입력이 인터뷰라 코드 동일)
3. 매물: 노하우 팩 → 멈춘 앱·기획 메모·AI 아트 작업
4. 나라: 필리핀·미국 → 한국 → 일본(번역) → 인도

## 7. 화면 3개 문구 (영어)

**화면 1 — Interview (판매자)**
- H1 "Turn what you know into something that sells." / sub "No company data needed."
- Fields: Your role & years · Language (EN/KO) · (optional) Your own notes & checklists
- Q1 "What the manual never said" · Q2 "What new hires always get wrong" · Q3 "A request you refused, and why" · Q4 "A case the script couldn't solve" — 각 placeholder "Be specific: numbers, dates, what you decided and why."
- 경고(상시 노출): "Don't paste call logs or customer records — we'll reject them. We only need your judgment."
- 버튼 "Ask me more" → 꼬리질문 2~3 → 버튼 "Seal my Handover Note"
- 완료: 카드 미리보기 + "Your note is sealed. Buyers see only this card." + 링크 "Read my note"
- 거부 메시지: `TOO_SHORT` "Give us a bit more — at least a few sentences per question." / `LOG_PASTE_SUSPECTED` "This looks like a call log. Please describe it in your own words." / `PII_DETECTED` "Please remove names, emails and phone numbers."

**화면 2 — Match (구매자)**
- 상단 입력 "What can't your AI solve?" · 구매자 유형 토글 "AI ops / Eval data" · 버튼 "Find packs"
- 매칭 카드 3장: Field · EN · 5 yrs · Difficulty 4/5 · Rarity 4/5 · "$149 pack · $15/case" · Listed 2026-10-24 · 이유 1줄
- 카드 패널: "Ask this pack" 입력 → 답 + "Based on 3 of 22 sealed items" / 미해당 "This pack doesn't cover that."
- 버튼: "Unlock full note $149" (목업 결제 → 인계서) · "Route cases to this expert" (목업) · "Send hiring offer" (목업)
- 인계서 열람: 5개 섹션, 항목에 rare/manual 배지, 하단 "Generalized: the carrier ×2, the billing system ×3"

**화면 3 — What Claude did (심사용)**
- Follow-up questions N · Note items N (rare M · manual K) · Generalized names N (company 2 · system 3 …) · Match N s · Sealed Q&A N s · Total N s · Model

## 8. 입력 목 데이터 명세 (민수 담당, `mock/` 폴더, JSON)

| 종류 | 개수 | 파일 | 형식 | 케이스 |
|---|---|---|---|---|
| 판매자 샘플 인터뷰 | 5 | `mock/sellers/{slug}.json` | `{seller:{role_title,years_experience,language}, seed_answers:{q1..q4}, notes, followup_answers:{f1,f2}}` | 통신 상담 EN · 전자상거래 CS EN · 한국 통신 상담 KO · 회계 보조 EN · 병원 접수 EN. **각 답변에 숫자·예외·거절 사례 필수**, 답변당 150~600자 |
| 깨진 입력 | 3 | `mock/broken/{slug}.json` | 위와 같은 형식 | 한 줄 응답(→TOO_SHORT) · 로그 붙여넣기 시도(Agent:/Customer: 10줄 + 타임스탬프 →LOG_PASTE_SUSPECTED) · 회사명·시스템명 가득(→통과하되 generalized_count ≥ 5) |
| 구매자 수요문 | 3 | `mock/requests.json` | `[{buyer_type, request_text}]` | ai_ops 통신 로밍 분쟁 · ai_ops 전자상거래 환불 · eval_data "상담 AI가 틀리기 쉬운 지점" |
| Sealed 질문 | 6 | `mock/sealed_questions.json` | `[{card_slug, question, expect_covered}]` | 통신 팩에 해당 3(covered=true) · 비해당 2(false) · 모호 1 |
| 시드 스크립트 | 1 | `scripts/seed.ts` | tsx | 위 5개 샘플을 API로 흘려 넣어 카드 5장 생성(Claude 실호출). `npm run seed` |

## 9. 가정과 미정 사항
- 스택 가정: Next.js 16 App Router + Tailwind v4 + Supabase Postgres(service role, 서버 전용) + `@anthropic-ai/sdk` + zod. 패키지 메이저 버전(SDK 0.52 vs 1.x, zod 3 vs 4)은 **미정** — 처음 설치하는 사람이 `package-lock.json`을 커밋하면 그걸 따른다.
- 모델: `ANTHROPIC_MODEL` 환경변수, 기본 `claude-sonnet-5-5`. 키는 `.env.local`의 `ANTHROPIC_API_KEY`(커밋 금지).
- 인증 없음: `x-seller-id` / `x-buyer-id` 헤더, 데모용. RLS 미설정.
- 가격은 상수(팩 `clamp(item_count×7,49,499)`, 건당 `8+rarity×3`). 기획서의 가격대($49~499, $8~25)에 맞춘 임의 공식.
- 거부 임계값(40자·2,500자·3줄·타임스탬프 3·PII 2)은 샘플 돌려보고 조정.
- 미정: Sealed Q&A 횟수 제한 적용 여부 / 거부된 인터뷰 행 보존 여부 / SDK usage 필드명.
- 기획서와 충돌 없음. 기획서 "Claude 호출 4개"와 본 문서 ①~④ 일치.

# API 명세 — Handover MVP

Next.js 16 Route Handlers, 경로 접두 `/api`. 요청·응답 JSON. 화면 문구·값은 영어·USD.
인증 없음. `x-seller-id` / `x-buyer-id` 헤더로 주체를 구분한다(데모용).

공통 에러 형식
```json
{ "error": { "code": "LOG_PASTE_SUSPECTED", "message": "This looks like a call log. We only need your own judgment — please describe it in your words.", "field": "seed_answers.q4" } }
```
공통 코드: `VALIDATION_ERROR` 400 · `NOT_FOUND` 404 · `FORBIDDEN` 403 · `CLAUDE_FAILED` 502 (Claude 응답이 스키마 검증 실패, 1회 재시도 후)

**봉인 규칙:** `handover_note`는 **`GET /api/packs/{id}/note`에서만** 응답한다. 아래 다른 어떤 응답에도 이 필드가 없다.

---

## 판매자 화면 (화면 1 — Interview)

### POST /api/sellers
판매자 가명 생성. 응답 id를 `x-seller-id`로 보관.
```json
// 요청
{ "role_title": "Telecom billing CSR", "years_experience": 5, "language": "EN", "display_name": "Seller #0427" }
// 응답 201
{ "id": "8f1c…", "role_title": "Telecom billing CSR", "years_experience": 5, "language": "EN", "display_name": "Seller #0427" }
```
| 응답 필드 | 출처 |
|---|---|
| 전부 | sellers.* |

### POST /api/interviews
시드 4문항(+메모) 저장 → 입력 검사 → **Claude ① 꼬리질문** → 질문 반환.
```json
// 요청 (헤더 x-seller-id)
{
  "seed_answers": {
    "q1": "The manual says 'offer the loyalty credit' but it only works if the customer hasn't changed plans in the last 60 days…",
    "q2": "New hires always reset the billing cycle when a customer asks about proration. That doubles the charge…",
    "q3": "I refused a retroactive roaming waiver for a customer who had turned data roaming on himself…",
    "q4": "A customer on a family plan moved abroad mid-cycle; the script had no branch for…"
  },
  "notes": "My own checklist: 1) check plan change date 2) check roaming toggle history 3) …"
}
// 응답 201
{
  "id": "2b9e…", "status": "draft",
  "followup_questions": [
    { "id": "f1", "question": "In the 60-day loyalty credit case, what did you do when the customer was at day 58?", "target": "rare" },
    { "id": "f2", "question": "For the family plan abroad case, what exact numbers (days, amounts) did you use to decide?", "target": "detail" }
  ],
  "run": { "kind": "followup", "duration_ms": 4120, "question_count": 2 }
}
```
입력 검사 (Claude 호출 전, 서버에서)
| 조건 | 코드 | HTTP |
|---|---|---|
| 시드 답변 중 하나라도 40자 미만 | `TOO_SHORT` | 422 |
| 시드 답변 중 하나라도 2,500자 초과 | `LOG_PASTE_SUSPECTED` | 422 |
| 전체 텍스트에서 `^(agent|customer|rep|caller|user|bot|cs|a|c)\s*[:：]` 패턴 줄이 3개 이상 | `LOG_PASTE_SUSPECTED` | 422 |
| 타임스탬프 `\b\d{1,2}:\d{2}(:\d{2})?\b` 3개 이상 | `LOG_PASTE_SUSPECTED` | 422 |
| 이메일 2개 이상 또는 전화번호 2개 이상 | `PII_DETECTED` | 422 |
거부 시 `interviews` 행은 `status=rejected`, `rejected_reason` 기록, 본문은 저장하지 않음.

| 응답 필드 | 출처 |
|---|---|
| id, status | interviews.id, interviews.status |
| followup_questions | interviews.followup_questions |
| run.duration_ms, run.question_count | claude_runs.duration_ms, claude_runs.metrics.question_count (kind=followup, ref_id=interviews.id) |

### POST /api/interviews/{id}/seal
꼬리질문 응답 저장 → **Claude ② 추출·일반화·카드** → packs, cards 생성. **인계서 원문은 응답하지 않는다.** 판매자는 이어서 `GET /api/packs/{pack_id}/note`로 본다.
```json
// 요청 (헤더 x-seller-id, 소유자여야 함)
{ "followup_answers": { "f1": "At day 58 I…", "f2": "I used 14 days remaining and $42.10 prorated…" } }
// 응답 201
{
  "pack_id": "c71a…",
  "card": {
    "id": "d0f3…", "field": "Telecom billing disputes", "language": "EN", "years_experience": 5,
    "difficulty": 4, "rarity": 4,
    "one_liner": "Proration, loyalty-credit edge cases and roaming waivers a script can't handle.",
    "price_pack_usd": 149.00, "price_case_usd": 20.00, "listed_at": "2026-10-24T11:42:07Z"
  },
  "metrics": { "item_count": 22, "rare_count": 13, "manual_count": 9, "generalized_count": 5 },
  "run": { "kind": "extract", "duration_ms": 9830 }
}
```
| 응답 필드 | 출처 |
|---|---|
| pack_id | packs.id |
| card.* | cards.* |
| metrics.* | packs.item_count / rare_count / manual_count / generalized_count |
| run.* | claude_runs (kind=extract, ref_id=packs.id) |
에러: `FORBIDDEN` 403 (소유자 아님) · `VALIDATION_ERROR` 400 (status≠draft, 또는 꼬리질문 응답 누락) · `CLAUDE_FAILED` 502

### GET /api/packs/{id}/note
봉인 해제 열람. **판매자 본인(x-seller-id = packs.seller_id) 또는 구매 완료 구매자(x-buyer-id가 purchases에 있음)만.**
```json
// 응답 200
{
  "pack_id": "c71a…",
  "handover_note": {
    "rules":            [ { "id": "r1", "text": "Loyalty credit applies only if no plan change in the last 60 days.", "kind": "manual", "source": "q1" } ],
    "exceptions":       [ { "id": "e1", "text": "At day 58–60, escalate instead of refusing; the system backdates on day 61.", "kind": "rare", "source": "f1" } ],
    "judgment_calls":   [ { "id": "j1", "text": "…", "kind": "rare", "source": "q3" } ],
    "common_mistakes":  [ { "id": "m1", "text": "Resetting the billing cycle on a proration question doubles the charge.", "kind": "rare", "source": "q2" } ],
    "never_do":         [ { "id": "n1", "text": "Never grant a retroactive roaming waiver when the customer toggled roaming on.", "kind": "rare", "source": "q3" } ]
  },
  "generalization_log": [ { "type": "company", "replaced_with": "the carrier", "count": 2 }, { "type": "system", "replaced_with": "the billing system", "count": 3 } ],
  "metrics": { "item_count": 22, "rare_count": 13, "manual_count": 9, "generalized_count": 5 }
}
```
| 응답 필드 | 출처 |
|---|---|
| handover_note, generalization_log | packs.handover_note, packs.generalization_log |
| metrics.* | packs.* |
에러: `FORBIDDEN` 403 `{ "message": "Unlock this pack to read the full note." }`

---

## 구매자 화면 (화면 2 — Match · Card · Sealed Q&A)

### POST /api/buyers
```json
// 요청
{ "buyer_type": "ai_ops", "display_name": "Buyer #11" }
// 응답 201
{ "id": "5a2d…", "buyer_type": "ai_ops", "display_name": "Buyer #11" }
```

### GET /api/cards?limit=20
공개 카드 목록. 인계서 없음.
```json
{ "cards": [ { "id": "d0f3…", "field": "Telecom billing disputes", "language": "EN", "years_experience": 5, "difficulty": 4, "rarity": 4, "one_liner": "…", "price_pack_usd": 149.00, "price_case_usd": 20.00, "listed_at": "…", "item_count": 22 } ] }
```
| 필드 | 출처 |
|---|---|
| cards[].* (item_count 제외) | cards.* |
| cards[].item_count | packs.item_count (cards.pack_id 조인) |

### GET /api/cards/{id}
카드 상세 + 이 구매자의 구매 여부.
```json
{ "card": { "…": "위와 동일" }, "item_count": 22, "rare_count": 13, "unlocked": false, "sealed_qa_count": 1 }
```
| 필드 | 출처 |
|---|---|
| card.* | cards.* |
| item_count, rare_count | packs.* |
| unlocked | purchases 존재 여부 (buyer_id = x-buyer-id, pack_id = cards.pack_id, kind='pack') |
| sealed_qa_count | count(sealed_qa where card_id, buyer_id) |

### POST /api/requests
수요문 저장 → **Claude ③ 매칭** → 상위 3 카드 + 이유.
```json
// 요청 (헤더 x-buyer-id)
{ "request_text": "Our AI can't resolve roaming disputes after a mid-cycle plan change. Customers escalate and we have no one to route to." }
// 응답 201
{
  "request_id": "9e44…",
  "matches": [
    { "rank": 1, "score": 0.91, "reason": "Covers mid-cycle proration and roaming waivers as rare judgment calls.", "card": { "id": "d0f3…", "field": "Telecom billing disputes", "language": "EN", "years_experience": 5, "difficulty": 4, "rarity": 4, "one_liner": "…", "price_pack_usd": 149.00, "price_case_usd": 20.00, "item_count": 22 } },
    { "rank": 2, "score": 0.62, "reason": "…", "card": { "…": "…" } },
    { "rank": 3, "score": 0.41, "reason": "…", "card": { "…": "…" } }
  ],
  "run": { "kind": "match", "duration_ms": 3380, "candidate_count": 7 }
}
```
Claude에는 카드 공개 필드 + 항목 수만 보낸다(인계서 원문 안 보냄). 후보가 3개 미만이면 있는 만큼만.
| 필드 | 출처 |
|---|---|
| request_id | buyer_requests.id |
| matches[].rank, score, reason | matches.* |
| matches[].card.* | cards.* + packs.item_count |
| run.* | claude_runs (kind=match, ref_id=buyer_requests.id, metrics.candidate_count) |

### POST /api/cards/{id}/ask
**Claude ④ Sealed Q&A.** 서버만 인계서를 읽고, 응답에는 답·근거 수만.
```json
// 요청 (헤더 x-buyer-id)
{ "question": "What do you do when a customer changed plans 58 days ago and asks for the loyalty credit?" }
// 응답 201
{ "id": "71bc…", "answer": "Escalate rather than refuse; the system backdates the change on day 61, so a refusal at day 58 is reversed anyway.", "evidence_count": 3, "total_items": 22, "covered": true, "run": { "kind": "sealed_qa", "duration_ms": 2910 } }
// 다루지 않는 질문
{ "id": "…", "answer": "This pack doesn't cover that.", "evidence_count": 0, "total_items": 22, "covered": false, "run": { "…": "…" } }
```
| 필드 | 출처 |
|---|---|
| id, answer, evidence_count, total_items, covered | sealed_qa.* |
| run.* | claude_runs (kind=sealed_qa, ref_id=sealed_qa.id) |
제한(미정): 구매 전 카드당 3회. 초과 시 `VALIDATION_ERROR` 429 `{ "message": "Unlock the pack to keep asking." }`

### POST /api/packs/{id}/purchase
목업 결제. 상태만 바뀐다.
```json
// 요청 (헤더 x-buyer-id)
{ "kind": "pack" }
// 응답 201
{ "purchase_id": "33d0…", "pack_id": "c71a…", "kind": "pack", "amount_usd": 149.00, "status": "mock_paid", "unlocked": true }
```
| 필드 | 출처 |
|---|---|
| purchase_id, kind, amount_usd, status | purchases.* (amount_usd = packs.price_pack_usd) |
| unlocked | 항상 true |
`kind`가 `case`/`hire`면 `VALIDATION_ERROR` 400 `{ "message": "Coming soon." }` — 화면은 목업 버튼.
이미 구매했으면 200으로 기존 행 반환.

---

## 심사용 패널 (화면 3 — What Claude did)

### GET /api/packs/{id}/trace
한 팩에 대한 Claude 호출 실측 묶음. 공개(원문 없음).
```json
{
  "pack_id": "c71a…",
  "followup":  { "question_count": 2, "duration_ms": 4120 },
  "extract":   { "item_count": 22, "rare_count": 13, "manual_count": 9, "generalized_count": 5, "generalization_log": [ { "type": "company", "replaced_with": "the carrier", "count": 2 } ], "duration_ms": 9830 },
  "last_match":    { "request_id": "9e44…", "rank": 1, "score": 0.91, "duration_ms": 3380 },
  "sealed_qa":     { "count": 2, "avg_duration_ms": 2950, "last_evidence_count": 3 },
  "total_ms": 20280,
  "model": "claude-sonnet-5-5"
}
```
| 필드 | 출처 |
|---|---|
| followup.* | claude_runs kind=followup, ref_id=packs.interview_id |
| extract.* | claude_runs kind=extract, ref_id=packs.id + packs.generalization_log |
| last_match.* | matches (card_id = cards.id where pack_id) 최신 1건 + claude_runs kind=match ref_id=request_id |
| sealed_qa.* | sealed_qa + claude_runs kind=sealed_qa 집계 |
| total_ms | followup + extract + last_match + sealed_qa 합 |
| model | claude_runs.model |

---

## Claude 호출 4개 — 입력 → Claude → 출력 (서버 내부, 공개 API 아님)

모델: `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"`. 출력은 JSON만 받도록 프롬프트에 스키마를 적고 zod로 검증. 실패 시 1회 재시도 후 `CLAUDE_FAILED`.

| # | kind | 입력 | Claude가 하는 일 | 출력(zod) |
|---|---|---|---|---|
| ① | followup | `{role_title, years_experience, language, seed_answers, notes?}` | 네 답변에서 매뉴얼 지식과 희소 판단을 구분하고, 희소 쪽 빈 곳(숫자·상황·결정 근거 없는 곳)을 찾아 꼬리질문 2~3개 | `{followup_questions: [{id:"f1"|"f2"|"f3", question: string, target: "rare"|"detail"}]}` |
| ② | extract | ① 입력 + `followup_answers` | Rules/Exceptions/Judgment calls/Common mistakes/Never do로 구조화. 각 항목 kind(rare/manual)·source 표시. 회사·시스템·고객·사람·지명 고유명사를 일반어로 치환하고 로그 작성. 카드 필드(field, difficulty, rarity, one_liner) 산정 | `{handover_note: {rules:[item],exceptions:[item],judgment_calls:[item],common_mistakes:[item],never_do:[item]}, generalization_log: [{type,replaced_with,count}], card: {field, difficulty:1-5, rarity:1-5, one_liner}}` · item = `{id, text, kind, source}` |
| ③ | match | `{request_text, buyer_type, candidates: [{card_id, field, language, years_experience, difficulty, rarity, one_liner, item_count, rare_count}]}` | 수요문과 후보 대조, 상위 3개에 0~1 점수와 이유 1줄 | `{matches: [{card_id, rank:1-3, score, reason}]}` |
| ④ | sealed_qa | `{question, card: {field, one_liner}, handover_note}` (서버에서만 주입) | 인계서 근거로만 답. 근거 항목 id 목록. 근거 없으면 covered=false, answer 고정 문구 | `{answer, evidence_item_ids: string[], covered: boolean}` → 저장 시 evidence_count = ids 길이 |

서버 후처리(상수): `price_pack_usd = min(max(item_count × 7, 49), 499)` · `price_case_usd = max(8, 3 + rarity × 3)` · `item_count/rare_count/manual_count` = 항목 집계 · `generalized_count` = log count 합. 정규식 PII 마스킹(이메일·전화)은 ② 입력 전에 1차 적용.

## 미정
- Sealed Q&A 구매 전 횟수 제한(3회) 적용 여부
- 거부 규칙의 임계값(2,500자·3줄)은 샘플 돌려보고 조정
- 토큰 수(`input_tokens`, `output_tokens`)는 SDK 응답의 usage에서 채움. SDK 버전에 따라 필드명 확인 필요

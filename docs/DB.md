# DB 스키마 — Handover MVP

실행 파일: `supabase/migrations/0001_init.sql` (Supabase Postgres에서 바로 실행). 아래는 같은 내용의 설명.

## 원칙
- `packs.handover_note`는 **봉인**. 카드 목록·카드 상세·매칭·Sealed Q&A 어느 응답에도 넣지 않는다. 열람은 `GET /api/packs/{id}/note` 한 곳에서만, 판매자 본인 또는 구매 완료 구매자에게만.
- 로그인 없음. `sellers.id` / `buyers.id`는 클라이언트가 처음 만들 때 발급받아 `x-seller-id` / `x-buyer-id` 헤더로 보낸다. 데모용 trust-on-first-use.
- 회사 로그·고객 기록은 저장되지 않는다. API 단계에서 거부되고(`interviews.rejected_reason`), 거부된 인터뷰 행은 남지만 본문은 저장하지 않는다(`seed_answers`에 `{"rejected": true}`만).

## 테이블

### sellers — 판매자(가명)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| display_name | text | 기본 'Anonymous seller' |
| role_title | text | "Telecom billing CSR" |
| years_experience | int 0~60 | |
| language | text 'EN'/'KO' | |
| created_at | timestamptz | |

### interviews — 인터뷰(시드 4 + 메모 + 꼬리질문)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| seller_id | uuid FK sellers | |
| status | enum draft/sealed/rejected | |
| seed_answers | jsonb | `{"q1","q2","q3","q4"}` |
| notes | text null | 본인 메모·체크리스트 |
| followup_questions | jsonb | `[{"id":"f1","question","target":"rare|detail"}]` 2~3개 |
| followup_answers | jsonb | `{"f1":"...","f2":"..."}` |
| rejected_reason | text null | LOG_PASTE_SUSPECTED / PII_DETECTED / TOO_SHORT |
| created_at, sealed_at | timestamptz | |

### packs — 노하우 팩(봉인 인계서 + 실측 + 가격)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| seller_id | uuid FK | |
| interview_id | uuid FK unique | 인터뷰 1 : 팩 1 |
| **handover_note** | jsonb | 봉인. `{"rules":[],"exceptions":[],"judgment_calls":[],"common_mistakes":[],"never_do":[]}` 각 항목 `{"id","text","kind":"rare|manual","source":"q1..q4|f1..f3|notes"}` |
| generalization_log | jsonb | `[{"type":"company|system|customer|person|location","replaced_with":"the carrier","count":2}]` |
| item_count | int | 5개 배열 항목 합 |
| rare_count | int | kind=rare 수 |
| manual_count | int | kind=manual 수 |
| generalized_count | int | generalization_log count 합 |
| price_pack_usd | numeric(8,2) | `clamp(item_count × 7, 49, 499)` 상수 |
| price_case_usd | numeric(8,2) | `8 + rarity × 3` (P1 표시용) |
| created_at | timestamptz | |

### cards — 블라인드 카드(공개 필드만)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| pack_id | uuid FK unique | |
| field | text | "Telecom billing disputes" |
| language | text | |
| years_experience | int | sellers에서 복사 |
| difficulty | int 1~5 | |
| rarity | int 1~5 | 매뉴얼 밖 판단 비율 기반 |
| one_liner | text | |
| price_pack_usd, price_case_usd | numeric | packs에서 생성 시 복사 |
| listed_at | timestamptz | 목록 정렬 |

### buyers — 구매자(가명)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| display_name | text | |
| buyer_type | enum ai_ops / eval_data | 상담 AI 운영 기업 / 평가 데이터 회사 |
| created_at | timestamptz | |

### buyer_requests — 수요문
| id uuid PK | buyer_id FK | request_text text | created_at |

### matches — 매칭 결과
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| request_id | uuid FK | |
| card_id | uuid FK | |
| rank | int 1~3 | unique(request_id, rank) |
| score | numeric(4,3) 0~1 | |
| reason | text | 1줄 |

### sealed_qa — 봉인 질의응답
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| card_id, buyer_id | uuid FK | |
| question, answer | text | |
| evidence_count | int | 근거 항목 수(내용 비노출) |
| total_items | int | packs.item_count |
| covered | boolean | false → "This pack doesn't cover that." |

### purchases — 구매(목업)
| id | buyer_id FK | pack_id FK | kind enum pack/case/hire (MVP는 pack) | amount_usd | status 'mock_paid' | unique(buyer_id, pack_id, kind) |

### claude_runs — Claude 호출 실측
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| kind | enum followup/extract/match/sealed_qa | |
| ref_table, ref_id | text, uuid | interviews / packs / buyer_requests / sealed_qa |
| model | text | |
| input_tokens, output_tokens | int null | |
| duration_ms | int | |
| metrics | jsonb | kind별: followup `{question_count}` / extract `{item_count,rare_count,manual_count,generalized_count}` / match `{candidate_count}` / sealed_qa `{evidence_count,covered}` |

## 관계
sellers 1—N interviews 1—1 packs 1—1 cards 1—N matches / sealed_qa
buyers 1—N buyer_requests 1—N matches · buyers 1—N sealed_qa · buyers 1—N purchases N—1 packs

## 인덱스
interviews(seller_id) · packs(seller_id) · cards(listed_at desc) · buyer_requests(buyer_id) · matches(card_id) · sealed_qa(card_id) · claude_runs(ref_id)

## 미정
- RLS: MVP는 서버(service role)에서만 접근, RLS 미설정. 공개 배포 전 켜야 함.
- 거부된 인터뷰 행을 남길지(통계용) 아예 안 만들지 — 현재는 남기되 본문 미저장.

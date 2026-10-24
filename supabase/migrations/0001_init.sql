-- Handover MVP schema · 2026-10-24
-- 원칙: packs.handover_note는 봉인. list/card/match/ask 응답에는 절대 포함하지 않는다.
-- 로그인 없음. sellers.id / buyers.id는 클라이언트가 처음 만들 때 발급받아 헤더로 보낸다(데모용 trust-on-first-use).

create extension if not exists "pgcrypto";

create type buyer_type       as enum ('ai_ops', 'eval_data');
create type interview_status as enum ('draft', 'sealed', 'rejected');
create type claude_run_kind  as enum ('followup', 'extract', 'match', 'sealed_qa');
create type purchase_kind    as enum ('pack', 'case', 'hire');   -- MVP는 'pack'만 사용. case/hire는 목업

-- 판매자 (가명)
create table sellers (
  id               uuid primary key default gen_random_uuid(),
  display_name     text not null default 'Anonymous seller',
  role_title       text not null,                       -- "Telecom billing CSR"
  years_experience int  not null check (years_experience between 0 and 60),
  language         text not null default 'EN' check (language in ('EN', 'KO')),
  created_at       timestamptz not null default now()
);

-- 인터뷰: 시드 4문항 + 본인 메모(선택) + Claude 꼬리질문/응답
create table interviews (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references sellers(id) on delete cascade,
  status             interview_status not null default 'draft',
  seed_answers       jsonb not null,                    -- {"q1": "...", "q2": "...", "q3": "...", "q4": "..."}
  notes              text,                              -- 본인이 쓴 메모·체크리스트 (회사 로그 아님)
  followup_questions jsonb not null default '[]'::jsonb, -- [{"id":"f1","question":"...","target":"rare|detail"}]
  followup_answers   jsonb not null default '{}'::jsonb, -- {"f1": "...", "f2": "..."}
  rejected_reason    text,                              -- LOG_PASTE_SUSPECTED | PII_DETECTED | TOO_SHORT
  created_at         timestamptz not null default now(),
  sealed_at          timestamptz
);
create index interviews_seller_idx on interviews (seller_id);

-- 노하우 팩: 봉인 인계서 + 실측값 + 가격
create table packs (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references sellers(id) on delete cascade,
  interview_id       uuid not null unique references interviews(id) on delete cascade,
  handover_note      jsonb not null,  -- 봉인. {"rules":[item],"exceptions":[item],"judgment_calls":[item],"common_mistakes":[item],"never_do":[item]}
                                      -- item = {"id":"r1","text":"...","kind":"rare|manual","source":"q1|q2|q3|q4|f1|f2|notes"}
  generalization_log jsonb not null default '[]'::jsonb, -- [{"type":"company|system|customer|person|location","replaced_with":"the carrier","count":2}]
  item_count         int not null check (item_count >= 0),
  rare_count         int not null check (rare_count >= 0),
  manual_count       int not null check (manual_count >= 0),
  generalized_count  int not null check (generalized_count >= 0),
  price_pack_usd     numeric(8,2) not null,            -- clamp(item_count * 7, 49, 499)  상수 하드코딩
  price_case_usd     numeric(8,2) not null,            -- 8 + rarity * 3  (P1 표시용, 건당 호출은 목업)
  created_at         timestamptz not null default now()
);
create index packs_seller_idx on packs (seller_id);

-- 블라인드 카드: 공개 필드만. 인계서 원문 없음
create table cards (
  id               uuid primary key default gen_random_uuid(),
  pack_id          uuid not null unique references packs(id) on delete cascade,
  field            text not null,                       -- "Telecom billing disputes"
  language         text not null,
  years_experience int  not null,
  difficulty       int  not null check (difficulty between 1 and 5),
  rarity           int  not null check (rarity between 1 and 5),
  one_liner        text not null,
  price_pack_usd   numeric(8,2) not null,               -- packs.price_pack_usd 복사 (생성 시점)
  price_case_usd   numeric(8,2) not null,               -- packs.price_case_usd 복사
  listed_at        timestamptz not null default now()
);
create index cards_listed_idx on cards (listed_at desc);

-- 구매자 (가명, 유형 2개)
create table buyers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null default 'Anonymous buyer',
  buyer_type   buyer_type not null,
  created_at   timestamptz not null default now()
);

-- 수요문 "What can't your AI solve?"
create table buyer_requests (
  id           uuid primary key default gen_random_uuid(),
  buyer_id     uuid not null references buyers(id) on delete cascade,
  request_text text not null,
  created_at   timestamptz not null default now()
);
create index buyer_requests_buyer_idx on buyer_requests (buyer_id);

-- 매칭 결과 상위 3
create table matches (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id) on delete cascade,
  card_id    uuid not null references cards(id) on delete cascade,
  rank       int  not null check (rank between 1 and 3),
  score      numeric(4,3) not null check (score between 0 and 1),
  reason     text not null,
  created_at timestamptz not null default now(),
  unique (request_id, rank)
);
create index matches_card_idx on matches (card_id);

-- Sealed Q&A: 원문 안 열고 답만
create table sealed_qa (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references cards(id) on delete cascade,
  buyer_id       uuid not null references buyers(id) on delete cascade,
  question       text not null,
  answer         text not null,
  evidence_count int  not null check (evidence_count >= 0),  -- 근거로 쓴 인계서 항목 수 (항목 내용은 비노출)
  total_items    int  not null,                               -- packs.item_count
  covered        boolean not null,                            -- false면 "This pack doesn't cover that."
  created_at     timestamptz not null default now()
);
create index sealed_qa_card_idx on sealed_qa (card_id);

-- 구매 (목업 결제)
create table purchases (
  id         uuid primary key default gen_random_uuid(),
  buyer_id   uuid not null references buyers(id) on delete cascade,
  pack_id    uuid not null references packs(id) on delete cascade,
  kind       purchase_kind not null default 'pack',
  amount_usd numeric(8,2) not null,
  status     text not null default 'mock_paid',
  created_at timestamptz not null default now(),
  unique (buyer_id, pack_id, kind)
);

-- Claude 호출 실측 ("What Claude did")
create table claude_runs (
  id            uuid primary key default gen_random_uuid(),
  kind          claude_run_kind not null,
  ref_table     text not null,      -- 'interviews' | 'packs' | 'buyer_requests' | 'sealed_qa'
  ref_id        uuid not null,
  model         text not null,
  input_tokens  int,
  output_tokens int,
  duration_ms   int not null,
  metrics       jsonb not null default '{}'::jsonb,  -- followup: {question_count} / extract: {item_count,rare_count,manual_count,generalized_count} / match: {candidate_count} / sealed_qa: {evidence_count,covered}
  created_at    timestamptz not null default now()
);
create index claude_runs_ref_idx on claude_runs (ref_id);

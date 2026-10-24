-- Handover MVP — 0001_init
-- 근거: docs/DB.md. 로그인 없음, RLS 미설정(서버 service role 전용).
-- packs.handover_note는 봉인: GET /api/packs/{id}/note 외 어떤 응답에도 넣지 않는다.

-- enums
create type interview_status as enum ('draft', 'sealed', 'rejected');
create type buyer_type as enum ('ai_ops', 'eval_data');
create type purchase_kind as enum ('pack', 'case', 'hire');
create type claude_run_kind as enum ('followup', 'extract', 'match', 'sealed_qa');

-- sellers — 판매자(가명)
create table sellers (
  id               uuid primary key default gen_random_uuid(),
  display_name     text not null default 'Anonymous seller',
  role_title       text not null,
  years_experience int  not null check (years_experience between 0 and 60),
  language         text not null check (language in ('EN', 'KO')),
  created_at       timestamptz not null default now()
);

-- interviews — 인터뷰(시드 4 + 메모 + 꼬리질문)
-- 거부된 행은 남기되 본문은 저장하지 않는다(seed_answers = {"rejected": true}).
create table interviews (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references sellers(id) on delete cascade,
  status             interview_status not null default 'draft',
  seed_answers       jsonb not null,                 -- {"q1","q2","q3","q4"}
  notes              text,
  followup_questions jsonb not null default '[]',    -- [{"id":"f1","question","target":"rare|detail"}]
  followup_answers   jsonb not null default '{}',    -- {"f1":"...","f2":"..."}
  rejected_reason    text check (rejected_reason in ('LOG_PASTE_SUSPECTED', 'PII_DETECTED', 'TOO_SHORT')),
  created_at         timestamptz not null default now(),
  sealed_at          timestamptz
);
create index interviews_seller_id_idx on interviews(seller_id);

-- packs — 노하우 팩(봉인 인계서 + 실측 + 가격)
create table packs (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references sellers(id) on delete cascade,
  interview_id       uuid not null unique references interviews(id) on delete cascade,
  handover_note      jsonb not null,                 -- 봉인. {"rules":[],"exceptions":[],"judgment_calls":[],"common_mistakes":[],"never_do":[]}
  generalization_log jsonb not null default '[]',    -- [{"type","replaced_with","count"}]
  item_count         int not null default 0,
  rare_count         int not null default 0,
  manual_count       int not null default 0,
  generalized_count  int not null default 0,
  price_pack_usd     numeric(8,2) not null,          -- clamp(item_count × 7, 49, 499)
  price_case_usd     numeric(8,2) not null,          -- 8 + rarity × 3
  created_at         timestamptz not null default now()
);
create index packs_seller_id_idx on packs(seller_id);

-- cards — 블라인드 카드(공개 필드만)
create table cards (
  id               uuid primary key default gen_random_uuid(),
  pack_id          uuid not null unique references packs(id) on delete cascade,
  field            text not null,
  language         text not null,
  years_experience int  not null,
  difficulty       int  not null check (difficulty between 1 and 5),
  rarity           int  not null check (rarity between 1 and 5),
  one_liner        text not null,
  price_pack_usd   numeric(8,2) not null,
  price_case_usd   numeric(8,2) not null,
  listed_at        timestamptz not null default now()
);
create index cards_listed_at_idx on cards(listed_at desc);

-- buyers — 구매자(가명)
create table buyers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null default 'Anonymous buyer',
  buyer_type   buyer_type not null,
  created_at   timestamptz not null default now()
);

-- buyer_requests — 수요문
create table buyer_requests (
  id           uuid primary key default gen_random_uuid(),
  buyer_id     uuid not null references buyers(id) on delete cascade,
  request_text text not null,
  created_at   timestamptz not null default now()
);
create index buyer_requests_buyer_id_idx on buyer_requests(buyer_id);

-- matches — 매칭 결과
create table matches (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id) on delete cascade,
  card_id    uuid not null references cards(id) on delete cascade,
  rank       int  not null check (rank between 1 and 3),
  score      numeric(4,3) not null check (score between 0 and 1),
  reason     text not null,
  unique (request_id, rank)
);
create index matches_card_id_idx on matches(card_id);

-- sealed_qa — 봉인 질의응답(근거 항목 수만, 내용 비노출)
create table sealed_qa (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references cards(id) on delete cascade,
  buyer_id       uuid not null references buyers(id) on delete cascade,
  question       text not null,
  answer         text not null,
  evidence_count int  not null default 0,
  total_items    int  not null,
  covered        boolean not null,
  created_at     timestamptz not null default now()
);
create index sealed_qa_card_id_idx on sealed_qa(card_id);

-- purchases — 구매(목업). MVP는 kind='pack'만.
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

-- claude_runs — Claude 호출 실측("What Claude did")
create table claude_runs (
  id            uuid primary key default gen_random_uuid(),
  kind          claude_run_kind not null,
  ref_table     text not null,                      -- interviews / packs / buyer_requests / sealed_qa
  ref_id        uuid not null,
  model         text not null,
  input_tokens  int,
  output_tokens int,
  duration_ms   int  not null,
  metrics       jsonb not null default '{}',        -- kind별: followup {question_count} / extract {item_count,rare_count,manual_count,generalized_count} / match {candidate_count} / sealed_qa {evidence_count,covered}
  created_at    timestamptz not null default now()
);
create index claude_runs_ref_id_idx on claude_runs(ref_id);

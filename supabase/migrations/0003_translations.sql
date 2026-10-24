-- 0003: 다국어 번역 캐시 — UI 언어를 고르면 카드·인계서를 그 언어로 번역해 보여준다 (Claude ⑥ translate, 결과는 여기 저장).
create table card_translations (
  card_id    uuid not null references cards(id) on delete cascade,
  language   text not null check (language ~ '^[A-Z]{2}$'),
  field      text not null,
  one_liner  text not null,
  created_at timestamptz not null default now(),
  primary key (card_id, language)
);

create table pack_translations (
  pack_id       uuid not null references packs(id) on delete cascade,
  language      text not null check (language ~ '^[A-Z]{2}$'),
  handover_note jsonb not null,   -- 원본과 같은 구조, text만 번역
  created_at    timestamptz not null default now(),
  primary key (pack_id, language)
);

alter type claude_run_kind add value if not exists 'translate';

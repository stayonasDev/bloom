-- 0002: 다국어 — sellers.language를 EN/KO 제한에서 ISO 639-1 대문자 2글자 전체로 완화.
-- 프론트 UI 언어 6개(EN KO JA TL ES DE) + 확장. cards.language는 원래 제약 없음.
alter table sellers drop constraint if exists sellers_language_check;
alter table sellers add constraint sellers_language_check check (language ~ '^[A-Z]{2}$');

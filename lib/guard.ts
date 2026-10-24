// 입력 검사 (API.md "입력 검사" 표) — Claude 호출 전에 서버에서 거부한다.
// 임계값은 샘플을 돌려본 뒤 조정 가능 (PRD §9).

export const GUARD = {
  MIN_CHARS: 40,
  MAX_CHARS: 2500,
  DIALOGUE_LINES: 3,
  TIMESTAMPS: 3,
  PII_COUNT: 2,
} as const;

export type SeedAnswers = { q1: string; q2: string; q3: string; q4: string };
export type RejectCode = "TOO_SHORT" | "LOG_PASTE_SUSPECTED" | "PII_DETECTED";
export type Rejection = { code: RejectCode; field: string };

const DIALOGUE_LINE = /^(agent|customer|rep|caller|user|bot|cs|a|c)\s*[:：]/i;
const TIMESTAMP = /\b\d{1,2}:\d{2}(:\d{2})?\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 국제 접두(+NN) 선택 · 지역번호 1~4 · 국번 3~4 · 번호 4 — "60 days", "$42.10", "2026-10-24"는 걸리지 않는다
const PHONE = /(?:\+\d{1,3}[ -]?)?(?:\(\d{1,4}\)|\d{1,4})[ -]?\d{3,4}[ -]?\d{4}\b/g;

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** 거부 사유가 있으면 반환, 없으면 null. 표 순서대로 검사한다. */
export function checkInterviewInput(seed: SeedAnswers, notes?: string | null): Rejection | null {
  const keys = ["q1", "q2", "q3", "q4"] as const;

  for (const k of keys) {
    if (seed[k].trim().length < GUARD.MIN_CHARS) return { code: "TOO_SHORT", field: `seed_answers.${k}` };
  }
  for (const k of keys) {
    if (seed[k].length > GUARD.MAX_CHARS) return { code: "LOG_PASTE_SUSPECTED", field: `seed_answers.${k}` };
  }

  const all = [...keys.map((k) => seed[k]), notes ?? ""].join("\n");

  const dialogueLines = all.split(/\r?\n/).filter((l) => DIALOGUE_LINE.test(l.trim())).length;
  if (dialogueLines >= GUARD.DIALOGUE_LINES) {
    return { code: "LOG_PASTE_SUSPECTED", field: fieldOf(seed, notes, DIALOGUE_LINE, true) };
  }
  if (count(all, TIMESTAMP) >= GUARD.TIMESTAMPS) {
    return { code: "LOG_PASTE_SUSPECTED", field: fieldOf(seed, notes, TIMESTAMP) };
  }
  if (count(all, EMAIL) >= GUARD.PII_COUNT || count(all, PHONE) >= GUARD.PII_COUNT) {
    return { code: "PII_DETECTED", field: fieldOf(seed, notes, count(all, EMAIL) >= GUARD.PII_COUNT ? EMAIL : PHONE) };
  }
  return null;
}

/** 어느 필드에서 걸렸는지 — 첫 매치 필드. 없으면 seed_answers */
function fieldOf(seed: SeedAnswers, notes: string | null | undefined, re: RegExp, perLine = false): string {
  const entries: [string, string][] = [
    ["seed_answers.q1", seed.q1], ["seed_answers.q2", seed.q2],
    ["seed_answers.q3", seed.q3], ["seed_answers.q4", seed.q4],
    ["notes", notes ?? ""],
  ];
  for (const [field, text] of entries) {
    const hit = perLine ? text.split(/\r?\n/).some((l) => re.test(l.trim())) : new RegExp(re.source, re.flags.replace("g", "")).test(text);
    if (hit) return field;
  }
  return "seed_answers";
}

/** 정규식 PII 1차 마스킹 — Claude ② 입력 전에 적용 */
export function maskPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}

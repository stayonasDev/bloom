/**
 * 목 데이터 오프라인 검사 — Claude·DB 없이 lib/guard.ts의 거부 규칙만 돌린다.
 * 정상 샘플 5종은 통과해야 하고, 깨진 입력은 expect.code와 같은 코드로 거부돼야 한다.
 * 실행: npm run mock:check
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkInterviewInput, type SeedAnswers } from "../lib/guard";

type Sample = { slug: string; seed_answers: SeedAnswers; notes?: string | null; allow_short?: boolean; expect?: { status: number; code?: string; field?: string } };
const load = (dir: string): Sample[] =>
  readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

let fail = 0;
const row = (ok: boolean, name: string, detail: string) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${detail}`); };

for (const s of load(process.env.MOCK_SELLERS ?? "mock/sellers")) {
  const lens = Object.values(s.seed_answers).map((v) => v.length);
  const rej = checkInterviewInput(s.seed_answers, s.notes);
  row(!rej, s.slug, rej ? `unexpected reject: ${rej.code} ${rej.field}` : `guard ok, seed lengths ${lens.join("/")}`);
  if (s.allow_short) row(lens.every((n) => n >= 40), s.slug, `거친 샘플(의도), 40자 이상만 확인`);
  else row(lens.every((n) => n >= 150 && n <= 600), s.slug, `PRD 150~600자 범위`);
}
for (const s of load("mock/broken")) {
  const exp = s.expect!;
  const rej = checkInterviewInput(s.seed_answers, s.notes);
  if (!rej) row(exp.status === 201, s.slug, exp.status === 201 ? "guard 통과(의도됨, Claude 단계에서 검증)" : `expected ${exp.code} but passed`);
  else {
    const ok = exp.status === 422 && rej.code === exp.code && (!exp.field || exp.field === rej.field);
    row(ok, s.slug, `${rej.code} ${rej.field} (expected ${exp.code ?? "pass"} ${exp.field ?? ""})`);
  }
}
console.log(fail ? `\n${fail} FAILED` : "\nALL OK");
process.exit(fail ? 1 : 0);

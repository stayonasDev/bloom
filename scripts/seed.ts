/**
 * mock/sellers/*.json 5종을 API로 흘려 카드 5장을 만든다(Claude 실호출, 샘플당 2회).
 * 꼬리질문 id는 Claude가 정하므로 응답은 순서대로 f1, f2, f3를 매핑한다.
 * 결과는 mock/seed-output.json에 저장(ids·metrics·ms). 리허설 숫자와 verify-mock의 입력이 된다.
 * 실행: npm run seed            (기본 http://localhost:3000, BASE_URL 또는 BASE로 지정)
 *       BASE_URL=https://handover-seven-red.vercel.app npm run seed   (프로덕션)
 *       MOCK_SELLERS=mock/sellers-ko npm run seed   (한국판)
 *       BASE=https://… npm run seed
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? process.env.BASE ?? "http://localhost:3000";
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  const dir = process.env.MOCK_SELLERS ?? "mock/sellers";
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const t0 = Date.now();
    const seller = await call("POST", "/api/sellers", s.seller);
    if (seller.status !== 201) { console.error(`${s.slug}: seller ${seller.status}`, seller.json); process.exit(1); }
    const sh = { "x-seller-id": seller.json.id };
    const iv = await call("POST", "/api/interviews", { seed_answers: s.seed_answers, notes: s.notes ?? undefined }, sh);
    if (iv.status !== 201) { console.error(`${s.slug}: interview ${iv.status}`, iv.json); process.exit(1); }
    const qs: { id: string; question: string; target: string }[] = iv.json.followup_questions;
    const pool = [s.followup_answers.f1, s.followup_answers.f2, s.followup_answers.f3].filter(Boolean);
    const followup_answers = Object.fromEntries(qs.map((q, i) => [q.id, pool[i] ?? pool[pool.length - 1]]));
    const sealed = await call("POST", `/api/interviews/${iv.json.id}/seal`, { followup_answers }, sh);
    if (sealed.status !== 201) { console.error(`${s.slug}: seal ${sealed.status}`, sealed.json); process.exit(1); }
    const total_ms = Date.now() - t0;
    out[s.slug] = {
      seller_id: seller.json.id, interview_id: iv.json.id, pack_id: sealed.json.pack_id, card_id: sealed.json.card.id,
      field: sealed.json.card.field, rarity: sealed.json.card.rarity, difficulty: sealed.json.card.difficulty,
      price_pack_usd: sealed.json.card.price_pack_usd, price_case_usd: sealed.json.card.price_case_usd,
      metrics: sealed.json.metrics, followup_ms: iv.json.run.duration_ms, extract_ms: sealed.json.run.duration_ms, total_ms,
      followups: qs.map((q) => `[${q.target}] ${q.question}`),
    };
    console.log(`${s.slug.padEnd(22)} card=${sealed.json.card.field} | items=${sealed.json.metrics.item_count} rare=${sealed.json.metrics.rare_count} gen=${sealed.json.metrics.generalized_count} | ${total_ms} ms`);
  }
  writeFileSync("mock/seed-output.json", JSON.stringify({ base: BASE, seeded_at: new Date().toISOString(), cards: out }, null, 2) + "\n");
  console.log("\nsaved mock/seed-output.json");
})().catch((e) => { console.error(e); process.exit(1); });

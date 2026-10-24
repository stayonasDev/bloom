/**
 * 매칭 보드용 카드 8장을 Claude 호출 없이 Supabase에 직접 삽입한다.
 * sellers → interviews(status=sealed, seed_answers={}) → packs → cards → claude_runs(followup·extract, metrics.preseeded=true)
 * 환경: .env의 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (값은 출력하지 않음). 실행: npm run preseed
 * 결과: mock/preseed-output.json. 같은 slug를 두 번 넣지 않도록 output에 있는 slug는 건너뛴다.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const f of [".env", ".env.local"]) if (existsSync(f)) { try { process.loadEnvFile(f); } catch {} }
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const MODEL = process.env.ANTHROPIC_MODEL ?? "preseeded";

// 서버 상수와 같은 식 (docs/PRD.md P1)
const pricePack = (items: number) => Math.min(499, Math.max(49, items * 7));
const priceCase = (rarity: number) => 8 + rarity * 3;

type Item = { id: string; text: string; kind: "rare" | "manual"; source: string };
type Pre = {
  slug: string; seller: { role_title: string; years_experience: number; language: string; display_name: string };
  card: { field: string; field_key: string; difficulty: number; rarity: number; one_liner: string }; card_language?: string;
  handover_note: Record<string, Item[]>; generalization_log: { type: string; replaced_with: string; count: number }[];
  metrics: { followup_ms: number; extract_ms: number };
};

(async () => {
  const outPath = "mock/preseed-output.json";
  const out: Record<string, unknown> = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).cards ?? {} : {};
  for (const f of readdirSync("mock/preseed").filter((x) => x.endsWith(".json")).sort()) {
    const p: Pre = JSON.parse(readFileSync(join("mock/preseed", f), "utf8"));
    if (out[p.slug]) { console.log(`${p.slug.padEnd(24)} skip (already in output)`); continue; }
    const items = Object.values(p.handover_note).flat();
    const item_count = items.length, rare_count = items.filter((i) => i.kind === "rare").length;
    const generalized_count = p.generalization_log.reduce((s, g) => s + g.count, 0);

    const seller = await db.from("sellers").insert({ ...p.seller, language: p.seller.language === "KO" ? "KO" : "EN" }).select("id").single();
    if (seller.error) throw new Error(`${p.slug} sellers: ${seller.error.message}`);
    const iv = await db.from("interviews").insert({ seller_id: seller.data.id, status: "sealed", seed_answers: {}, notes: null, followup_questions: [], followup_answers: {}, sealed_at: new Date().toISOString() }).select("id").single();
    if (iv.error) throw new Error(`${p.slug} interviews: ${iv.error.message}`);
    const pack = await db.from("packs").insert({
      seller_id: seller.data.id, interview_id: iv.data.id, handover_note: p.handover_note, generalization_log: p.generalization_log,
      item_count, rare_count, manual_count: item_count - rare_count, generalized_count,
      price_pack_usd: pricePack(item_count), price_case_usd: priceCase(p.card.rarity),
    }).select("id").single();
    if (pack.error) throw new Error(`${p.slug} packs: ${pack.error.message}`);
    const card = await db.from("cards").insert({
      pack_id: pack.data.id, field: p.card.field, language: p.card_language ?? p.seller.language, years_experience: p.seller.years_experience,
      difficulty: p.card.difficulty, rarity: p.card.rarity, one_liner: p.card.one_liner,
      price_pack_usd: pricePack(item_count), price_case_usd: priceCase(p.card.rarity), listed_at: new Date().toISOString(),
    }).select("id").single();
    if (card.error) throw new Error(`${p.slug} cards: ${card.error.message}`);
    const runs = await db.from("claude_runs").insert([
      { kind: "followup", ref_table: "interviews", ref_id: iv.data.id, model: MODEL, duration_ms: p.metrics.followup_ms, metrics: { question_count: 3, preseeded: true } },
      { kind: "extract", ref_table: "packs", ref_id: pack.data.id, model: MODEL, duration_ms: p.metrics.extract_ms, metrics: { item_count, rare_count, manual_count: item_count - rare_count, generalized_count, preseeded: true } },
    ]);
    if (runs.error) throw new Error(`${p.slug} claude_runs: ${runs.error.message}`);
    out[p.slug] = { seller_id: seller.data.id, interview_id: iv.data.id, pack_id: pack.data.id, card_id: card.data.id, field: p.card.field, field_key: p.card.field_key, rarity: p.card.rarity, item_count, rare_count, generalized_count, price_pack_usd: pricePack(item_count), price_case_usd: priceCase(p.card.rarity) };
    console.log(`${p.slug.padEnd(24)} card=${card.data.id} items=${item_count} rare=${rare_count} $${pricePack(item_count)} / $${priceCase(p.card.rarity)}/case`);
  }
  writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), cards: out }, null, 2) + "\n");
  console.log(`\nsaved ${outPath}`);
})().catch((e) => { console.error(e); process.exit(1); });

// 통합 스모크 — 실제 dev 서버(BASE_URL) + 실제 Supabase + 실제 Claude로 API.md의 데모 경로를 끝까지 돈다.
// 사용: npm run dev (다른 터미널) → npm run smoke
// 검증: HTTP 코드, 응답 필드, 봉인 규칙(인계서가 note 외 응답에 없음), 거부 규칙, 구매 전/후 note 접근.
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const root = path.resolve(import.meta.dirname, "..");
const sample = JSON.parse(readFileSync(path.join(root, "mock/sellers/telecom-billing-en.json"), "utf8"));
const requests = JSON.parse(readFileSync(path.join(root, "mock/requests.json"), "utf8")) as { buyer_type: string; request_text: string }[];
const sealedQuestions = JSON.parse(readFileSync(path.join(root, "mock/sealed_questions.json"), "utf8")) as { question: string; expect_covered: boolean }[];

let failures = 0;
const t0 = Date.now();
const ok = (cond: unknown, msg: string) => { if (!cond) { failures++; console.log(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };
const step = (s: string) => console.log(`\n▶ ${s}`);

async function call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
  const t = Date.now();
  const res = await fetch(BASE + p, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  console.log(`  ${method} ${p} → ${res.status} (${Date.now() - t} ms)`);
  return { status: res.status, json };
}
const noNote = (json: unknown, what: string) => ok(!JSON.stringify(json).includes("handover_note"), `${what}: no handover_note in response`);

async function main() {
  step("POST /api/sellers");
  const seller = await call("POST", "/api/sellers", sample.seller);
  ok(seller.status === 201 && seller.json.id, "201 + id");
  const S = { "x-seller-id": seller.json.id };

  step("POST /api/interviews — rejection (log paste), no Claude call");
  const log = Array.from({ length: 10 }, (_, i) => `${i % 2 ? "Customer" : "Agent"}: line ${i} at 10:${10 + i}`).join("\n");
  const rej = await call("POST", "/api/interviews", { seed_answers: { ...sample.seed_answers, q4: log } }, S);
  ok(rej.status === 422 && rej.json.error.code === "LOG_PASTE_SUSPECTED" && rej.json.error.field === "seed_answers.q4", "422 LOG_PASTE_SUSPECTED seed_answers.q4");

  step("POST /api/interviews — Claude ① followup");
  const iv = await call("POST", "/api/interviews", { seed_answers: sample.seed_answers, notes: sample.notes }, S);
  ok(iv.status === 201 && iv.json.status === "draft", "201 draft");
  const qs = iv.json.followup_questions ?? [];
  ok(qs.length >= 2 && qs.length <= 3, `2–3 follow-up questions (got ${qs.length})`);
  ok(qs.every((q: { id: string; target: string }, i: number) => q.id === `f${i + 1}` && ["rare", "detail"].includes(q.target)), "ids f1..fn, target rare|detail");
  ok(iv.json.run?.kind === "followup" && iv.json.run.duration_ms > 0 && iv.json.run.question_count === qs.length, "run {kind, duration_ms, question_count}");
  for (const q of qs) console.log(`    ${q.id} [${q.target}] ${q.question}`);

  step("POST /api/interviews/{id}/seal — Claude ② extract (wrong owner first)");
  const answers: Record<string, string> = {};
  qs.forEach((q: { id: string }, i: number) => { answers[q.id] = sample.followup_answers[`f${i + 1}`] ?? sample.followup_answers.f1; });
  const forb = await call("POST", `/api/interviews/${iv.json.id}/seal`, { followup_answers: answers }, { "x-seller-id": "00000000-0000-4000-8000-000000000000" });
  ok(forb.status === 403, "403 FORBIDDEN for non-owner");
  const seal = await call("POST", `/api/interviews/${iv.json.id}/seal`, { followup_answers: answers }, S);
  ok(seal.status === 201 && seal.json.pack_id && seal.json.card?.id, "201 pack_id + card");
  noNote(seal.json, "seal");
  const met = seal.json.metrics ?? {};
  ok(met.item_count >= 10, `item_count ≥ 10 (got ${met.item_count})`);
  ok(met.rare_count > 0 && met.rare_count + met.manual_count === met.item_count, `rare ${met.rare_count} + manual ${met.manual_count} = ${met.item_count}`);
  ok(seal.json.card.price_pack_usd === Math.min(Math.max(met.item_count * 7, 49), 499), `price_pack_usd = clamp(item_count×7) = ${seal.json.card.price_pack_usd}`);
  ok(seal.json.card.price_case_usd === 8 + seal.json.card.rarity * 3, `price_case_usd = 8 + rarity×3 = ${seal.json.card.price_case_usd}`);
  console.log(`    card: ${seal.json.card.field} · D${seal.json.card.difficulty} R${seal.json.card.rarity} · "${seal.json.card.one_liner}"`);
  console.log(`    generalized_count ${met.generalized_count}, extract ${seal.json.run.duration_ms} ms`);
  const packId = seal.json.pack_id, cardId = seal.json.card.id;

  step("POST seal again → 400 (not draft)");
  const again = await call("POST", `/api/interviews/${iv.json.id}/seal`, { followup_answers: answers }, S);
  ok(again.status === 400 && again.json.error.field === "status", "400 VALIDATION_ERROR status");

  step("GET /api/packs/{id}/note — owner reads sealed note");
  const own = await call("GET", `/api/packs/${packId}/note`, undefined, S);
  ok(own.status === 200 && own.json.handover_note?.rules, "200 with handover_note (owner)");
  const note = own.json.handover_note;
  const items = Object.values(note).flat() as { id: string; text: string; kind: string; source: string }[];
  ok(items.every((it) => /^[rejmn]\d+$/.test(it.id) && ["rare", "manual"].includes(it.kind)), "item ids r/e/j/m/n + kind rare|manual");
  const leaked = /\b(Globe|Smart|PLDT|Verizon|AT&T|T-Mobile|Salesforce|Zendesk)\b/i.test(JSON.stringify(note));
  ok(!leaked, "no obvious company/system names in note");
  for (const [sec, arr] of Object.entries(note)) console.log(`    ${sec}: ${(arr as unknown[]).length}`);

  step("POST /api/buyers");
  const buyer = await call("POST", "/api/buyers", { buyer_type: "ai_ops", display_name: "Buyer #11" });
  ok(buyer.status === 201 && buyer.json.id, "201 + id");
  const B = { "x-buyer-id": buyer.json.id };

  step("GET /api/packs/{id}/note — buyer BEFORE purchase → 403");
  const pre = await call("GET", `/api/packs/${packId}/note`, undefined, B);
  ok(pre.status === 403 && pre.json.error.message === "Unlock this pack to read the full note.", "403 Unlock this pack…");

  step("GET /api/cards, GET /api/cards/{id}");
  const list = await call("GET", "/api/cards?limit=20");
  ok(list.status === 200 && list.json.cards.some((c: { id: string }) => c.id === cardId), "card listed");
  noNote(list.json, "cards");
  ok(list.json.cards.every((c: Record<string, unknown>) => c.pack_id === packId && typeof c.item_count === "number" || c.id !== cardId), "has pack_id + item_count");
  const detail = await call("GET", `/api/cards/${cardId}`, undefined, B);
  ok(detail.status === 200 && detail.json.unlocked === false && detail.json.sealed_qa_count === 0 && detail.json.rare_count === met.rare_count, "detail: unlocked=false, sealed_qa_count=0, rare_count");
  noNote(detail.json, "card detail");

  step("POST /api/requests — Claude ③ match");
  const rq = await call("POST", "/api/requests", { request_text: requests[0].request_text }, B);
  ok(rq.status === 201 && rq.json.request_id, "201 request_id");
  noNote(rq.json, "requests");
  ok(rq.json.matches.length >= 1 && rq.json.matches.length <= 3, `1–3 matches (got ${rq.json.matches.length})`);
  // 스모크를 여러 번 돌리면 거의 같은 통신 카드가 여러 장 → 새 카드가 1위가 아닐 수 있다. 1위가 통신 분야이고 새 카드가 후보에 포함됐는지만 본다.
  const matchedNew = rq.json.matches.some((mt: { card: { id: string } }) => mt.card.id === cardId);
  ok(/telecom/i.test(rq.json.matches[0]?.card?.field ?? ""), `rank 1 is a telecom card (${rq.json.matches[0]?.card?.field})`);
  ok(rq.json.run.candidate_count === 1 ? matchedNew : true, "new card matched when it is the only candidate");
  ok(rq.json.run.kind === "match" && rq.json.run.candidate_count >= 1, "run.candidate_count");
  for (const mt of rq.json.matches) console.log(`    #${mt.rank} ${mt.score} ${mt.card.field} — ${mt.reason}`);

  // 구매 전 무료 3회 → 4번째는 429 → 구매 → 나머지 질문 (프론트 "n of 3 free"와 같은 흐름)
  let coveredOk = 0;
  const askOne = async (q: { question: string; expect_covered: boolean }) => {
    const a = await call("POST", `/api/cards/${cardId}/ask`, { question: q.question }, B);
    const good = a.status === 201 && typeof a.json.evidence_count === "number" && a.json.total_items === met.item_count && typeof a.json.covered === "boolean";
    ok(good, `201 shape — "${q.question.slice(0, 50)}…"`);
    noNote(a.json, "ask");
    ok(!items.some((it) => a.json.answer?.includes(it.text)), "answer does not reproduce an item verbatim");
    if (a.json.covered === q.expect_covered) coveredOk++;
    console.log(`    covered=${a.json.covered} (expected ${q.expect_covered}) · based on ${a.json.evidence_count} of ${a.json.total_items} · ${a.json.run.duration_ms} ms\n    → ${a.json.answer}`);
  };

  step("POST /api/cards/{id}/ask — Claude ④ Sealed Q&A ×3 (free), then 4th → 429");
  for (const q of sealedQuestions.slice(0, 3)) await askOne(q);
  const limited = await call("POST", `/api/cards/${cardId}/ask`, { question: sealedQuestions[3].question }, B);
  ok(limited.status === 429 && limited.json.error.message === "Unlock the pack to keep asking.", "429 Unlock the pack to keep asking.");
  const detail2 = await call("GET", `/api/cards/${cardId}`, undefined, B);
  ok(detail2.json.sealed_qa_count === 3, "sealed_qa_count = 3");

  step("POST /api/buyers again with x-buyer-id → 200 same buyer (front calls it every search)");
  const buyerAgain = await call("POST", "/api/buyers", { buyer_type: "ai_ops" }, B);
  ok(buyerAgain.status === 200 && buyerAgain.json.id === buyer.json.id, "200 same id, no new buyer");

  step("POST /api/packs/{id}/purchase — mock payment (using CARD id, as the front's packIdOf does)");
  const cs = await call("POST", `/api/packs/${cardId}/purchase`, { kind: "case" }, B);
  ok(cs.status === 400 && cs.json.error.message === "Coming soon.", "400 Coming soon. for kind=case");
  const buy = await call("POST", `/api/packs/${cardId}/purchase`, { kind: "pack" }, B);
  ok(buy.status === 201 && buy.json.status === "mock_paid" && buy.json.unlocked === true && buy.json.amount_usd === seal.json.card.price_pack_usd, "201 mock_paid, amount = price_pack_usd");
  ok(buy.json.pack_id === packId, "response pack_id is the real pack id (card id resolved)");
  const buy2 = await call("POST", `/api/packs/${packId}/purchase`, { kind: "pack" }, B);
  ok(buy2.status === 200 && buy2.json.purchase_id === buy.json.purchase_id, "200 same purchase on repeat (pack id)");

  step("POST /api/cards/{id}/ask — after purchase, remaining 3 (no limit)");
  for (const q of sealedQuestions.slice(3)) await askOne(q);
  ok(coveredOk >= 5, `covered matches expectation on ≥5/6 (got ${coveredOk})`);

  step("GET /api/packs/{id}/note — buyer AFTER purchase → 200");
  const post = await call("GET", `/api/packs/${packId}/note`, undefined, B);
  ok(post.status === 200 && JSON.stringify(post.json.handover_note) === JSON.stringify(note), "200 same note as owner");
  const detail3 = await call("GET", `/api/cards/${cardId}`, undefined, B);
  ok(detail3.json.unlocked === true, "card detail unlocked=true");

  step("GET /api/packs/{id}/trace — What Claude did");
  const tr = await call("GET", `/api/packs/${packId}/trace`);
  ok(tr.status === 200, "200");
  noNote(tr.json, "trace");
  ok(tr.json.followup.question_count === qs.length && tr.json.followup.duration_ms === iv.json.run.duration_ms, "followup matches interview run");
  ok(tr.json.extract.item_count === met.item_count && tr.json.extract.duration_ms === seal.json.run.duration_ms, "extract matches seal run");
  if (matchedNew) ok(tr.json.last_match?.request_id === rq.json.request_id && tr.json.last_match.duration_ms === rq.json.run.duration_ms, "last_match matches request run");
  else ok(tr.json.last_match === null, "last_match null (new card was not among top 3 — duplicates from earlier smoke runs)");
  ok(tr.json.sealed_qa.count === sealedQuestions.length && tr.json.sealed_qa.avg_duration_ms > 0, "sealed_qa aggregate");
  ok(tr.json.total_ms >= tr.json.followup.duration_ms + tr.json.extract.duration_ms, "total_ms");
  console.log(`    Follow-up ${tr.json.followup.question_count} · Items ${tr.json.extract.item_count} (rare ${tr.json.extract.rare_count} · manual ${tr.json.extract.manual_count}) · Generalized ${tr.json.extract.generalized_count} · Match ${tr.json.last_match?.duration_ms} ms · Q&A ${tr.json.sealed_qa.avg_duration_ms} ms · Total ${tr.json.total_ms} ms · ${tr.json.model}`);

  console.log(`\n${failures === 0 ? "SMOKE PASSED" : `SMOKE FAILED: ${failures} check(s)`} in ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`pack_id=${packId} card_id=${cardId} seller=${seller.json.id} buyer=${buyer.json.id}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

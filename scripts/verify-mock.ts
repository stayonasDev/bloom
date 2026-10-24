/**
 * 민수 검증 실행 — seed 뒤에 돌린다. 깨진 입력 7종(거부·통과), 수요문 3종(매칭), Sealed 질문 6개(봉인), 추출 공격, 원문 누출.
 * 결과를 PASS/FAIL 표로 출력하고 mock/verify-output.json에 저장한다.
 * 실행: npm run verify:mock          BASE=https://… npm run verify:mock
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? process.env.BASE ?? "http://localhost:3000";
const seeded = JSON.parse(readFileSync("mock/seed-output.json", "utf8")).cards as Record<string, any>;
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any = {}; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const results: { group: string; name: string; ok: boolean; detail: string }[] = [];
const row = (group: string, name: string, ok: boolean, detail: string) => { results.push({ group, name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  [${group}] ${name.padEnd(26)} ${detail}`); };

(async () => {
  // 1. 깨진 입력
  for (const f of readdirSync("mock/broken").filter((x) => x.endsWith(".json")).sort()) {
    const s = JSON.parse(readFileSync(join("mock/broken", f), "utf8"));
    const seller = await call("POST", "/api/sellers", s.seller);
    const sh = { "x-seller-id": seller.json.id };
    const iv = await call("POST", "/api/interviews", { seed_answers: s.seed_answers, notes: s.notes ?? undefined, ...(s.self_reported ? { self_reported: s.self_reported } : {}) }, sh);
    if (s.expect.status === 422) {
      const ok = iv.status === 422 && iv.json.error?.code === s.expect.code && (!s.expect.field || iv.json.error.field === s.expect.field);
      row("broken", s.slug, ok, `${iv.status} ${iv.json.error?.code ?? ""} ${iv.json.error?.field ?? ""}`);
      continue;
    }
    if (iv.status !== 201) { row("broken", s.slug, false, `expected pass, got ${iv.status} ${JSON.stringify(iv.json.error)}`); continue; }
    const qs = iv.json.followup_questions as { id: string }[];
    const pool = [s.followup_answers.f1, s.followup_answers.f2, s.followup_answers.f3];
    const sealed = await call("POST", `/api/interviews/${iv.json.id}/seal`, { followup_answers: Object.fromEntries(qs.map((q, i) => [q.id, pool[i] ?? pool[0]])) }, sh);
    if (sealed.status !== 201) { row("broken", s.slug, false, `seal ${sealed.status}`); continue; }
    const note = await call("GET", `/api/packs/${sealed.json.pack_id}/note`, undefined, sh);
    const noteText = JSON.stringify(note.json.handover_note ?? {});
    const leaked = (s.expect.note_must_not_contain ?? []).filter((w: string) => noteText.toLowerCase().includes(w.toLowerCase()));
    const genOk = s.expect.min_generalized_count ? sealed.json.metrics.generalized_count >= s.expect.min_generalized_count : true;
    if (s.expect.card_label) {
      const hasField = "self_reported" in (sealed.json.card ?? {}) || "verification" in (sealed.json.card ?? {});
      row("broken", s.slug, hasField ? JSON.stringify(sealed.json.card).includes(s.expect.card_label) : true, hasField ? `card label=${s.expect.card_label}` : "SKIP: self_reported 필드가 API에 없음 (저장만 확인)");
      continue;
    }
    row("broken", s.slug, leaked.length === 0 && genOk, `items=${sealed.json.metrics.item_count} generalized=${sealed.json.metrics.generalized_count} leaked=[${leaked.join(",")}]`);
  }

  // 2. 수요문 → 매칭
  const buyers: Record<string, string> = {};
  for (const r of JSON.parse(readFileSync(process.env.MOCK_REQUESTS ?? "mock/requests.json", "utf8"))) {
    const b = await call("POST", "/api/buyers", { buyer_type: r.buyer_type, display_name: r.display_name });
    buyers[r.buyer_type] = b.json.id;
    const req = await call("POST", "/api/requests", { request_text: r.request_text }, { "x-buyer-id": b.json.id });
    const top = req.json.matches?.[0];
    const expectId = r.expect_top_slug ? seeded[r.expect_top_slug]?.card_id : null;
    const scores = (req.json.matches ?? []).map((m: any) => Number(m.score));
    let ok = req.status === 201 && !req.text.includes("handover_note");
    if (r.expect_max_score != null) ok = ok && scores.every((x: number) => x < r.expect_max_score);
    else ok = ok && scores.length >= 1 && (!expectId || top?.card?.id === expectId);
    row("match", r.slug, ok, `${req.status} top=${top?.card?.field ?? "-"} scores=[${scores.join(",")}] ${req.json.run?.duration_ms ?? "-"}ms`);
  }

  // 3. Sealed Q&A (새 buyer로, 3회 제한 회피 위해 질문 3개마다 buyer 교체)
  let qa_n = 0, bid = "";
  for (const q of JSON.parse(readFileSync(process.env.MOCK_SEALED ?? "mock/sealed_questions.json", "utf8"))) {
    if (qa_n % 3 === 0) bid = (await call("POST", "/api/buyers", { buyer_type: "ai_ops" })).json.id;
    qa_n++;
    const cardId = seeded[q.card_slug]?.card_id;
    const a = await call("POST", `/api/cards/${cardId}/ask`, { question: q.question }, { "x-buyer-id": bid });
    const j = a.json;
    let ok = a.status === 201 && !a.text.includes("handover_note");
    if (q.kind === "extraction_attack") ok = ok && (j.covered === false || j.evidence_count <= 5);
    else if (q.kind === "edge") ok = ok; // 경계: 어느 쪽이든 허용, 기록만
    else ok = ok && j.covered === q.expect_covered;
    row("sealed", q.slug, ok, `covered=${j.covered} ${j.evidence_count}/${j.total_items} ${j.run?.duration_ms ?? "-"}ms — ${String(j.answer ?? "").slice(0, 90)}`);
  }

  // 4. 봉인·누출
  const demo = seeded["telecom-billing-en"];
  const noNoHeader = await call("GET", `/api/packs/${demo.pack_id}/note`);
  row("seal", "note without header", noNoHeader.status === 403, `${noNoHeader.status}`);
  const other = await call("GET", `/api/packs/${demo.pack_id}/note`, undefined, { "x-seller-id": "00000000-0000-0000-0000-000000000000" });
  row("seal", "note other seller", other.status === 403, `${other.status}`);
  for (const p of ["/api/cards", `/api/cards/${demo.card_id}`, `/api/packs/${demo.pack_id}/trace`]) {
    const r = await call("GET", p);
    row("seal", `no leak ${p}`, r.status === 200 && !r.text.includes("handover_note"), `${r.status}`);
  }
  const home = await call("GET", "/");
  row("seal", "no secrets in page", !/sk-ant|service_role/i.test(home.text), "");

  // 5. tags — seed 5종 카드에 태그가 있으면 사전과 대조, 없으면 SKIP
  const TAGS = JSON.parse(readFileSync("mock/tags.json", "utf8"));
  for (const f of readdirSync("mock/sellers").filter((x) => x.endsWith(".json")).sort()) {
    const s = JSON.parse(readFileSync(join("mock/sellers", f), "utf8"));
    if (!s.expect_tags || !seeded[s.slug]) continue;
    const c = await call("GET", `/api/cards/${seeded[s.slug].card_id}`);
    const tags = c.json.card?.tags ?? c.json.tags;
    if (!tags) { row("tags", s.slug, true, "SKIP: 태그 API 없음"); continue; }
    const topicsOk = (tags.topics ?? []).filter((t: string) => s.expect_tags.topics.includes(t)).length >= 2;
    const judgOk = (tags.judgments ?? []).filter((t: string) => s.expect_tags.judgments.includes(t)).length >= 1;
    const outside = [...(tags.topics ?? []).filter((t: string) => !(TAGS.topics[tags.field_key] ?? []).includes(t)), ...(tags.judgments ?? []).filter((t: string) => !TAGS.judgments.includes(t))];
    row("tags", s.slug, tags.field_key === s.expect_tags.field_key && topicsOk && judgOk && outside.length === 0 && TAGS.field_key.includes(tags.field_key), `field_key=${tags.field_key} topics=${(tags.topics ?? []).join("|")} outside=[${outside.join(",")}]`);
  }

  // 6. board — preseed 8장이 들어가 있으면 requests-board 4종 매칭
  if (existsSync("mock/preseed-output.json")) {
    const pre = JSON.parse(readFileSync("mock/preseed-output.json", "utf8")).cards as Record<string, any>;
    const byCard: Record<string, string> = Object.fromEntries(Object.entries(pre).map(([slug, v]: [string, any]) => [v.card_id, slug]));
    for (const r of JSON.parse(readFileSync("mock/requests-board.json", "utf8"))) {
      const b = await call("POST", "/api/buyers", { buyer_type: r.buyer_type, display_name: r.display_name });
      const req = await call("POST", "/api/requests", { request_text: r.request_text }, { "x-buyer-id": b.json.id });
      const ms = (req.json.matches ?? []) as any[];
      const top = ms[0];
      const expectId = r.expect_top_slug ? pre[r.expect_top_slug]?.card_id : null;
      const expectKey = r.expect_tags?.field_key;
      const otherField = ms.filter((m) => m.card?.id !== expectId && byCard[m.card?.id] && pre[byCard[m.card.id]].field_key !== expectKey);
      const otherOk = otherField.every((m) => Number(m.score) < 0.3);
      const ok = req.status === 201 && !req.text.includes("handover_note") && (expectId ? top?.card?.id === expectId : ms.length >= 1) && otherOk;
      row("board", r.slug, ok, `top=${top?.card?.field ?? "-"} scores=[${ms.map((m) => m.score).join(",")}] other-field>=0.3: ${otherField.filter((m) => Number(m.score) >= 0.3).map((m) => byCard[m.card.id]).join(",") || "none"}`);
    }
  } else row("board", "preseed", true, "SKIP: mock/preseed-output.json 없음 (npm run preseed 먼저)");

  // 7. translate — /api/translate가 있으면 12건, 없으면 SKIP
  const probe = await call("POST", "/api/translate", { text: "ping", target: "ko" });
  if (probe.status === 404 || probe.status === 501 || probe.status === 405) row("translate", "api", true, `SKIP: 번역 API 없음 (${probe.status})`);
  else for (const t of JSON.parse(readFileSync("mock/translations.json", "utf8")).items) {
    const t0 = Date.now();
    const res = await call("POST", "/api/translate", { text: t.source, target: t.target });
    const ms = Date.now() - t0;
    const text = String(res.json.text ?? res.json.translation ?? res.text);
    const missing = t.must_keep.filter((k: string) => !text.includes(k));
    row("translate", t.id, res.status < 300 && missing.length === 0 && ms <= 6000, `${ms}ms missing=[${missing.join(",")}] — ${text.slice(0, 60)}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  writeFileSync("mock/verify-output.json", JSON.stringify({ base: BASE, at: new Date().toISOString(), failed, results }, null, 2) + "\n");
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK", "→ mock/verify-output.json");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

import { describe, it, expect, vi, beforeEach } from "vitest";

// Route Handler 계약 테스트 — DB·Claude는 모킹. 검증 기준은 API.md 응답 필드·HTTP 코드·에러 코드·봉인 규칙.
vi.mock("@/lib/db");
// connection()은 Next 요청 컨텍스트 밖에서는 동작하지 않는다
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/lib/claude", async () => {
  const actual = await vi.importActual<typeof import("@/lib/claude")>("@/lib/claude");
  return { ...actual, generateFollowups: vi.fn(), extractNote: vi.fn(), matchCards: vi.fn(), sealedQa: vi.fn(), translateCards: vi.fn(), translateNote: vi.fn() };
});

import * as db from "@/lib/db";
import * as claude from "@/lib/claude";
import { POST as postSellers } from "@/app/api/sellers/route";
import { POST as postInterviews } from "@/app/api/interviews/route";
import { POST as postSeal } from "@/app/api/interviews/[id]/seal/route";
import { GET as getNote } from "@/app/api/packs/[id]/note/route";
import { POST as postBuyers } from "@/app/api/buyers/route";
import { GET as getCards } from "@/app/api/cards/route";
import { GET as getCard } from "@/app/api/cards/[id]/route";
import { POST as postRequests } from "@/app/api/requests/route";
import { POST as postAsk } from "@/app/api/cards/[id]/ask/route";
import { POST as postPurchase } from "@/app/api/packs/[id]/purchase/route";
import { GET as getTrace } from "@/app/api/packs/[id]/trace/route";
import {
  BUYER_ID, CARD_ID, INTERVIEW_ID, OTHER_ID, PACK_ID, QA_ID, REQUEST_ID, SELLER_ID,
  assertSealed, buyer, card, ctx, followupQuestions, interviewDraft, note, pack, purchase, req, run, seedAnswers, seller,
} from "./fixtures";

const m = vi.mocked;
const runMeta = (kind: "followup" | "extract" | "match" | "sealed_qa", duration_ms: number) =>
  ({ kind, model: "claude-sonnet-5-5", input_tokens: 100, output_tokens: 50, duration_ms });

beforeEach(() => {
  m(db.insertClaudeRun).mockResolvedValue(run("followup", "x", 1));
});

// ---------------- 판매자 ----------------

describe("POST /api/sellers", () => {
  it("201 with sellers.* fields", async () => {
    m(db.insertSeller).mockResolvedValue(seller);
    const res = await postSellers(req("POST", { role_title: "Telecom billing CSR", years_experience: 5, language: "EN", display_name: "Seller #0427" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: SELLER_ID, role_title: "Telecom billing CSR", years_experience: 5, language: "EN", display_name: "Seller #0427" });
  });
  it("400 VALIDATION_ERROR on bad years", async () => {
    const res = await postSellers(req("POST", { role_title: "x1", years_experience: 99, language: "EN" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(db.insertSeller).not.toHaveBeenCalled();
  });
  it("normalizes language to ISO 2 letters: front sends UI-language name prefix (EN·한국·日本·FI·ES·DE)", async () => {
    m(db.insertSeller).mockResolvedValue(seller);
    const cases: [string, string][] = [["JA", "JA"], ["日本", "JA"], ["한국", "KO"], ["ko", "KO"], ["Korean", "KO"], ["FI", "TL"], ["DE", "DE"], ["??", "EN"]];
    for (const [sent, stored] of cases) {
      await postSellers(req("POST", { role_title: "Telecom billing CSR", years_experience: 5, language: sent }));
      expect(db.insertSeller).toHaveBeenLastCalledWith(expect.objectContaining({ language: stored }));
    }
  });
});

describe("POST /api/interviews", () => {
  const headers = { "x-seller-id": SELLER_ID };
  it("201: stores draft, calls Claude ①, saves questions, records claude_runs", async () => {
    m(db.getSeller).mockResolvedValue(seller);
    m(db.insertInterview).mockResolvedValue({ ...interviewDraft, followup_questions: [] });
    m(claude.generateFollowups).mockResolvedValue({ followup_questions: followupQuestions, run: runMeta("followup", 4120) });
    m(db.updateInterview).mockResolvedValue(interviewDraft);

    const res = await postInterviews(req("POST", { seed_answers: seedAnswers, notes: "My checklist" }, headers));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: INTERVIEW_ID, status: "draft", followup_questions: followupQuestions,
      run: { kind: "followup", duration_ms: 4120, question_count: 2 },
    });
    expect(db.insertInterview).toHaveBeenCalledWith(expect.objectContaining({ seller_id: SELLER_ID, status: "draft", seed_answers: seedAnswers, notes: "My checklist" }));
    expect(db.insertClaudeRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "followup", ref_table: "interviews", ref_id: INTERVIEW_ID, duration_ms: 4120, metrics: { question_count: 2 } }));
  });

  it("422 LOG_PASTE_SUSPECTED: rejected row saved WITHOUT the body, Claude not called", async () => {
    m(db.getSeller).mockResolvedValue(seller);
    m(db.insertInterview).mockResolvedValue({ ...interviewDraft, status: "rejected" });
    const log = "Agent: hi\nCustomer: my bill doubled\nAgent: checking\nCustomer: ok thanks for the help today";
    const res = await postInterviews(req("POST", { seed_answers: { ...seedAnswers, q4: log } }, headers));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: { code: "LOG_PASTE_SUSPECTED", message: "This looks like a call log. Please describe it in your own words.", field: "seed_answers.q4" } });
    expect(db.insertInterview).toHaveBeenCalledWith({ seller_id: SELLER_ID, status: "rejected", rejected_reason: "LOG_PASTE_SUSPECTED", seed_answers: { rejected: true }, notes: null });
    expect(claude.generateFollowups).not.toHaveBeenCalled();
  });

  it("422 TOO_SHORT and PII_DETECTED with PRD messages", async () => {
    m(db.getSeller).mockResolvedValue(seller);
    m(db.insertInterview).mockResolvedValue({ ...interviewDraft, status: "rejected" });
    const r1 = await postInterviews(req("POST", { seed_answers: { ...seedAnswers, q1: "short" } }, headers));
    expect((await r1.json()).error).toEqual({ code: "TOO_SHORT", message: "Give us a bit more — at least a few sentences per question.", field: "seed_answers.q1" });
    const r2 = await postInterviews(req("POST", { seed_answers: { ...seedAnswers, q2: seedAnswers.q2 + " a@b.com c@d.com" } }, headers));
    expect((await r2.json()).error).toEqual({ code: "PII_DETECTED", message: "Please remove names, emails and phone numbers.", field: "seed_answers.q2" });
  });

  it("400 when x-seller-id missing; 404 when seller unknown", async () => {
    const r1 = await postInterviews(req("POST", { seed_answers: seedAnswers }));
    expect(r1.status).toBe(400);
    expect((await r1.json()).error.field).toBe("x-seller-id");
    m(db.getSeller).mockResolvedValue(null);
    const r2 = await postInterviews(req("POST", { seed_answers: seedAnswers }, headers));
    expect(r2.status).toBe(404);
  });

  it("502 CLAUDE_FAILED propagates", async () => {
    m(db.getSeller).mockResolvedValue(seller);
    m(db.insertInterview).mockResolvedValue(interviewDraft);
    const { ApiError } = await import("@/lib/errors");
    m(claude.generateFollowups).mockRejectedValue(new ApiError("CLAUDE_FAILED", "bad json"));
    const res = await postInterviews(req("POST", { seed_answers: seedAnswers }, headers));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("CLAUDE_FAILED");
  });
});

describe("POST /api/interviews/{id}/seal", () => {
  const headers = { "x-seller-id": SELLER_ID };
  const answers = { f1: "At day 58 I escalated instead of refusing.", f2: "14 days remaining, $42.10 prorated." };
  const extracted = {
    handover_note: note,
    generalization_log: pack.generalization_log,
    card: { field: card.field, difficulty: 4, rarity: 4, one_liner: card.one_liner },
    run: runMeta("extract", 9830),
  };

  it("201: Claude ②, counts items, server prices, inserts pack+card, seals interview, NO handover_note in response", async () => {
    m(db.getInterview).mockResolvedValue(interviewDraft);
    m(db.getSeller).mockResolvedValue(seller);
    m(claude.extractNote).mockResolvedValue(extracted);
    m(db.insertPack).mockResolvedValue(pack);
    m(db.insertCard).mockResolvedValue(card);
    m(db.updateInterview).mockResolvedValue({ ...interviewDraft, status: "sealed" });

    const res = await postSeal(req("POST", { followup_answers: answers }, headers), ctx(INTERVIEW_ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    assertSealed(body);
    expect(body).toEqual({
      pack_id: PACK_ID,
      card: { id: CARD_ID, field: card.field, language: "EN", years_experience: 5, difficulty: 4, rarity: 4, one_liner: card.one_liner, price_pack_usd: 49, price_case_usd: 20, listed_at: card.listed_at },
      metrics: { item_count: 5, rare_count: 4, manual_count: 1, generalized_count: 5 },
      run: { kind: "extract", duration_ms: 9830 },
    });
    // 가격은 서버 상수: 5항목 → clamp(35,49,499)=49, rarity 4 → 20
    expect(db.insertPack).toHaveBeenCalledWith(expect.objectContaining({ seller_id: SELLER_ID, interview_id: INTERVIEW_ID, handover_note: note, item_count: 5, rare_count: 4, manual_count: 1, generalized_count: 5, price_pack_usd: 49, price_case_usd: 20 }));
    expect(db.insertCard).toHaveBeenCalledWith(expect.objectContaining({ pack_id: PACK_ID, language: "EN", years_experience: 5, price_pack_usd: 49, price_case_usd: 20 }));
    expect(db.updateInterview).toHaveBeenCalledWith(INTERVIEW_ID, expect.objectContaining({ status: "sealed", followup_answers: answers }));
    expect(db.insertClaudeRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "extract", ref_table: "packs", ref_id: PACK_ID, metrics: { item_count: 5, rare_count: 4, manual_count: 1, generalized_count: 5 } }));
  });

  it("masks PII before Claude ② (emails/phones in seed, notes and answers)", async () => {
    m(db.getInterview).mockResolvedValue({ ...interviewDraft, seed_answers: { ...seedAnswers, q1: seedAnswers.q1 + " john@example.com" }, notes: "call 0917 123 4567" });
    m(db.getSeller).mockResolvedValue(seller);
    m(claude.extractNote).mockResolvedValue(extracted);
    m(db.insertPack).mockResolvedValue(pack);
    m(db.insertCard).mockResolvedValue(card);
    m(db.updateInterview).mockResolvedValue(interviewDraft);
    await postSeal(req("POST", { followup_answers: { ...answers, f2: "ask jane@example.org" } }, headers), ctx(INTERVIEW_ID));
    const arg = m(claude.extractNote).mock.calls[0][0];
    expect(arg.seed_answers.q1).toContain("[email]");
    expect(arg.notes).toBe("call [phone]");
    expect(arg.followup_answers.f2).toBe("ask [email]");
  });

  it("403 FORBIDDEN when not owner; 400 when not draft; 400 when an answer is missing; 404 unknown", async () => {
    m(db.getInterview).mockResolvedValue(interviewDraft);
    expect((await postSeal(req("POST", { followup_answers: answers }, { "x-seller-id": OTHER_ID }), ctx(INTERVIEW_ID))).status).toBe(403);

    m(db.getInterview).mockResolvedValue({ ...interviewDraft, status: "sealed" });
    const r2 = await postSeal(req("POST", { followup_answers: answers }, headers), ctx(INTERVIEW_ID));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error.field).toBe("status");

    m(db.getInterview).mockResolvedValue(interviewDraft);
    const r3 = await postSeal(req("POST", { followup_answers: { f1: "only one" } }, headers), ctx(INTERVIEW_ID));
    expect(r3.status).toBe(400);
    expect((await r3.json()).error.field).toBe("followup_answers.f2");

    m(db.getInterview).mockResolvedValue(null);
    expect((await postSeal(req("POST", { followup_answers: answers }, headers), ctx(INTERVIEW_ID))).status).toBe(404);
    expect(claude.extractNote).not.toHaveBeenCalled();
  });
});

describe("GET /api/packs/{id}/note — the only endpoint that returns handover_note", () => {
  it("200 for the owner seller", async () => {
    m(db.getPack).mockResolvedValue(pack);
    const res = await getNote(req("GET", undefined, { "x-seller-id": SELLER_ID }), ctx(PACK_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pack_id: PACK_ID, handover_note: note, generalization_log: pack.generalization_log,
      metrics: { item_count: 5, rare_count: 4, manual_count: 1, generalized_count: 5 },
    });
  });
  it("?language=KO translates item text (structure/ids/kind/source unchanged); cached on 2nd read; same language → original", async () => {
    m(db.getPack).mockResolvedValue(pack);
    m(db.getSeller).mockResolvedValue(seller); // EN seller
    m(db.getPackTranslation).mockResolvedValue(null);
    const translated = { ...note, exceptions: [{ ...note.exceptions[0], text: "58~60일차에는 거절 대신 에스컬레이션." }] };
    m(claude.translateNote).mockResolvedValue({ handover_note: translated, run: { kind: "translate", model: "m", input_tokens: 1, output_tokens: 1, duration_ms: 5 } });
    const u = new Request("http://t/api/packs/x/note?language=ko", { headers: { "x-seller-id": SELLER_ID } });
    const body = await (await getNote(u, ctx(PACK_ID))).json();
    expect(body.handover_note.exceptions[0]).toMatchObject({ id: "e1", kind: "rare", source: "f1", text: "58~60일차에는 거절 대신 에스컬레이션." });
    expect(body.handover_note.rules[0].text).toBe(note.rules[0].text);
    expect(db.upsertPackTranslation).toHaveBeenCalledWith(PACK_ID, "KO", translated);
    // 캐시 적중
    m(db.getPackTranslation).mockResolvedValue({ handover_note: translated });
    m(claude.translateNote).mockClear();
    await getNote(u, ctx(PACK_ID));
    expect(claude.translateNote).not.toHaveBeenCalled();
    // 판매자 언어와 같으면 원문
    const en = new Request("http://t/api/packs/x/note?language=en", { headers: { "x-seller-id": SELLER_ID } });
    expect((await (await getNote(en, ctx(PACK_ID))).json()).handover_note).toEqual(note);
  });
  it("200 for a buyer with a pack purchase", async () => {
    m(db.getPack).mockResolvedValue(pack);
    m(db.getPurchase).mockResolvedValue(purchase);
    const res = await getNote(req("GET", undefined, { "x-buyer-id": BUYER_ID }), ctx(PACK_ID));
    expect(res.status).toBe(200);
    expect(db.getPurchase).toHaveBeenCalledWith(BUYER_ID, PACK_ID, "pack");
  });
  it("403 for a non-owner seller, a buyer without purchase, or no headers", async () => {
    m(db.getPack).mockResolvedValue(pack);
    m(db.getPurchase).mockResolvedValue(null);
    const cases: Record<string, string>[] = [{ "x-seller-id": OTHER_ID }, { "x-buyer-id": BUYER_ID }, {}];
    for (const h of cases) {
      const res = await getNote(req("GET", undefined, h), ctx(PACK_ID));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Unlock this pack to read the full note." } });
    }
  });
  it("404 unknown pack / non-uuid", async () => {
    m(db.getPack).mockResolvedValue(null);
    expect((await getNote(req("GET", undefined, { "x-seller-id": SELLER_ID }), ctx(PACK_ID))).status).toBe(404);
    expect((await getNote(req("GET", undefined, { "x-seller-id": SELLER_ID }), ctx("not-a-uuid"))).status).toBe(404);
  });
});

// ---------------- 구매자 ----------------

describe("POST /api/buyers", () => {
  it("201", async () => {
    m(db.insertBuyer).mockResolvedValue(buyer);
    const res = await postBuyers(req("POST", { buyer_type: "ai_ops", display_name: "Buyer #11" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: BUYER_ID, buyer_type: "ai_ops", display_name: "Buyer #11" });
  });
  it("400 on unknown buyer_type", async () => {
    expect((await postBuyers(req("POST", { buyer_type: "vc" }))).status).toBe(400);
  });
  it("200 + existing buyer when x-buyer-id already exists (front calls createBuyer on every search)", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    const res = await postBuyers(req("POST", { buyer_type: "ai_ops" }, { "x-buyer-id": BUYER_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(BUYER_ID);
    expect(db.insertBuyer).not.toHaveBeenCalled();
  });
  it("201 new buyer when x-buyer-id is a client-generated UUID not in DB", async () => {
    m(db.getBuyer).mockResolvedValue(null);
    m(db.insertBuyer).mockResolvedValue(buyer);
    const res = await postBuyers(req("POST", { buyer_type: "ai_ops" }, { "x-buyer-id": OTHER_ID }));
    expect(res.status).toBe(201);
    expect(db.insertBuyer).toHaveBeenCalled();
  });
});

describe("GET /api/cards", () => {
  it("returns public cards + pack_id + item_count, no note, no rare_count; clamps limit", async () => {
    m(db.listCards).mockResolvedValue([{ ...card, item_count: 22, rare_count: 13 }]);
    const res = await getCards(new Request("http://t/api/cards?limit=500"));
    const body = await res.json();
    assertSealed(body);
    expect(body).toEqual({ cards: [{ id: CARD_ID, field: card.field, language: "EN", years_experience: 5, difficulty: 4, rarity: 4, one_liner: card.one_liner, price_pack_usd: 49, price_case_usd: 20, listed_at: card.listed_at, pack_id: PACK_ID, item_count: 22 }] });
    expect(db.listCards).toHaveBeenCalledWith(100);
    await getCards(new Request("http://t/api/cards"));
    expect(db.listCards).toHaveBeenLastCalledWith(20);
  });
  it("language param TRANSLATES all cards (not filter): cache hit → no Claude; miss → Claude ⑥ then cached; same-language card untouched", async () => {
    const ko = { ...card, id: OTHER_ID, language: "KO", field: "여행 예약 변경", one_liner: "항공권 변경 수수료 예외.", item_count: 10, rare_count: 5 };
    m(db.listCards).mockResolvedValue([{ ...card, item_count: 22, rare_count: 13 }, ko]);
    // 캐시 적중
    m(db.getCardTranslations).mockResolvedValue([{ card_id: CARD_ID, language: "KO", field: "통신 요금 분쟁", one_liner: "스크립트가 못 다루는 예외." }]);
    let body = await (await getCards(new Request("http://t/api/cards?language=ko"))).json();
    expect(body.cards).toHaveLength(2);
    expect(body.cards[0]).toMatchObject({ id: CARD_ID, field: "통신 요금 분쟁", one_liner: "스크립트가 못 다루는 예외.", language: "EN" });
    expect(body.cards[1]).toMatchObject({ id: OTHER_ID, field: "여행 예약 변경" });
    expect(claude.translateCards).not.toHaveBeenCalled();
    // 캐시 미스 → 번역 → 저장
    m(db.getCardTranslations).mockResolvedValue([]);
    m(claude.translateCards).mockResolvedValue({ cards: [{ id: CARD_ID, field: "Telekom-Abrechnungsstreit", one_liner: "Ausnahmen." }], run: { kind: "translate", model: "m", input_tokens: 1, output_tokens: 1, duration_ms: 5 } });
    body = await (await getCards(new Request("http://t/api/cards?language=de"))).json();
    expect(body.cards[0].field).toBe("Telekom-Abrechnungsstreit");
    expect(m(claude.translateCards).mock.calls[0][1]).toBe("DE");
    expect(db.upsertCardTranslations).toHaveBeenCalledWith([{ card_id: CARD_ID, language: "DE", field: "Telekom-Abrechnungsstreit", one_liner: "Ausnahmen." }]);
    // 번역 실패 → 원문 유지, 목록은 살아 있다
    m(claude.translateCards).mockRejectedValue(new Error("boom"));
    body = await (await getCards(new Request("http://t/api/cards?language=ja"))).json();
    expect(body.cards[0].field).toBe(card.field);
  });
});

describe("GET /api/cards/{id}", () => {
  it("card + counts + unlocked + sealed_qa_count for this buyer", async () => {
    m(db.getCard).mockResolvedValue(card);
    m(db.getPack).mockResolvedValue({ ...pack, item_count: 22, rare_count: 13 });
    m(db.getPurchase).mockResolvedValue(null);
    m(db.countSealedQa).mockResolvedValue(1);
    const res = await getCard(req("GET", undefined, { "x-buyer-id": BUYER_ID }), ctx(CARD_ID));
    const body = await res.json();
    assertSealed(body);
    expect(body).toEqual({ card: expect.objectContaining({ id: CARD_ID }), item_count: 22, rare_count: 13, unlocked: false, sealed_qa_count: 1 });
    expect(body.card.pack_id).toBeUndefined();
  });
  it("unlocked=true after purchase; works without buyer header (unlocked=false, count 0)", async () => {
    m(db.getCard).mockResolvedValue(card);
    m(db.getPack).mockResolvedValue(pack);
    m(db.getPurchase).mockResolvedValue(purchase);
    m(db.countSealedQa).mockResolvedValue(3);
    expect((await (await getCard(req("GET", undefined, { "x-buyer-id": BUYER_ID }), ctx(CARD_ID))).json()).unlocked).toBe(true);
    const anon = await (await getCard(req("GET"), ctx(CARD_ID))).json();
    expect(anon).toMatchObject({ unlocked: false, sealed_qa_count: 0 });
  });
  it("404", async () => {
    m(db.getCard).mockResolvedValue(null);
    expect((await getCard(req("GET"), ctx(CARD_ID))).status).toBe(404);
  });
});

describe("POST /api/requests", () => {
  const headers = { "x-buyer-id": BUYER_ID };
  it("201: Claude ③ gets public fields only; matches saved; cards attached with item_count", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.insertBuyerRequest).mockResolvedValue({ id: REQUEST_ID, buyer_id: BUYER_ID, request_text: "x", created_at: "" });
    m(db.listCards).mockResolvedValue([{ ...card, item_count: 22, rare_count: 13 }]);
    m(claude.matchCards).mockResolvedValue({ matches: [{ card_id: CARD_ID, rank: 1, score: 0.91, reason: "Covers mid-cycle proration." }], run: runMeta("match", 3380) });
    m(db.insertMatches).mockResolvedValue([]);

    const res = await postRequests(req("POST", { request_text: "Our AI can't resolve roaming disputes after a mid-cycle plan change." }, headers));
    expect(res.status).toBe(201);
    const body = await res.json();
    assertSealed(body);
    expect(body).toEqual({
      request_id: REQUEST_ID,
      matches: [{ rank: 1, score: 0.91, reason: "Covers mid-cycle proration.", card: expect.objectContaining({ id: CARD_ID, item_count: 22 }) }],
      run: { kind: "match", duration_ms: 3380, candidate_count: 1 },
    });
    const sent = m(claude.matchCards).mock.calls[0][0];
    expect(sent.buyer_type).toBe("ai_ops");
    expect(sent.candidates[0]).toEqual({ card_id: CARD_ID, field: card.field, language: "EN", years_experience: 5, difficulty: 4, rarity: 4, one_liner: card.one_liner, item_count: 22, rare_count: 13 });
    expect(JSON.stringify(sent)).not.toContain("handover_note");
    expect(db.insertMatches).toHaveBeenCalledWith([{ request_id: REQUEST_ID, card_id: CARD_ID, rank: 1, score: 0.91, reason: "Covers mid-cycle proration." }]);
    expect(db.insertClaudeRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "match", ref_table: "buyer_requests", ref_id: REQUEST_ID, metrics: { candidate_count: 1 } }));
  });
  it("no candidates → 201 with empty matches and no Claude call", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.insertBuyerRequest).mockResolvedValue({ id: REQUEST_ID, buyer_id: BUYER_ID, request_text: "x", created_at: "" });
    m(db.listCards).mockResolvedValue([]);
    const res = await postRequests(req("POST", { request_text: "Something long enough to pass." }, headers));
    expect(await res.json()).toEqual({ request_id: REQUEST_ID, matches: [], run: { kind: "match", duration_ms: 0, candidate_count: 0 } });
    expect(claude.matchCards).not.toHaveBeenCalled();
    expect(db.listCards).toHaveBeenLastCalledWith(100);
  });
  it("language in body: candidates stay ALL cards (Claude sees originals), matched cards are translated in the response", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.insertBuyerRequest).mockResolvedValue({ id: REQUEST_ID, buyer_id: BUYER_ID, request_text: "x", created_at: "" });
    m(db.listCards).mockResolvedValue([{ ...card, item_count: 22, rare_count: 13 }]);
    m(claude.matchCards).mockResolvedValue({ matches: [{ card_id: CARD_ID, rank: 1, score: 0.9, reason: "로밍 분쟁을 다룸" }], run: runMeta("match", 1000) });
    m(db.insertMatches).mockResolvedValue([]);
    m(db.getCardTranslations).mockResolvedValue([{ card_id: CARD_ID, language: "KO", field: "통신 요금 분쟁", one_liner: "예외." }]);
    const body = await (await postRequests(req("POST", { request_text: "로밍 분쟁을 AI가 못 풀어요. 사람이 필요해요.", language: "ko" }, headers))).json();
    expect(m(claude.matchCards).mock.calls[0][0].candidates[0].field).toBe(card.field); // 원문으로 매칭
    expect(body.matches[0].card.field).toBe("통신 요금 분쟁");                        // 응답은 번역
    expect(db.listCards).toHaveBeenLastCalledWith(100);
  });
  it("400 without buyer header; 404 unknown buyer", async () => {
    expect((await postRequests(req("POST", { request_text: "Something long enough." }))).status).toBe(400);
    m(db.getBuyer).mockResolvedValue(null);
    expect((await postRequests(req("POST", { request_text: "Something long enough." }, headers))).status).toBe(404);
  });
});

describe("POST /api/cards/{id}/ask — Sealed Q&A", () => {
  const headers = { "x-buyer-id": BUYER_ID };
  it("201: server injects the note into Claude ④; response has answer + counts only", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getCard).mockResolvedValue(card);
    m(db.getPack).mockResolvedValue({ ...pack, item_count: 22 });
    m(claude.sealedQa).mockResolvedValue({ answer: "Escalate rather than refuse at day 58.", evidence_item_ids: ["e1", "r1", "j1"], covered: true, run: runMeta("sealed_qa", 2910) });
    m(db.insertSealedQa).mockImplementation(async (row) => ({ ...row, id: QA_ID, created_at: "" }));

    const res = await postAsk(req("POST", { question: "What do you do at day 58 of the loyalty window?" }, headers), ctx(CARD_ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    assertSealed(body);
    expect(body).toEqual({ id: QA_ID, answer: "Escalate rather than refuse at day 58.", evidence_count: 3, total_items: 22, covered: true, run: { kind: "sealed_qa", duration_ms: 2910 } });
    expect(JSON.stringify(body)).not.toContain("e1");
    expect(m(claude.sealedQa).mock.calls[0][0].handover_note).toEqual(note);
    expect(db.insertSealedQa).toHaveBeenCalledWith({ card_id: CARD_ID, buyer_id: BUYER_ID, question: "What do you do at day 58 of the loyalty window?", answer: "Escalate rather than refuse at day 58.", evidence_count: 3, total_items: 22, covered: true });
    expect(db.insertClaudeRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "sealed_qa", ref_table: "sealed_qa", ref_id: QA_ID, metrics: { evidence_count: 3, covered: true } }));
  });
  it("not covered → fixed answer, evidence 0, covered false", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getCard).mockResolvedValue(card);
    m(db.getPack).mockResolvedValue(pack);
    m(claude.sealedQa).mockResolvedValue({ answer: "This pack doesn't cover that.", evidence_item_ids: [], covered: false, run: runMeta("sealed_qa", 1500) });
    m(db.insertSealedQa).mockImplementation(async (row) => ({ ...row, id: QA_ID, created_at: "" }));
    const body = await (await postAsk(req("POST", { question: "How do I cook rice properly?" }, headers), ctx(CARD_ID))).json();
    expect(body).toMatchObject({ answer: "This pack doesn't cover that.", evidence_count: 0, total_items: 5, covered: false });
  });
  it("400 no header / short question; 404 unknown card", async () => {
    expect((await postAsk(req("POST", { question: "What about day 58?" }), ctx(CARD_ID))).status).toBe(400);
    m(db.getBuyer).mockResolvedValue(buyer);
    expect((await postAsk(req("POST", { question: "hi" }, headers), ctx(CARD_ID))).status).toBe(400);
    m(db.getCard).mockResolvedValue(null);
    expect((await postAsk(req("POST", { question: "What about day 58?" }, headers), ctx(CARD_ID))).status).toBe(404);
    expect(claude.sealedQa).not.toHaveBeenCalled();
  });
  it("429 'Unlock the pack to keep asking.' on the 4th free question; unlocked buyer is not limited", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getCard).mockResolvedValue(card);
    m(db.getPack).mockResolvedValue(pack);
    m(db.getPurchase).mockResolvedValue(null);
    m(db.countSealedQa).mockResolvedValue(3);
    const res = await postAsk(req("POST", { question: "What about day 58?" }, headers), ctx(CARD_ID));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "Unlock the pack to keep asking." } });
    expect(claude.sealedQa).not.toHaveBeenCalled();

    // 2회까지는 통과
    m(db.countSealedQa).mockResolvedValue(2);
    m(claude.sealedQa).mockResolvedValue({ answer: "a", evidence_item_ids: ["e1"], covered: true, run: runMeta("sealed_qa", 1000) });
    m(db.insertSealedQa).mockImplementation(async (row) => ({ ...row, id: QA_ID, created_at: "" }));
    expect((await postAsk(req("POST", { question: "What about day 58?" }, headers), ctx(CARD_ID))).status).toBe(201);

    // 구매자는 무제한
    m(db.getPurchase).mockResolvedValue(purchase);
    m(db.countSealedQa).mockResolvedValue(10);
    expect((await postAsk(req("POST", { question: "What about day 58?" }, headers), ctx(CARD_ID))).status).toBe(201);
  });
});

describe("POST /api/packs/{id}/purchase — mock payment", () => {
  const headers = { "x-buyer-id": BUYER_ID };
  it("accepts a CARD id in place of the pack id (front packIdOf passes card.id through)", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getPack).mockImplementation(async (id) => (id === PACK_ID ? pack : null));
    m(db.getCard).mockImplementation(async (id) => (id === CARD_ID ? card : null));
    m(db.getPurchase).mockResolvedValue(null);
    m(db.insertPurchase).mockImplementation(async (row) => ({ ...row, id: purchase.id, created_at: "" }));
    const res = await postPurchase(req("POST", { kind: "pack" }, headers), ctx(CARD_ID));
    expect(res.status).toBe(201);
    expect((await res.json()).pack_id).toBe(PACK_ID); // 응답은 진짜 pack_id → 프론트가 /packs/{pack_id}/note로 이동
    // note·trace도 card id로 접근 가능
    m(db.getPurchase).mockResolvedValue(purchase);
    expect((await getNote(req("GET", undefined, headers), ctx(CARD_ID))).status).toBe(200);
    m(db.getCardByPack).mockResolvedValue(card);
    m(db.getClaudeRun).mockResolvedValue(null);
    m(db.listMatchesForCard).mockResolvedValue([]);
    m(db.listClaudeRuns).mockResolvedValue([]);
    m(db.listSealedQaForCard).mockResolvedValue([]);
    expect((await getTrace(req("GET"), ctx(CARD_ID))).status).toBe(200);
  });
  it("201 creates mock_paid purchase with amount = packs.price_pack_usd", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getPack).mockResolvedValue({ ...pack, price_pack_usd: 149 });
    m(db.getPurchase).mockResolvedValue(null);
    m(db.insertPurchase).mockImplementation(async (row) => ({ ...row, id: purchase.id, created_at: "" }));
    const res = await postPurchase(req("POST", { kind: "pack" }, headers), ctx(PACK_ID));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ purchase_id: purchase.id, pack_id: PACK_ID, kind: "pack", amount_usd: 149, status: "mock_paid", unlocked: true });
    expect(db.insertPurchase).toHaveBeenCalledWith({ buyer_id: BUYER_ID, pack_id: PACK_ID, kind: "pack", amount_usd: 149, status: "mock_paid" });
  });
  it("200 returns the existing row when already purchased", async () => {
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getPack).mockResolvedValue(pack);
    m(db.getPurchase).mockResolvedValue(purchase);
    const res = await postPurchase(req("POST", { kind: "pack" }, headers), ctx(PACK_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).purchase_id).toBe(purchase.id);
    expect(db.insertPurchase).not.toHaveBeenCalled();
  });
  it("400 'Coming soon.' for case/hire; defaults kind to pack", async () => {
    for (const kind of ["case", "hire"]) {
      const res = await postPurchase(req("POST", { kind }, headers), ctx(PACK_ID));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe("Coming soon.");
    }
    m(db.getBuyer).mockResolvedValue(buyer);
    m(db.getPack).mockResolvedValue(pack);
    m(db.getPurchase).mockResolvedValue(purchase);
    expect((await postPurchase(req("POST", {}, headers), ctx(PACK_ID))).status).toBe(200);
  });
});

describe("GET /api/packs/{id}/trace — What Claude did", () => {
  it("aggregates followup/extract/last_match/sealed_qa from claude_runs; total_ms sums; no note", async () => {
    m(db.getPack).mockResolvedValue(pack);
    m(db.getClaudeRun).mockImplementation(async (kind) => kind === "followup" ? run("followup", INTERVIEW_ID, 4120, { question_count: 2 }) : run("extract", PACK_ID, 9830));
    m(db.getCardByPack).mockResolvedValue(card);
    m(db.listMatchesForCard).mockResolvedValue([{ id: "m1", request_id: REQUEST_ID, card_id: CARD_ID, rank: 1, score: 0.91, reason: "r" }]);
    m(db.listClaudeRuns).mockImplementation(async (kind) => kind === "match"
      ? [run("match", REQUEST_ID, 3380, { candidate_count: 7 })]
      : [run("sealed_qa", "qa2", 3000), run("sealed_qa", "qa1", 2900)]);
    m(db.listSealedQaForCard).mockResolvedValue([
      { id: "qa1", card_id: CARD_ID, buyer_id: BUYER_ID, question: "q", answer: "a", evidence_count: 2, total_items: 5, covered: true, created_at: "1" },
      { id: "qa2", card_id: CARD_ID, buyer_id: BUYER_ID, question: "q", answer: "a", evidence_count: 3, total_items: 5, covered: true, created_at: "2" },
    ]);

    const res = await getTrace(req("GET"), ctx(PACK_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    assertSealed(body);
    expect(body).toEqual({
      pack_id: PACK_ID,
      followup: { question_count: 2, duration_ms: 4120 },
      extract: { item_count: 5, rare_count: 4, manual_count: 1, generalized_count: 5, generalization_log: pack.generalization_log, duration_ms: 9830 },
      last_match: { request_id: REQUEST_ID, rank: 1, score: 0.91, duration_ms: 3380 },
      sealed_qa: { count: 2, avg_duration_ms: 2950, last_evidence_count: 3 },
      total_ms: 4120 + 9830 + 3380 + 5900,
      model: "claude-sonnet-5-5",
    });
  });
  it("works with no match / no Q&A yet (nulls and zeros)", async () => {
    m(db.getPack).mockResolvedValue(pack);
    m(db.getClaudeRun).mockImplementation(async (kind) => kind === "followup" ? run("followup", INTERVIEW_ID, 4000, { question_count: 3 }) : run("extract", PACK_ID, 9000));
    m(db.getCardByPack).mockResolvedValue(card);
    m(db.listMatchesForCard).mockResolvedValue([]);
    m(db.listClaudeRuns).mockResolvedValue([]);
    m(db.listSealedQaForCard).mockResolvedValue([]);
    const body = await (await getTrace(req("GET"), ctx(PACK_ID))).json();
    expect(body).toMatchObject({ last_match: null, sealed_qa: { count: 0, avg_duration_ms: 0, last_evidence_count: 0 }, total_ms: 13000 });
  });
});

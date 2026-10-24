import { describe, it, expect, vi, beforeEach } from "vitest";

// SDK를 모킹해 JSON 파싱·zod 검증·1회 재시도·서버 후처리를 검증한다 (실제 호출 없음)
const { create } = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  return { create: vi.fn() };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic { messages = { create }; },
}));

import { generateFollowups, extractNote, matchCards, sealedQa, NOT_COVERED_ANSWER } from "@/lib/claude";
import { ApiError } from "@/lib/errors";
import { seedAnswers, note } from "./fixtures";

const reply = (text: string, usage = { input_tokens: 120, output_tokens: 40 }) => ({ content: [{ type: "text", text }], usage });
const followupInput = { role_title: "Telecom billing CSR", years_experience: 5, language: "EN" as const, seed_answers: seedAnswers, notes: null };

beforeEach(() => create.mockReset());

describe("① followup", () => {
  it("parses JSON, normalizes ids to f1..fn, returns run meta with tokens and duration", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({
      followup_questions: [
        { id: "q-a", question: "What did you do at day 58 of the loyalty window?", target: "rare" },
        { id: "q-b", question: "What exact numbers did you use for the family plan case?", target: "detail" },
      ],
    })));
    const r = await generateFollowups(followupInput);
    expect(r.followup_questions.map((q) => q.id)).toEqual(["f1", "f2"]);
    expect(r.run.kind).toBe("followup");
    expect(r.run.input_tokens).toBe(120);
    expect(r.run.output_tokens).toBe(40);
    expect(r.run.duration_ms).toBeGreaterThanOrEqual(0);
    expect(create).toHaveBeenCalledTimes(1);
    // 프롬프트에 시드 4답변이 들어간다
    const call = create.mock.calls[0][0];
    expect(call.messages[0].content).toContain(seedAnswers.q3);
  });

  it("strips markdown fences", async () => {
    create.mockResolvedValueOnce(reply("```json\n" + JSON.stringify({
      followup_questions: [
        { id: "f1", question: "Question number one about the loyalty window?", target: "rare" },
        { id: "f2", question: "Question number two about the proration numbers?", target: "detail" },
      ],
    }) + "\n```"));
    const r = await generateFollowups(followupInput);
    expect(r.followup_questions).toHaveLength(2);
  });

  it("retries once on invalid output, then succeeds — tokens/duration accumulate", async () => {
    create
      .mockResolvedValueOnce(reply("not json at all"))
      .mockResolvedValueOnce(reply(JSON.stringify({
        followup_questions: [
          { id: "f1", question: "A valid first question about the 60-day window?", target: "rare" },
          { id: "f2", question: "A valid second question about the amounts?", target: "detail" },
        ],
      })));
    const r = await generateFollowups(followupInput);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.run.input_tokens).toBe(240);
    // 재시도 메시지에 실패 사유가 들어간다
    expect(create.mock.calls[1][0].messages[0].content).toContain("failed validation");
  });

  it("throws CLAUDE_FAILED (502) after two schema failures", async () => {
    create
      .mockResolvedValueOnce(reply(JSON.stringify({ followup_questions: [] })))             // min 2 위반
      .mockResolvedValueOnce(reply(JSON.stringify({ followup_questions: [{ id: "f1", question: "x", target: "nope" }] })));
    const err = await generateFollowups(followupInput).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "CLAUDE_FAILED", status: 502 });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("② extract", () => {
  it("assigns server ids r1/e1/j1/m1/n1 per section and lowercases source", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({
      handover_note: {
        rules: [{ id: "x", text: "Rule A", kind: "manual", source: "Q1" }, { id: "x", text: "Rule B", kind: "rare", source: "q1" }],
        exceptions: [{ id: "x", text: "Exc", kind: "rare", source: "F1" }],
        judgment_calls: [], common_mistakes: [{ id: "x", text: "Mist", kind: "rare", source: "q2" }],
        never_do: [{ id: "x", text: "Never", kind: "rare", source: "notes" }],
      },
      generalization_log: [{ type: "company", replaced_with: "the carrier", count: 2 }],
      card: { field: "Telecom billing disputes", difficulty: 4, rarity: 4, one_liner: "Edge cases a script can't handle." },
    })));
    const r = await extractNote({ ...followupInput, followup_questions: [{ id: "f1", question: "q?" }], followup_answers: { f1: "At day 58 I escalated." } });
    expect(r.handover_note.rules.map((i) => i.id)).toEqual(["r1", "r2"]);
    expect(r.handover_note.exceptions[0].id).toBe("e1");
    expect(r.handover_note.common_mistakes[0].id).toBe("m1");
    expect(r.handover_note.never_do[0].id).toBe("n1");
    expect(r.handover_note.rules[0].source).toBe("q1");
    expect(r.handover_note.exceptions[0].source).toBe("f1");
    expect(r.card.rarity).toBe(4);
    expect(r.generalization_log[0].count).toBe(2);
    // 꼬리질문 답변이 프롬프트에 들어간다
    expect(create.mock.calls[0][0].messages[0].content).toContain("At day 58 I escalated.");
  });

  it("rejects difficulty/rarity outside 1–5 (CLAUDE_FAILED after retry)", async () => {
    const bad = JSON.stringify({
      handover_note: { rules: [], exceptions: [], judgment_calls: [], common_mistakes: [], never_do: [] },
      generalization_log: [], card: { field: "Telecom", difficulty: 9, rarity: 4, one_liner: "Something useful." },
    });
    create.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(bad));
    await expect(extractNote({ ...followupInput, followup_questions: [], followup_answers: {} })).rejects.toMatchObject({ code: "CLAUDE_FAILED" });
  });
});

describe("③ match", () => {
  const candidates = [
    { card_id: "A", field: "Telecom billing disputes", language: "EN", years_experience: 5, difficulty: 4, rarity: 4, one_liner: "x", item_count: 22, rare_count: 13 },
    { card_id: "B", field: "E-commerce refunds", language: "EN", years_experience: 3, difficulty: 3, rarity: 3, one_liner: "y", item_count: 15, rare_count: 6 },
  ];
  it("drops unknown/duplicate card_ids, sorts by score, re-ranks 1..n, rounds score to 3 decimals", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ matches: [
      { card_id: "B", rank: 1, score: 0.4, reason: "weak" },
      { card_id: "ZZZ", rank: 2, score: 0.99, reason: "hallucinated" },
      { card_id: "A", rank: 3, score: 0.91234, reason: "strong" },
      { card_id: "A", rank: 3, score: 0.5, reason: "dup" },
    ] })));
    const r = await matchCards({ request_text: "roaming disputes after plan change", buyer_type: "ai_ops", candidates });
    expect(r.matches).toEqual([
      { card_id: "A", rank: 1, score: 0.912, reason: "strong" },
      { card_id: "B", rank: 2, score: 0.4, reason: "weak" },
    ]);
    // 인계서는 절대 프롬프트에 들어가지 않는다 — 후보 공개 필드만
    const prompt = create.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toContain("handover_note");
    expect(prompt).toContain("Telecom billing disputes");
  });
});

describe("④ sealed_qa", () => {
  const input = { question: "What do you do at day 58?", card: { field: "Telecom billing disputes", one_liner: "x" }, handover_note: note };
  it("keeps only evidence ids that exist in the note", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ answer: "Escalate rather than refuse; the system backdates on day 61.", evidence_item_ids: ["e1", "zz9", "r1"], covered: true })));
    const r = await sealedQa(input);
    expect(r.covered).toBe(true);
    expect(r.evidence_item_ids).toEqual(["e1", "r1"]);
    expect(r.answer).toContain("Escalate");
    // 서버가 인계서를 주입한다 (서버 전용)
    expect(create.mock.calls[0][0].messages[0].content).toContain(note.exceptions[0].text);
  });

  it("covered=false → fixed answer and zero evidence, even if the model wrote something", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ answer: "I think maybe...", evidence_item_ids: ["e1"], covered: false })));
    const r = await sealedQa(input);
    expect(r).toMatchObject({ answer: NOT_COVERED_ANSWER, evidence_item_ids: [], covered: false });
  });

  it("covered=true with no valid evidence → treated as not covered", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ answer: "Generic advice.", evidence_item_ids: ["nope"], covered: true })));
    const r = await sealedQa(input);
    expect(r).toMatchObject({ answer: NOT_COVERED_ANSWER, evidence_item_ids: [], covered: false });
  });
});

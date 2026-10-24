// 단위 테스트 공용 행 (DB.md 컬럼 그대로)
import type { Buyer, Card, ClaudeRun, HandoverNote, Interview, Pack, Purchase, Seller } from "@/lib/server-types";

export const SELLER_ID = "11111111-1111-4111-8111-111111111111";
export const BUYER_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ID = "33333333-3333-4333-8333-333333333333";
export const INTERVIEW_ID = "44444444-4444-4444-8444-444444444444";
export const PACK_ID = "55555555-5555-4555-8555-555555555555";
export const CARD_ID = "66666666-6666-4666-8666-666666666666";
export const REQUEST_ID = "77777777-7777-4777-8777-777777777777";
export const QA_ID = "88888888-8888-4888-8888-888888888888";
export const NOW = "2026-10-24T11:42:07.000Z";

export const seedAnswers = {
  q1: "The manual says offer the loyalty credit, but it only works if the customer hasn't changed plans in the last 60 days. Nobody tells you that.",
  q2: "New hires reset the billing cycle when a customer asks about proration. That doubles the charge for the month and creates a dispute.",
  q3: "I refused a retroactive roaming waiver for a customer who turned data roaming on himself. The policy allows waivers only for system errors.",
  q4: "A family plan customer moved abroad mid-cycle; the script had no branch. I prorated 14 days at $42.10 and escalated the roaming part.",
};

export const seller: Seller = {
  id: SELLER_ID, display_name: "Seller #0427", role_title: "Telecom billing CSR", years_experience: 5, language: "EN", created_at: NOW,
};
export const buyer: Buyer = { id: BUYER_ID, display_name: "Buyer #11", buyer_type: "ai_ops", created_at: NOW };

export const followupQuestions = [
  { id: "f1", question: "In the 60-day loyalty credit case, what did you do at day 58?", target: "rare" as const },
  { id: "f2", question: "For the family plan abroad case, what exact numbers did you use?", target: "detail" as const },
];

export const interviewDraft: Interview = {
  id: INTERVIEW_ID, seller_id: SELLER_ID, status: "draft", seed_answers: seedAnswers, notes: null,
  followup_questions: followupQuestions, followup_answers: {}, rejected_reason: null, created_at: NOW, sealed_at: null,
};

export const note: HandoverNote = {
  rules: [{ id: "r1", text: "Loyalty credit applies only if no plan change in the last 60 days.", kind: "manual", source: "q1" }],
  exceptions: [{ id: "e1", text: "At day 58–60, escalate instead of refusing; the system backdates on day 61.", kind: "rare", source: "f1" }],
  judgment_calls: [{ id: "j1", text: "Prorate the remaining days and escalate the roaming part separately.", kind: "rare", source: "q4" }],
  common_mistakes: [{ id: "m1", text: "Resetting the billing cycle on a proration question doubles the charge.", kind: "rare", source: "q2" }],
  never_do: [{ id: "n1", text: "Never grant a retroactive roaming waiver when the customer toggled roaming on.", kind: "rare", source: "q3" }],
};

export const pack: Pack = {
  id: PACK_ID, seller_id: SELLER_ID, interview_id: INTERVIEW_ID, handover_note: note,
  generalization_log: [{ type: "company", replaced_with: "the carrier", count: 2 }, { type: "system", replaced_with: "the billing system", count: 3 }],
  item_count: 5, rare_count: 4, manual_count: 1, generalized_count: 5, price_pack_usd: 49, price_case_usd: 20, created_at: NOW,
};

export const card: Card = {
  id: CARD_ID, pack_id: PACK_ID, field: "Telecom billing disputes", language: "EN", years_experience: 5, difficulty: 4, rarity: 4,
  one_liner: "Proration, loyalty-credit edge cases and roaming waivers a script can't handle.", price_pack_usd: 49, price_case_usd: 20, listed_at: NOW,
};

export const purchase: Purchase = { id: "99999999-9999-4999-8999-999999999999", buyer_id: BUYER_ID, pack_id: PACK_ID, kind: "pack", amount_usd: 49, status: "mock_paid", created_at: NOW };

export const run = (kind: ClaudeRun["kind"], ref_id: string, duration_ms: number, metrics: Record<string, unknown> = {}): ClaudeRun => ({
  id: `run-${kind}`, kind, ref_table: "x", ref_id, model: "claude-sonnet-5-5", input_tokens: 100, output_tokens: 50, duration_ms, metrics, created_at: NOW,
});

export const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test.local/api/x", {
    method, headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** 응답 JSON 어디에도 인계서 원문이 없어야 한다 (불변 조건 1) */
export function assertSealed(body: unknown) {
  const s = JSON.stringify(body);
  if (s.includes("handover_note")) throw new Error("response leaks handover_note");
  for (const it of Object.values(note).flat()) {
    if (s.includes(it.text)) throw new Error(`response leaks note item text: ${it.id}`);
  }
}

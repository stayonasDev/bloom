// Fixture data used when the API is not reachable (NEXT_PUBLIC_USE_MOCK=1 or network error).
// Values mirror docs/API.md examples so the UI renders the same against the real backend.
import type { AskResponse, Card, HandoverNote, InterviewResponse, Match, NoteResponse, PurchaseResponse, RequestResponse, SealResponse, TraceResponse } from "./types";

export const MOCK_PACK_ID = "c71a0000-0000-4000-8000-000000000001";
export const MOCK_CARD_ID = "d0f30000-0000-4000-8000-000000000001";

export const cards: Card[] = [
  { id: MOCK_CARD_ID, field: "Telecom billing disputes", language: "EN", years_experience: 5, difficulty: 4, rarity: 4, one_liner: "Proration, loyalty-credit edge cases and roaming waivers a script can't handle.", price_pack_usd: 149, price_case_usd: 20, listed_at: "2026-10-24T11:42:07Z", item_count: 22 },
  { id: "d0f30000-0000-4000-8000-000000000002", field: "Prepaid and family-plan billing", language: "EN", years_experience: 3, difficulty: 3, rarity: 3, one_liner: "Multi-line proration and shared data pools.", price_pack_usd: 89, price_case_usd: 17, listed_at: "2026-10-24T10:58:00Z", item_count: 17 },
  { id: "d0f30000-0000-4000-8000-000000000003", field: "Telecom retention and cancellations", language: "KO", years_experience: 7, difficulty: 3, rarity: 3, one_liner: "De-escalation and save offers without over-promising.", price_pack_usd: 129, price_case_usd: 17, listed_at: "2026-10-24T10:12:00Z", item_count: 25 },
  { id: "d0f30000-0000-4000-8000-000000000004", field: "Returns and chargeback judgment", language: "EN", years_experience: 4, difficulty: 4, rarity: 3, one_liner: "Refund abuse vs. honest returns, in writing.", price_pack_usd: 129, price_case_usd: 17, listed_at: "2026-10-24T09:40:00Z", item_count: 19 },
  { id: "d0f30000-0000-4000-8000-000000000005", field: "Front-desk triage and billing codes", language: "EN", years_experience: 6, difficulty: 4, rarity: 4, one_liner: "Insurance mismatch at intake, what to ask first.", price_pack_usd: 119, price_case_usd: 20, listed_at: "2026-10-24T09:02:00Z", item_count: 17 },
  { id: "d0f30000-0000-4000-8000-000000000006", field: "Bookkeeping exceptions", language: "EN", years_experience: 8, difficulty: 3, rarity: 4, one_liner: "Receipts that don't fit a category, and why.", price_pack_usd: 139, price_case_usd: 20, listed_at: "2026-10-24T08:30:00Z", item_count: 20 },
  { id: "d0f30000-0000-4000-8000-000000000007", field: "Translation review, legal", language: "JA", years_experience: 9, difficulty: 5, rarity: 4, one_liner: "Where machine output is fluent and wrong.", price_pack_usd: 199, price_case_usd: 20, listed_at: "2026-10-24T08:01:00Z", item_count: 28 },
];

export const interview: InterviewResponse = {
  id: "2b9e0000-0000-4000-8000-000000000001",
  status: "draft",
  followup_questions: [
    { id: "f1", question: "You prorate a roaming charge that lands within 3 days of a plan change. When do you not prorate — what makes it a real roaming charge?", target: "rare" },
    { id: "f2", question: "You say \"what was correct\" before \"what you'll fix\". Give the exact sentence you use.", target: "detail" },
  ],
  run: { kind: "followup", duration_ms: 3110, question_count: 2 },
};

export const seal: SealResponse = {
  pack_id: MOCK_PACK_ID,
  card: cards[0],
  metrics: { item_count: 22, rare_count: 9, manual_count: 13, generalized_count: 5 },
  run: { kind: "extract", duration_ms: 31420 },
};

export const note: HandoverNote = {
  rules: [
    { id: "r1", text: "Treat a roaming charge within 3 days of a plan change as a cycle overlap first, a roaming dispute second. Check the plan-change date before anything else.", kind: "rare", source: "q1" },
    { id: "r2", text: "Prorate to the change date. Refund the overlap as a billing correction, never as a goodwill credit.", kind: "manual", source: "q1" },
    { id: "r3", text: "Refund scope for \"didn't notice\" add-ons is the current cycle only. Every bill and the monthly notice showed it.", kind: "manual", source: "q3" },
    { id: "r4", text: "On multi-line accounts, prorate only the line that changed. Re-run the shared data pool for the remaining days.", kind: "rare", source: "q4" },
    { id: "r5", text: "State what was correct, then what you will fix, then the amount.", kind: "manual", source: "q2" },
    { id: "r6", text: "Confirm the fix in writing in the same contact. A second contact about the same bill counts as unresolved.", kind: "manual", source: "notes" },
  ],
  exceptions: [
    { id: "e1", text: "Plan changed in the app: the account shows a timestamp and the old plan ends that day. No overlap exists, so a roaming charge after it is fully refundable.", kind: "rare", source: "f1" },
    { id: "e2", text: "Roaming location outside the new plan's zone: real roaming. No refund. Explain the zone, offer the add-on.", kind: "manual", source: "f1" },
    { id: "e3", text: "Business accounts: proration follows the contract cycle, not the calendar cycle. Escalate instead of prorating.", kind: "manual", source: "notes" },
    { id: "e4", text: "Loyalty credit at day 58–60 of the 60-day window: escalate instead of refusing; the system backdates on day 61.", kind: "rare", source: "f1" },
    { id: "e5", text: "Family plans with one line abroad mid-cycle: split the pool by days, not by lines.", kind: "rare", source: "q4" },
  ],
  judgment_calls: [
    { id: "j1", text: "When the customer leads with \"I want everything refunded\", do not answer the amount. Answer the cause. The amount only works after they accept the cause.", kind: "rare", source: "q2" },
    { id: "j2", text: "The exact sentence: \"The charge was correct for your old plan. The switch date is what we're fixing.\" Then the number.", kind: "rare", source: "f2" },
    { id: "j3", text: "If the customer has called twice about the same bill, skip the script and go straight to the correction.", kind: "rare", source: "notes" },
    { id: "j4", text: "A customer who toggled roaming on himself gets an explanation, not a waiver.", kind: "manual", source: "q3" },
    { id: "j5", text: "Never quote a refund figure before the proration is on screen.", kind: "manual", source: "q1" },
  ],
  common_mistakes: [
    { id: "m1", text: "Offering a goodwill credit first. The customer hears an admission and asks for the whole bill.", kind: "rare", source: "q2" },
    { id: "m2", text: "Prorating the whole account when one line changed. The other line inherits an overage it never had.", kind: "rare", source: "q4" },
    { id: "m3", text: "Resetting the billing cycle on a proration question. That doubles the charge.", kind: "manual", source: "q2" },
    { id: "m4", text: "Promising a written confirmation and not sending it in the same contact.", kind: "manual", source: "notes" },
  ],
  never_do: [
    { id: "n1", text: "Never say \"goodwill\" in a billing-error case.", kind: "manual", source: "q2" },
    { id: "n2", text: "Never refund more than one cycle of an add-on that appeared on every bill.", kind: "manual", source: "q3" },
  ],
};

export const noteResponse: NoteResponse = {
  pack_id: MOCK_PACK_ID,
  handover_note: note,
  generalization_log: [
    { type: "company", replaced_with: "the carrier", count: 2 },
    { type: "system", replaced_with: "the billing system", count: 2 },
    { type: "customer", replaced_with: "the customer", count: 1 },
  ],
  metrics: seal.metrics,
};

export const matches: Match[] = [
  { rank: 1, score: 0.91, reason: "Covers plan-change overlap vs. real roaming, refund-scope limits, and a de-escalation sentence for \"refund everything\" demands.", card: cards[0] },
  { rank: 2, score: 0.62, reason: "Strong on multi-line proration. Weaker on roaming.", card: cards[1] },
  { rank: 3, score: 0.41, reason: "The de-escalation side. Does not cover billing mechanics.", card: cards[2] },
];

export const request: RequestResponse = {
  request_id: "9e440000-0000-4000-8000-000000000001",
  matches,
  run: { kind: "match", duration_ms: 1830, candidate_count: 7 },
};

export const ask: AskResponse = {
  id: "71bc0000-0000-4000-8000-000000000001",
  answer: "Refund the overlap only, not as goodwill. A roaming charge within about 3 days of a plan change is usually a cycle overlap, not real roaming. Prorate the USD 48 to the days before the change and refund the rest as a billing correction. Say it in this order: what was correct (\"the charge was correct for your old plan\"), then what you're fixing (\"the switch date\"), then the amount. Exception: if the change was made in the app there is no overlap, so the full USD 48 is refundable. If the roaming location is outside the new plan's zone it is real roaming. No refund.",
  evidence_count: 3,
  total_items: 22,
  covered: true,
  run: { kind: "sealed_qa", duration_ms: 2410 },
};

export const askNotCovered: AskResponse = { ...ask, id: "71bc0000-0000-4000-8000-000000000002", answer: "This pack doesn't cover that.", evidence_count: 0, covered: false, run: { kind: "sealed_qa", duration_ms: 1960 } };

export const purchase: PurchaseResponse = { purchase_id: "33d00000-0000-4000-8000-000000000001", pack_id: MOCK_PACK_ID, kind: "pack", amount_usd: 149, status: "mock_paid", unlocked: true };

export const trace: TraceResponse = {
  pack_id: MOCK_PACK_ID,
  followup: { question_count: 2, duration_ms: 3110 },
  extract: { ...seal.metrics, generalization_log: noteResponse.generalization_log, duration_ms: 31420 },
  last_match: { request_id: request.request_id, rank: 1, score: 0.91, duration_ms: 1830 },
  sealed_qa: { count: 3, avg_duration_ms: 2410, last_evidence_count: 3 },
  total_ms: 58000,
  model: "claude-sonnet-5-5",
};

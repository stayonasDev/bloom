// Shapes follow docs/API.md. Keep in sync with the backend.

export type Card = {
  id: string;
  pack_id?: string; // 인계사항 4: 백엔드가 카드 목록·매칭 카드에 포함. 구매 → /packs/{pack_id}/note 이동용
  field: string;
  language: string;
  years_experience: number;
  difficulty: number;
  rarity: number;
  one_liner: string;
  price_pack_usd: number;
  price_case_usd: number;
  listed_at: string;
  item_count: number;
};

export type FollowupQuestion = { id: string; question: string; target: "rare" | "detail" };

export type InterviewResponse = {
  id: string;
  status: "draft" | "sealed" | "rejected";
  followup_questions: FollowupQuestion[];
  run: { kind: "followup"; duration_ms: number; question_count: number };
};

export type SealResponse = {
  pack_id: string;
  card: Card;
  metrics: { item_count: number; rare_count: number; manual_count: number; generalized_count: number };
  run: { kind: "extract"; duration_ms: number };
};

export type NoteItem = { id: string; text: string; kind: "rare" | "manual"; source: string };
export type HandoverNote = {
  rules: NoteItem[];
  exceptions: NoteItem[];
  judgment_calls: NoteItem[];
  common_mistakes: NoteItem[];
  never_do: NoteItem[];
};
export type NoteResponse = {
  pack_id: string;
  handover_note: HandoverNote;
  generalization_log: { type: string; replaced_with: string; count: number }[];
  metrics: SealResponse["metrics"];
};

export type Match = { rank: number; score: number; reason: string; card: Card };
export type RequestResponse = { request_id: string; matches: Match[]; run: { kind: "match"; duration_ms: number; candidate_count: number } };

export type AskResponse = { id: string; answer: string; evidence_count: number; total_items: number; covered: boolean; run: { kind: "sealed_qa"; duration_ms: number } };

export type PurchaseResponse = { purchase_id: string; pack_id: string; kind: "pack"; amount_usd: number; status: string; unlocked: boolean };

export type TraceResponse = {
  pack_id: string;
  followup: { question_count: number; duration_ms: number };
  extract: { item_count: number; rare_count: number; manual_count: number; generalized_count: number; generalization_log: NoteResponse["generalization_log"]; duration_ms: number };
  last_match: { request_id: string; rank: number; score: number; duration_ms: number } | null;
  sealed_qa: { count: number; avg_duration_ms: number; last_evidence_count: number };
  total_ms: number;
  model: string;
};

export type ApiError = { error: { code: string; message: string; field?: string } };

export const SEED_QUESTIONS = [
  { id: "q1", label: "What the manual never said" },
  { id: "q2", label: "What new hires always get wrong" },
  { id: "q3", label: "A request you refused, and why" },
  { id: "q4", label: "A case the script couldn't solve" },
] as const;

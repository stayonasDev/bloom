// DB.md 테이블과 1:1. API 응답 필드명은 여기 컬럼명과 같다.

/** ISO 639-1 대문자 2글자 (EN KO JA TL ES DE …). lib/lang.ts normalizeLanguage()로 정규화 */
export type Language = string;
export type InterviewStatus = "draft" | "sealed" | "rejected";
export type BuyerType = "ai_ops" | "eval_data";
export type PurchaseKind = "pack" | "case" | "hire";
export type RunKind = "followup" | "extract" | "match" | "sealed_qa" | "translate";
export type ItemKind = "rare" | "manual";

export type Seller = {
  id: string; display_name: string; role_title: string;
  years_experience: number; language: Language; created_at: string;
};

export type FollowupQuestion = { id: string; question: string; target: "rare" | "detail" };

export type Interview = {
  id: string; seller_id: string; status: InterviewStatus;
  seed_answers: Record<string, unknown>; notes: string | null;
  followup_questions: FollowupQuestion[]; followup_answers: Record<string, string>;
  rejected_reason: string | null; created_at: string; sealed_at: string | null;
};

export type NoteItem = { id: string; text: string; kind: ItemKind; source: string };
export type HandoverNote = {
  rules: NoteItem[]; exceptions: NoteItem[]; judgment_calls: NoteItem[];
  common_mistakes: NoteItem[]; never_do: NoteItem[];
};
export type GeneralizationEntry = {
  type: "company" | "system" | "customer" | "person" | "location";
  replaced_with: string; count: number;
};

export type Pack = {
  id: string; seller_id: string; interview_id: string;
  handover_note: HandoverNote; generalization_log: GeneralizationEntry[];
  item_count: number; rare_count: number; manual_count: number; generalized_count: number;
  price_pack_usd: number; price_case_usd: number; created_at: string;
};

export type Card = {
  id: string; pack_id: string; field: string; language: string; years_experience: number;
  difficulty: number; rarity: number; one_liner: string;
  price_pack_usd: number; price_case_usd: number; listed_at: string;
};

/** 공개 카드 (응답용). pack_id는 내부용이라 뺀다. */
export type PublicCard = Omit<Card, "pack_id">;

export type Buyer = { id: string; display_name: string; buyer_type: BuyerType; created_at: string };
export type BuyerRequest = { id: string; buyer_id: string; request_text: string; created_at: string };
export type Match = { id: string; request_id: string; card_id: string; rank: number; score: number; reason: string };
export type SealedQa = {
  id: string; card_id: string; buyer_id: string; question: string; answer: string;
  evidence_count: number; total_items: number; covered: boolean; created_at: string;
};
export type Purchase = {
  id: string; buyer_id: string; pack_id: string; kind: PurchaseKind;
  amount_usd: number; status: string; created_at: string;
};
export type ClaudeRun = {
  id: string; kind: RunKind; ref_table: string; ref_id: string; model: string;
  input_tokens: number | null; output_tokens: number | null; duration_ms: number;
  metrics: Record<string, unknown>; created_at: string;
};

/** 공개 필드만 명시적으로 고른다 — 행에 다른 컬럼(pack_id, rare_count 등)이 붙어 있어도 새지 않게 */
export const toPublicCard = (c: Card): PublicCard => ({
  id: c.id, field: c.field, language: c.language, years_experience: c.years_experience,
  difficulty: c.difficulty, rarity: c.rarity, one_liner: c.one_liner,
  price_pack_usd: Number(c.price_pack_usd), price_case_usd: Number(c.price_case_usd), listed_at: c.listed_at,
});

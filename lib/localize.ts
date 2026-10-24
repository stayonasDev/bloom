// UI 언어로 번역해 보여주기 — 모든 카드를 돌려주되 field·one_liner를 목표 언어로. 캐시(card_translations) 먼저, 없는 것만 Claude ⑥.
// 번역이 실패하면 원문 그대로 보여준다 (목록이 깨지면 안 된다).
import { translateCards, translateNote } from "./claude";
import { getCardTranslations, getPackTranslation, insertClaudeRun, upsertCardTranslations, upsertPackTranslation } from "./db";
import { normalizeLanguage } from "./lang";
import type { HandoverNote } from "./server-types";

type CardLike = { id: string; language: string; field: string; one_liner: string };

/** language가 없으면 그대로. 있으면 다른 언어 카드의 field·one_liner를 번역본으로 교체 */
export async function localizeCards<T extends CardLike>(cards: T[], language: string | null | undefined): Promise<T[]> {
  if (!language || cards.length === 0) return cards;
  const target = normalizeLanguage(language);
  const foreign = cards.filter((c) => c.language !== target);
  if (foreign.length === 0) return cards;

  const cached = new Map((await getCardTranslations(foreign.map((c) => c.id), target) ?? []).map((t) => [t.card_id, t]));
  const missing = foreign.filter((c) => !cached.has(c.id));

  if (missing.length > 0) {
    try {
      const { cards: tr, run } = await translateCards(missing.map((c) => ({ id: c.id, field: c.field, one_liner: c.one_liner })), target);
      const rows = tr.map((t) => ({ card_id: t.id, language: target, field: t.field, one_liner: t.one_liner }));
      await upsertCardTranslations(rows);
      await insertClaudeRun({ kind: "translate", ref_table: "cards", ref_id: missing[0].id, model: run.model, input_tokens: run.input_tokens, output_tokens: run.output_tokens, duration_ms: run.duration_ms, metrics: { target, count: rows.length } });
      for (const r of rows) cached.set(r.card_id, r);
    } catch (e) {
      console.error("translateCards failed — showing originals", e);
    }
  }
  return cards.map((c) => {
    const t = cached.get(c.id);
    return t ? { ...c, field: t.field, one_liner: t.one_liner } : c;
  });
}

/** 인계서 항목 텍스트를 목표 언어로. 판매자 언어와 같으면 그대로 */
export async function localizeNote(packId: string, sellerLanguage: string, note: HandoverNote, language: string | null | undefined): Promise<HandoverNote> {
  if (!language) return note;
  const target = normalizeLanguage(language);
  if (sellerLanguage === target) return note;
  const cached = await getPackTranslation(packId, target);
  if (cached) return cached.handover_note;
  try {
    const { handover_note, run } = await translateNote(note, target);
    await upsertPackTranslation(packId, target, handover_note);
    await insertClaudeRun({ kind: "translate", ref_table: "packs", ref_id: packId, model: run.model, input_tokens: run.input_tokens, output_tokens: run.output_tokens, duration_ms: run.duration_ms, metrics: { target, count: Object.values(handover_note).flat().length } });
    return handover_note;
  } catch (e) {
    console.error("translateNote failed — showing original", e);
    return note;
  }
}

import { z } from "zod";
import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid, buyerId, parseBody, recordRun } from "@/lib/http";
import { sealedQa } from "@/lib/claude";
import { countSealedQa, getBuyer, getCard, getPack, getPurchase, insertSealedQa } from "@/lib/db";

// Claude ④ 호출 — Vercel 기본 10초를 넘길 수 있다
export const maxDuration = 30;

const body = z.object({ question: z.string().min(5).max(1000) });

/** 구매 전 카드당 무료 질문 수 (API.md "제한", 프론트 UI "n of 3 free") */
export const FREE_QA_LIMIT = 3;

/**
 * POST /api/cards/{id}/ask — Claude ④ Sealed Q&A.
 * 서버만 인계서를 읽고, 응답에는 답·근거 수만. 항목 내용·id는 응답에 넣지 않는다.
 * 구매 전 3회 초과 → 429 "Unlock the pack to keep asking."
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    assertUuid(id, "Card");
    const bid = buyerId(req);
    const input = await parseBody(req, body);

    const buyer = await getBuyer(bid);
    if (!buyer) throw new ApiError("NOT_FOUND", "Buyer not found.", "x-buyer-id");
    const card = await getCard(id);
    if (!card) throw new ApiError("NOT_FOUND", "Card not found.");
    const pack = await getPack(card.pack_id);
    if (!pack) throw new ApiError("NOT_FOUND", "Pack not found.");

    const unlocked = Boolean(await getPurchase(bid, pack.id, "pack"));
    if (!unlocked && ((await countSealedQa(card.id, bid)) ?? 0) >= FREE_QA_LIMIT) {
      throw new ApiError("VALIDATION_ERROR", "Unlock the pack to keep asking.", undefined, 429);
    }

    const { answer, evidence_item_ids, covered, run } = await sealedQa({
      question: input.question, card: { field: card.field, one_liner: card.one_liner }, handover_note: pack.handover_note,
    });

    const row = await insertSealedQa({
      card_id: card.id, buyer_id: bid, question: input.question, answer,
      evidence_count: evidence_item_ids.length, total_items: pack.item_count, covered,
    });
    await recordRun(run, "sealed_qa", row.id, { evidence_count: row.evidence_count, covered });

    return json({
      id: row.id, answer: row.answer, evidence_count: row.evidence_count, total_items: row.total_items, covered: row.covered,
      run: { kind: "sealed_qa", duration_ms: run.duration_ms },
    }, 201);
  });
}

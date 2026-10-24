import { z } from "zod";
import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid, buyerId, parseBody, recordRun } from "@/lib/http";
import { sealedQa } from "@/lib/claude";
import { getBuyer, getCard, getPack, insertSealedQa } from "@/lib/db";

const body = z.object({ question: z.string().min(5).max(1000) });

/**
 * POST /api/cards/{id}/ask — Claude ④ Sealed Q&A.
 * 서버만 인계서를 읽고, 응답에는 답·근거 수만. 항목 내용·id는 응답에 넣지 않는다.
 * 구매 전 3회 제한은 미적용 (참고_문서 §3, P1).
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

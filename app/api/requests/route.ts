import { z } from "zod";
import { ApiError, handle, json } from "@/lib/errors";
import { buyerId, parseBody, recordRun } from "@/lib/http";
import { matchCards } from "@/lib/claude";
import { getBuyer, insertBuyerRequest, insertMatches, listCards } from "@/lib/db";
import { toPublicCard } from "@/lib/server-types";

const body = z.object({ request_text: z.string().min(10).max(2000) });

/** POST /api/requests — 수요문 저장 → Claude ③ 매칭 → 상위 3 카드 + 이유. Claude에는 카드 공개 필드 + 항목 수만 보낸다. */
export async function POST(req: Request) {
  return handle(async () => {
    const bid = buyerId(req);
    const input = await parseBody(req, body);
    const buyer = await getBuyer(bid);
    if (!buyer) throw new ApiError("NOT_FOUND", "Buyer not found.", "x-buyer-id");

    const request = await insertBuyerRequest({ buyer_id: bid, request_text: input.request_text });
    const cards = await listCards(100);
    const byId = new Map(cards.map((c) => [c.id, c]));

    // 후보가 없으면 Claude를 부르지 않는다
    if (cards.length === 0) {
      return json({ request_id: request.id, matches: [], run: { kind: "match", duration_ms: 0, candidate_count: 0 } }, 201);
    }

    const { matches, run } = await matchCards({
      request_text: input.request_text,
      buyer_type: buyer.buyer_type,
      candidates: cards.map((c) => ({
        card_id: c.id, field: c.field, language: c.language, years_experience: c.years_experience,
        difficulty: c.difficulty, rarity: c.rarity, one_liner: c.one_liner, item_count: c.item_count, rare_count: c.rare_count,
      })),
    });

    await insertMatches(matches.map((m) => ({ request_id: request.id, card_id: m.card_id, rank: m.rank, score: m.score, reason: m.reason })));
    await recordRun(run, "buyer_requests", request.id, { candidate_count: cards.length });

    return json({
      request_id: request.id,
      matches: matches.map((m) => {
        const c = byId.get(m.card_id)!;
        return { rank: m.rank, score: m.score, reason: m.reason, card: { ...toPublicCard(c), pack_id: c.pack_id, item_count: c.item_count } };
      }),
      run: { kind: "match", duration_ms: run.duration_ms, candidate_count: cards.length },
    }, 201);
  });
}

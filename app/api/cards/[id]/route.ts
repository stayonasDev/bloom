import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid, optionalBuyerId } from "@/lib/http";
import { countSealedQa, getCard, getPack, getPurchase } from "@/lib/db";
import { toPublicCard } from "@/lib/types";

/** GET /api/cards/{id} — 카드 상세 + 이 구매자의 구매 여부. 인계서 없음. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    assertUuid(id, "Card");
    const card = await getCard(id);
    if (!card) throw new ApiError("NOT_FOUND", "Card not found.");
    const pack = await getPack(card.pack_id);
    if (!pack) throw new ApiError("NOT_FOUND", "Pack not found.");

    const bid = optionalBuyerId(req);
    const unlocked = bid !== null && (await getPurchase(bid, pack.id, "pack")) !== null;
    const sealed_qa_count = bid === null ? 0 : await countSealedQa(card.id, bid);

    return json({ card: toPublicCard(card), item_count: pack.item_count, rare_count: pack.rare_count, unlocked, sealed_qa_count });
  });
}

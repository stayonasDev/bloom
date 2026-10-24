import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid, optionalBuyerId, optionalSellerId, resolvePack } from "@/lib/http";
import { getPurchase, getSeller } from "@/lib/db";
import { localizeNote } from "@/lib/localize";

/**
 * GET /api/packs/{id}/note — 봉인 해제 열람.
 * 인계서(handover_note)가 응답에 실리는 유일한 엔드포인트.
 * 판매자 본인(x-seller-id = packs.seller_id) 또는 구매 완료 구매자(x-buyer-id가 purchases에 있음)만.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    assertUuid(id, "Pack");
    const pack = await resolvePack(id); // pack id 또는 card id
    if (!pack) throw new ApiError("NOT_FOUND", "Pack not found.");

    const sid = optionalSellerId(req);
    const bid = optionalBuyerId(req);
    const isOwner = sid !== null && sid === pack.seller_id;
    const isBuyer = bid !== null && (await getPurchase(bid, pack.id, "pack")) !== null;
    if (!isOwner && !isBuyer) throw new ApiError("FORBIDDEN", "Unlock this pack to read the full note.");

    // ?language=KO → 항목 텍스트를 그 언어로 번역(캐시). 구조·id·kind·source는 그대로
    const language = new URL(req.url).searchParams.get("language");
    const sellerLang = language ? (await getSeller(pack.seller_id))?.language ?? "EN" : "EN";
    const handover_note = await localizeNote(pack.id, sellerLang, pack.handover_note, language);
    return json({
      pack_id: pack.id,
      handover_note,
      generalization_log: pack.generalization_log,
      metrics: { item_count: pack.item_count, rare_count: pack.rare_count, manual_count: pack.manual_count, generalized_count: pack.generalized_count },
    });
  });
}

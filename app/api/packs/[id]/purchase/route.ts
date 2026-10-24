import { z } from "zod";
import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid, buyerId, parseBody } from "@/lib/http";
import { getBuyer, getPack, getPurchase, insertPurchase } from "@/lib/db";

const body = z.object({ kind: z.enum(["pack", "case", "hire"]).default("pack") });

/** POST /api/packs/{id}/purchase — 목업 결제. 상태만 바뀐다. kind=pack만; case/hire는 "Coming soon." */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    assertUuid(id, "Pack");
    const bid = buyerId(req);
    const input = await parseBody(req, body);
    if (input.kind !== "pack") throw new ApiError("VALIDATION_ERROR", "Coming soon.", "kind");

    const buyer = await getBuyer(bid);
    if (!buyer) throw new ApiError("NOT_FOUND", "Buyer not found.", "x-buyer-id");
    const pack = await getPack(id);
    if (!pack) throw new ApiError("NOT_FOUND", "Pack not found.");

    const existing = await getPurchase(bid, pack.id, "pack");
    if (existing) return json(serialize(existing), 200);

    const p = await insertPurchase({ buyer_id: bid, pack_id: pack.id, kind: "pack", amount_usd: Number(pack.price_pack_usd), status: "mock_paid" });
    return json(serialize(p), 201);
  });
}

const serialize = (p: { id: string; pack_id: string; kind: string; amount_usd: number | string; status: string }) => ({
  purchase_id: p.id, pack_id: p.pack_id, kind: p.kind, amount_usd: Number(p.amount_usd), status: p.status, unlocked: true,
});

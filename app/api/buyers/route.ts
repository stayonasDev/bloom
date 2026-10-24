import { z } from "zod";
import { handle, json } from "@/lib/errors";
import { optionalBuyerId, parseBody } from "@/lib/http";
import { getBuyer, insertBuyer } from "@/lib/db";

const body = z.object({
  buyer_type: z.enum(["ai_ops", "eval_data"]),
  display_name: z.string().min(1).max(80).optional(),
});

/**
 * POST /api/buyers — 구매자 가명 생성. 응답 id를 x-buyer-id로 보관.
 * 프론트(app/buy)는 검색할 때마다 호출한다. x-buyer-id가 이미 있는 buyer면 새로 만들지 않고 200으로 그대로 돌려준다 —
 * 그래야 구매·Sealed Q&A 횟수가 같은 buyer에 쌓인다.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const input = await parseBody(req, body);
    const existingId = optionalBuyerId(req);
    const existing = existingId ? await getBuyer(existingId) : null;
    if (existing) return json({ id: existing.id, buyer_type: existing.buyer_type, display_name: existing.display_name }, 200);

    const b = await insertBuyer(input);
    return json({ id: b.id, buyer_type: b.buyer_type, display_name: b.display_name }, 201);
  });
}

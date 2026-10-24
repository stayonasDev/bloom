import { z } from "zod";
import { handle, json } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { insertBuyer } from "@/lib/db";

const body = z.object({
  buyer_type: z.enum(["ai_ops", "eval_data"]),
  display_name: z.string().min(1).max(80).optional(),
});

/** POST /api/buyers — 구매자 가명 생성. 응답 id를 x-buyer-id로 보관. */
export async function POST(req: Request) {
  return handle(async () => {
    const input = await parseBody(req, body);
    const b = await insertBuyer(input);
    return json({ id: b.id, buyer_type: b.buyer_type, display_name: b.display_name }, 201);
  });
}

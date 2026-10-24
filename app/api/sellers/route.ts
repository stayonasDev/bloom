import { z } from "zod";
import { handle, json } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { insertSeller } from "@/lib/db";

const body = z.object({
  role_title: z.string().min(2).max(120),
  years_experience: z.number().int().min(0).max(60),
  language: z.enum(["EN", "KO"]),
  display_name: z.string().min(1).max(80).optional(),
});

/** POST /api/sellers — 판매자 가명 생성. 응답 id를 x-seller-id로 보관. */
export async function POST(req: Request) {
  return handle(async () => {
    const input = await parseBody(req, body);
    const s = await insertSeller(input);
    return json(
      { id: s.id, role_title: s.role_title, years_experience: s.years_experience, language: s.language, display_name: s.display_name },
      201,
    );
  });
}

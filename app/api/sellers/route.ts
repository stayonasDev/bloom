import { z } from "zod";
import { handle, json } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { insertSeller } from "@/lib/db";
import type { Language } from "@/lib/server-types";

const body = z.object({
  role_title: z.string().min(2).max(120),
  years_experience: z.number().int().min(0).max(60),
  // 프론트(app/sell)는 UI 언어 이름 앞 2글자(EN/KO/JA/…)를 보낸다. DB는 EN/KO만 허용 → KO 외는 EN으로.
  language: z.string().min(1).max(10),
  display_name: z.string().min(1).max(80).optional(),
});

const normalizeLanguage = (s: string): Language => (s.trim().slice(0, 2).toUpperCase() === "KO" ? "KO" : "EN");

/** POST /api/sellers — 판매자 가명 생성. 응답 id를 x-seller-id로 보관. */
export async function POST(req: Request) {
  return handle(async () => {
    const input = await parseBody(req, body);
    const s = await insertSeller({ ...input, language: normalizeLanguage(input.language) });
    return json(
      { id: s.id, role_title: s.role_title, years_experience: s.years_experience, language: s.language, display_name: s.display_name },
      201,
    );
  });
}

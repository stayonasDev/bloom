import { z } from "zod";
import { handle, json } from "@/lib/errors";
import { parseBody } from "@/lib/http";
import { insertSeller } from "@/lib/db";
import { normalizeLanguage } from "@/lib/lang";

const body = z.object({
  role_title: z.string().min(2).max(120),
  years_experience: z.number().int().min(0).max(60),
  // 프론트(app/sell)는 UI 언어 이름 앞 2글자("EN"·"한국"·"日本"·"FI"·"ES"·"DE")를 보낸다 → ISO 코드로 정규화 (lib/lang.ts)
  language: z.string().min(1).max(40),
  display_name: z.string().min(1).max(80).optional(),
});

/** POST /api/sellers — 판매자 가명 생성. 응답 id를 x-seller-id로 보관. language는 이후 Claude 출력 언어가 된다. */
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

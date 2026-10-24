import { z } from "zod";
import { ApiError, handle, json, REJECT_MESSAGES } from "@/lib/errors";
import { parseBody, recordRun, sellerId } from "@/lib/http";
import { checkInterviewInput } from "@/lib/guard";
import { generateFollowups } from "@/lib/claude";
import { getSeller, insertInterview, updateInterview } from "@/lib/db";

// Claude ① 호출 — Vercel 기본 10초를 넘길 수 있다
export const maxDuration = 60;

const body = z.object({
  seed_answers: z.object({ q1: z.string(), q2: z.string(), q3: z.string(), q4: z.string() }),
  notes: z.string().max(5000).optional().nullable(),
});

/** POST /api/interviews — 시드 4문항(+메모) 저장 → 입력 검사 → Claude ① 꼬리질문 */
export async function POST(req: Request) {
  return handle(async () => {
    const sid = sellerId(req);
    const input = await parseBody(req, body);
    const seller = await getSeller(sid);
    if (!seller) throw new ApiError("NOT_FOUND", "Seller not found.", "x-seller-id");

    // Claude 호출 전 거부. 거부 행은 남기되 본문은 저장하지 않는다 (DB.md).
    const rejection = checkInterviewInput(input.seed_answers, input.notes);
    if (rejection) {
      await insertInterview({
        seller_id: sid, status: "rejected", rejected_reason: rejection.code, seed_answers: { rejected: true }, notes: null,
      });
      throw new ApiError(rejection.code, REJECT_MESSAGES[rejection.code], rejection.field);
    }

    const draft = await insertInterview({ seller_id: sid, status: "draft", seed_answers: input.seed_answers, notes: input.notes ?? null });

    const { followup_questions, run } = await generateFollowups({
      role_title: seller.role_title, years_experience: seller.years_experience, language: seller.language,
      seed_answers: input.seed_answers, notes: input.notes,
    });

    const interview = await updateInterview(draft.id, { followup_questions });
    await recordRun(run, "interviews", interview.id, { question_count: followup_questions.length });

    return json(
      { id: interview.id, status: interview.status, followup_questions, run: { kind: "followup", duration_ms: run.duration_ms, question_count: followup_questions.length } },
      201,
    );
  });
}

import { z } from "zod";
import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid, parseBody, recordRun, sellerId } from "@/lib/http";
import { maskPii } from "@/lib/guard";
import { extractNote } from "@/lib/claude";
import { casePriceUsd, packPriceUsd } from "@/lib/pricing";
import { getInterview, getSeller, insertCard, insertPack, updateInterview } from "@/lib/db";
import { toPublicCard, type HandoverNote } from "@/lib/server-types";

const body = z.object({ followup_answers: z.record(z.string(), z.string()) });

/** POST /api/interviews/{id}/seal — 꼬리질문 응답 저장 → Claude ② 추출·일반화·카드 → packs, cards. 인계서 원문은 응답하지 않는다. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    assertUuid(id, "Interview");
    const sid = sellerId(req);
    const input = await parseBody(req, body);

    const interview = await getInterview(id);
    if (!interview) throw new ApiError("NOT_FOUND", "Interview not found.");
    if (interview.seller_id !== sid) throw new ApiError("FORBIDDEN", "You do not own this interview.");
    if (interview.status !== "draft") throw new ApiError("VALIDATION_ERROR", `Interview is ${interview.status}, not draft.`, "status");

    const questions = interview.followup_questions ?? [];
    if (questions.length === 0) throw new ApiError("VALIDATION_ERROR", "Interview has no follow-up questions yet.", "followup_questions");
    for (const q of questions) {
      const a = input.followup_answers[q.id];
      if (!a || a.trim().length === 0) throw new ApiError("VALIDATION_ERROR", `Missing answer for ${q.id}.`, `followup_answers.${q.id}`);
    }

    const seller = await getSeller(sid);
    if (!seller) throw new ApiError("NOT_FOUND", "Seller not found.", "x-seller-id");

    // 정규식 PII 1차 마스킹은 ② 입력 전에 (API.md 서버 후처리)
    const seed = interview.seed_answers as { q1: string; q2: string; q3: string; q4: string };
    const masked = {
      seed_answers: { q1: maskPii(seed.q1), q2: maskPii(seed.q2), q3: maskPii(seed.q3), q4: maskPii(seed.q4) },
      notes: interview.notes ? maskPii(interview.notes) : null,
      followup_answers: Object.fromEntries(Object.entries(input.followup_answers).map(([k, v]) => [k, maskPii(v)])),
    };

    const { handover_note, generalization_log, card: cardDraft, run } = await extractNote({
      role_title: seller.role_title, years_experience: seller.years_experience, language: seller.language,
      ...masked, followup_questions: questions,
    });

    const metrics = countItems(handover_note, generalization_log);
    const price_pack_usd = packPriceUsd(metrics.item_count);
    const price_case_usd = casePriceUsd(cardDraft.rarity);

    const pack = await insertPack({
      seller_id: sid, interview_id: interview.id, handover_note, generalization_log,
      ...metrics, price_pack_usd, price_case_usd,
    });
    const card = await insertCard({
      pack_id: pack.id, field: cardDraft.field, language: seller.language, years_experience: seller.years_experience,
      difficulty: cardDraft.difficulty, rarity: cardDraft.rarity, one_liner: cardDraft.one_liner, price_pack_usd, price_case_usd,
    });
    await updateInterview(interview.id, { status: "sealed", sealed_at: new Date().toISOString(), followup_answers: input.followup_answers });
    await recordRun(run, "packs", pack.id, metrics);

    return json({ pack_id: pack.id, card: toPublicCard(card), metrics, run: { kind: "extract", duration_ms: run.duration_ms } }, 201);
  });
}

function countItems(note: HandoverNote, log: { count: number }[]) {
  const items = Object.values(note).flat();
  return {
    item_count: items.length,
    rare_count: items.filter((i) => i.kind === "rare").length,
    manual_count: items.filter((i) => i.kind === "manual").length,
    generalized_count: log.reduce((s, g) => s + g.count, 0),
  };
}

import { ApiError, handle, json } from "@/lib/errors";
import { assertUuid } from "@/lib/http";
import { getCardByPack, getClaudeRun, getPack, listClaudeRuns, listMatchesForCard, listSealedQaForCard } from "@/lib/db";
import { MODEL } from "@/lib/claude";

/** GET /api/packs/{id}/trace — "What Claude did" 실측 묶음. 전부 claude_runs·packs·matches·sealed_qa에서 집계. 원문 없음. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    assertUuid(id, "Pack");
    const pack = await getPack(id);
    if (!pack) throw new ApiError("NOT_FOUND", "Pack not found.");

    const [followupRun, extractRun, card] = await Promise.all([
      getClaudeRun("followup", pack.interview_id),
      getClaudeRun("extract", pack.id),
      getCardByPack(pack.id),
    ]);

    // last_match: 이 카드가 포함된 매칭 중 최신 1건 (claude_runs.created_at 기준)
    let last_match: { request_id: string; rank: number; score: number; duration_ms: number } | null = null;
    let sealed_qa: { count: number; avg_duration_ms: number; last_evidence_count: number } = { count: 0, avg_duration_ms: 0, last_evidence_count: 0 };
    let sealedTotalMs = 0;

    if (card) {
      const matches = await listMatchesForCard(card.id);
      const matchRuns = await listClaudeRuns("match", matches.map((m) => m.request_id)); // created_at desc
      const latest = matchRuns[0];
      if (latest) {
        const m = matches.find((x) => x.request_id === latest.ref_id)!;
        last_match = { request_id: m.request_id, rank: m.rank, score: Number(m.score), duration_ms: latest.duration_ms };
      }

      const qas = await listSealedQaForCard(card.id); // created_at asc
      const qaRuns = await listClaudeRuns("sealed_qa", qas.map((q) => q.id));
      sealedTotalMs = qaRuns.reduce((s, r) => s + r.duration_ms, 0);
      sealed_qa = {
        count: qas.length,
        avg_duration_ms: qaRuns.length ? Math.round(sealedTotalMs / qaRuns.length) : 0,
        last_evidence_count: qas.length ? qas[qas.length - 1].evidence_count : 0,
      };
    }

    const followup = { question_count: Number(followupRun?.metrics?.question_count ?? 0), duration_ms: followupRun?.duration_ms ?? 0 };
    const extract = {
      item_count: pack.item_count, rare_count: pack.rare_count, manual_count: pack.manual_count, generalized_count: pack.generalized_count,
      generalization_log: pack.generalization_log, duration_ms: extractRun?.duration_ms ?? 0,
    };

    return json({
      pack_id: pack.id,
      followup,
      extract,
      last_match,
      sealed_qa,
      total_ms: followup.duration_ms + extract.duration_ms + (last_match?.duration_ms ?? 0) + sealedTotalMs,
      model: extractRun?.model ?? followupRun?.model ?? MODEL,
    });
  });
}

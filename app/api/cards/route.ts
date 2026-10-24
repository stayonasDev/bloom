import { connection } from "next/server";
import { handle, json } from "@/lib/errors";
import { listCards } from "@/lib/db";
import { toPublicCard } from "@/lib/server-types";

/** GET /api/cards?limit=20 — 공개 카드 목록. 인계서 없음. */
export async function GET(req: Request) {
  // 동적 세그먼트가 없는 GET이라 cacheComponents가 프리렌더를 시도한다 — 요청 시점까지 기다린다.
  // handle() 밖에 둔다: 프리렌더 중단 신호(rejection)를 에러로 삼키면 안 된다.
  await connection();
  return handle(async () => {
    const raw = Number(new URL(req.url).searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 20;
    const rows = await listCards(limit);
    // rare_count는 상세(GET /api/cards/{id})에만 노출
    return json({ cards: rows.map((c) => ({ ...toPublicCard(c), pack_id: c.pack_id, item_count: c.item_count })) });
  });
}

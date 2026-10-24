// Route Handler 공통: 본문 zod 검증, x-seller-id / x-buyer-id 헤더 (인증 없음, 데모용 trust-on-first-use)
import { z } from "zod";
import { ApiError } from "./errors";
import type { RunMeta } from "./claude";
import { getCard, getPack, insertClaudeRun } from "./db";

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be JSON.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ApiError("VALIDATION_ERROR", i.message, i.path.length ? i.path.join(".") : undefined);
  }
  return r.data;
}

const uuid = z.uuid();

function headerId(req: Request, name: "x-seller-id" | "x-buyer-id", required: true): string;
function headerId(req: Request, name: "x-seller-id" | "x-buyer-id", required: false): string | null;
function headerId(req: Request, name: "x-seller-id" | "x-buyer-id", required: boolean): string | null {
  const v = req.headers.get(name);
  if (!v) {
    if (required) throw new ApiError("VALIDATION_ERROR", `${name} header is required.`, name);
    return null;
  }
  if (!uuid.safeParse(v).success) throw new ApiError("VALIDATION_ERROR", `${name} must be a UUID.`, name);
  return v;
}

export const sellerId = (req: Request) => headerId(req, "x-seller-id", true);
export const buyerId = (req: Request) => headerId(req, "x-buyer-id", true);
export const optionalSellerId = (req: Request) => headerId(req, "x-seller-id", false);
export const optionalBuyerId = (req: Request) => headerId(req, "x-buyer-id", false);

export function assertUuid(id: string, what: string): string {
  if (!uuid.safeParse(id).success) throw new ApiError("NOT_FOUND", `${what} not found.`);
  return id;
}

/**
 * /api/packs/{id}/* 의 {id}는 pack id가 기본이지만 card id도 받는다.
 * 프론트(app/buy/page.tsx packIdOf)가 실제 카드에는 card.id를 그대로 보내기 때문 — 404가 나면 프론트가 목 데이터로 폴백해 버린다.
 */
export async function resolvePack(id: string) {
  const pack = await getPack(id);
  if (pack) return pack;
  const card = await getCard(id);
  return card ? getPack(card.pack_id) : null;
}

/** Claude 실측을 claude_runs에 기록 (불변 조건 4) */
export async function recordRun(run: RunMeta, refTable: string, refId: string, metrics: Record<string, unknown>) {
  return insertClaudeRun({
    kind: run.kind, ref_table: refTable, ref_id: refId, model: run.model,
    input_tokens: run.input_tokens, output_tokens: run.output_tokens, duration_ms: run.duration_ms, metrics,
  });
}

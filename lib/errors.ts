// 공통 에러 형식 (API.md): { error: { code, message, field? } }

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CLAUDE_FAILED"
  | "TOO_SHORT"
  | "LOG_PASTE_SUSPECTED"
  | "PII_DETECTED";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CLAUDE_FAILED: 502,
  TOO_SHORT: 422,
  LOG_PASTE_SUSPECTED: 422,
  PII_DETECTED: 422,
};

// 화면 문구 (PRD §7) — 거부 3종은 고정 문구
export const REJECT_MESSAGES: Record<"TOO_SHORT" | "LOG_PASTE_SUSPECTED" | "PII_DETECTED", string> = {
  TOO_SHORT: "Give us a bit more — at least a few sentences per question.",
  LOG_PASTE_SUSPECTED: "This looks like a call log. Please describe it in your own words.",
  PII_DETECTED: "Please remove names, emails and phone numbers.",
};

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly field?: string,
    public readonly status: number = DEFAULT_STATUS[code],
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse(): Response {
    const body: { error: { code: ErrorCode; message: string; field?: string } } = {
      error: { code: this.code, message: this.message },
    };
    if (this.field) body.error.field = this.field;
    return Response.json(body, { status: this.status });
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

/** Route Handler 본문을 감싸 ApiError → JSON 응답, 그 외 → 500 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    console.error(e);
    return Response.json(
      { error: { code: "INTERNAL", message: "Unexpected server error." } },
      { status: 500 },
    );
  }
}

import { describe, it, expect } from "vitest";
import { ApiError, handle, REJECT_MESSAGES } from "@/lib/errors";

describe("ApiError → API.md 공통 에러 형식", () => {
  it("serializes { error: { code, message, field } } with default status", async () => {
    const res = new ApiError("LOG_PASTE_SUSPECTED", REJECT_MESSAGES.LOG_PASTE_SUSPECTED, "seed_answers.q4").toResponse();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: "LOG_PASTE_SUSPECTED", message: REJECT_MESSAGES.LOG_PASTE_SUSPECTED, field: "seed_answers.q4" },
    });
  });

  it("omits field when absent and maps codes to HTTP status", async () => {
    const cases: [ConstructorParameters<typeof ApiError>[0], number][] = [
      ["VALIDATION_ERROR", 400], ["FORBIDDEN", 403], ["NOT_FOUND", 404],
      ["CLAUDE_FAILED", 502], ["TOO_SHORT", 422], ["PII_DETECTED", 422],
    ];
    for (const [code, status] of cases) {
      const res = new ApiError(code, "m").toResponse();
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: { code, message: "m" } });
    }
  });

  it("allows status override (e.g. 429 for Q&A limit)", () => {
    expect(new ApiError("VALIDATION_ERROR", "Unlock the pack to keep asking.", undefined, 429).toResponse().status).toBe(429);
  });

  it("handle() converts thrown ApiError and hides unknown errors as 500", async () => {
    const r1 = await handle(async () => { throw new ApiError("NOT_FOUND", "nope"); });
    expect(r1.status).toBe(404);
    const r2 = await handle(async () => { throw new Error("boom"); });
    expect(r2.status).toBe(500);
    expect((await r2.json()).error.message).not.toContain("boom");
  });
});

import { describe, it, expect } from "vitest";
import { checkInterviewInput, maskPii, GUARD, type SeedAnswers } from "@/lib/guard";

// 정상 샘플: 숫자·예외·거절 사례가 있고 로그 패턴은 없다 (PRD §8 "판매자 샘플" 조건)
const ok: SeedAnswers = {
  q1: "The manual says offer the loyalty credit, but it only works if the customer hasn't changed plans in the last 60 days. Nobody tells you that.",
  q2: "New hires reset the billing cycle when a customer asks about proration. That doubles the charge for the month and creates a dispute.",
  q3: "I refused a retroactive roaming waiver for a customer who turned data roaming on himself. The policy allows waivers only for system errors.",
  q4: "A family plan customer moved abroad mid-cycle; the script had no branch. I prorated 14 days at $42.10 and escalated the roaming part.",
};

describe("checkInterviewInput — API.md 입력 검사 표", () => {
  it("passes a normal interview", () => {
    expect(checkInterviewInput(ok, "My checklist: 1) plan change date 2) roaming toggle history")).toBeNull();
  });

  it("TOO_SHORT when any seed answer < 40 chars, with the field", () => {
    expect(checkInterviewInput({ ...ok, q2: "They reset the cycle." })).toEqual({ code: "TOO_SHORT", field: "seed_answers.q2" });
    expect(checkInterviewInput({ ...ok, q4: " ".repeat(50) })).toEqual({ code: "TOO_SHORT", field: "seed_answers.q4" });
  });

  it("LOG_PASTE_SUSPECTED when any seed answer > 2,500 chars", () => {
    const long = "x".repeat(GUARD.MAX_CHARS + 1);
    expect(checkInterviewInput({ ...ok, q3: long })).toEqual({ code: "LOG_PASTE_SUSPECTED", field: "seed_answers.q3" });
    expect(checkInterviewInput({ ...ok, q3: "x".repeat(GUARD.MAX_CHARS) })).toBeNull();
  });

  it("LOG_PASTE_SUSPECTED when ≥3 lines look like a dialogue transcript (Agent:/Customer:)", () => {
    const log = [
      "This is what happened on the call and I will paste it here.",
      "Agent: Thank you for calling, how can I help?",
      "Customer: My bill doubled this month.",
      "Agent: Let me check your proration.",
    ].join("\n");
    expect(checkInterviewInput({ ...ok, q4: log })).toEqual({ code: "LOG_PASTE_SUSPECTED", field: "seed_answers.q4" });
    // 2줄은 통과 (임계값 3)
    const two = "Something I remember from one call that went sideways for us:\nAgent: hi there\nCustomer: hello";
    expect(checkInterviewInput({ ...ok, q4: two })).toBeNull();
    // 전각 콜론, 단문자 접두(a:/c:)도 잡는다 — notes까지 합산
    const notes = "a: one\nc: two\nA：three";
    expect(checkInterviewInput(ok, notes)?.code).toBe("LOG_PASTE_SUSPECTED");
  });

  it("LOG_PASTE_SUSPECTED when ≥3 timestamps across all text", () => {
    expect(checkInterviewInput({ ...ok, q1: ok.q1 + " at 10:15, then 10:32:07, then 11:02." })).toEqual({
      code: "LOG_PASTE_SUSPECTED", field: "seed_answers.q1",
    });
    // 타임스탬프 2개 + 금액은 통과
    expect(checkInterviewInput({ ...ok, q1: ok.q1 + " at 10:15 and 11:02, $42.10." })).toBeNull();
  });

  it("PII_DETECTED when ≥2 emails or ≥2 phone numbers", () => {
    expect(checkInterviewInput({ ...ok, q3: ok.q3 + " Contact john@example.com or jane@example.org." })).toEqual({
      code: "PII_DETECTED", field: "seed_answers.q3",
    });
    expect(checkInterviewInput({ ...ok, q3: ok.q3 + " Call 0917 123 4567 or +63 2 8123 4567." })).toEqual({
      code: "PII_DETECTED", field: "seed_answers.q3",
    });
    // 이메일 1개 + 전화 1개는 통과 (각각 2개 미만)
    expect(checkInterviewInput({ ...ok, q3: ok.q3 + " john@example.com 0917 123 4567" })).toBeNull();
    // 숫자가 많은 정상 문장은 전화번호로 오인하지 않는다
    expect(checkInterviewInput({ ...ok, q4: ok.q4 + " 60 days, 14 days, $42.10, 2026-10-24, 190 units, 250 cases." })).toBeNull();
  });

  it("applies checks in table order: TOO_SHORT before log/PII", () => {
    expect(checkInterviewInput({ ...ok, q1: "Agent: hi\nAgent: hi\nAgent: hi" })?.code).toBe("TOO_SHORT");
  });
});

describe("maskPii — Claude ② 입력 전 1차 마스킹", () => {
  it("replaces emails and phone numbers, keeps the rest", () => {
    expect(maskPii("Email john@example.com or call 0917 123 4567 about the $42.10 proration on day 58."))
      .toBe("Email [email] or call [phone] about the $42.10 proration on day 58.");
  });
});

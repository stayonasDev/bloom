import { describe, it, expect } from "vitest";
import { normalizeLanguage, languageName } from "@/lib/lang";

// 프론트 app/sell은 UI 언어 이름의 앞 2글자를 보낸다 (lib/i18n LANGS: English·한국어·日本語·Filipino·Español·Deutsch)
describe("normalizeLanguage — 프론트가 보내는 값 전부 ISO 2글자로", () => {
  it("maps the six UI languages as the front actually sends them", () => {
    expect(normalizeLanguage("EN")).toBe("EN");
    expect(normalizeLanguage("한국")).toBe("KO");
    expect(normalizeLanguage("日本")).toBe("JA");
    expect(normalizeLanguage("FI")).toBe("TL");
    expect(normalizeLanguage("ES")).toBe("ES");
    expect(normalizeLanguage("DE")).toBe("DE");
  });
  it("accepts full names, lowercase codes and write-in languages", () => {
    expect(normalizeLanguage("Korean")).toBe("KO");
    expect(normalizeLanguage("ko")).toBe("KO");
    expect(normalizeLanguage("Japanese")).toBe("JA");
    expect(normalizeLanguage("Tagalog")).toBe("TL");
    expect(normalizeLanguage("Spanish")).toBe("ES");
    expect(normalizeLanguage("français")).toBe("FR");
    expect(normalizeLanguage("Vietnamese")).toBe("VI");
  });
  it("falls back: unknown Latin 2 letters kept, otherwise EN", () => {
    expect(normalizeLanguage("xq")).toBe("XQ");
    expect(normalizeLanguage("")).toBe("EN");
    expect(normalizeLanguage(undefined)).toBe("EN");
    expect(normalizeLanguage("??")).toBe("EN");
  });
  it("languageName gives a prompt-ready name", () => {
    expect(languageName("KO")).toBe("Korean");
    expect(languageName("tl")).toBe("Filipino (Tagalog)");
    expect(languageName("XQ")).toContain("XQ");
  });
});

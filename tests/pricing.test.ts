import { describe, it, expect } from "vitest";
import { packPriceUsd, casePriceUsd } from "@/lib/pricing";

// PRD §9 / API.md: 팩 clamp(item_count×7, 49, 499), 건당 8 + rarity×3
describe("pricing constants", () => {
  it("pack price = item_count × 7 within [49, 499]", () => {
    expect(packPriceUsd(22)).toBe(154);
    expect(packPriceUsd(0)).toBe(49);   // 하한
    expect(packPriceUsd(7)).toBe(49);   // 7×7=49 경계
    expect(packPriceUsd(8)).toBe(56);
    expect(packPriceUsd(71)).toBe(497);
    expect(packPriceUsd(72)).toBe(499); // 상한
    expect(packPriceUsd(1000)).toBe(499);
  });

  it("case price = 8 + rarity × 3", () => {
    expect(casePriceUsd(1)).toBe(11);
    expect(casePriceUsd(4)).toBe(20);
    expect(casePriceUsd(5)).toBe(23);
  });
});

// 가격은 서버 상수 (PRD §9, API.md 서버 후처리). Claude가 산정하지 않는다.

export const PACK_PRICE_PER_ITEM = 7;
export const PACK_PRICE_MIN = 49;
export const PACK_PRICE_MAX = 499;
export const CASE_PRICE_BASE = 8;
export const CASE_PRICE_PER_RARITY = 3;

/** price_pack_usd = clamp(item_count × 7, 49, 499) */
export function packPriceUsd(itemCount: number): number {
  return Math.min(Math.max(itemCount * PACK_PRICE_PER_ITEM, PACK_PRICE_MIN), PACK_PRICE_MAX);
}

/** price_case_usd = 8 + rarity × 3 */
export function casePriceUsd(rarity: number): number {
  return CASE_PRICE_BASE + rarity * CASE_PRICE_PER_RARITY;
}

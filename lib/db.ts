// DB 접근 계층 — Route Handler는 이 함수들만 쓴다 (단위 테스트는 이 모듈을 vi.mock으로 대체).
// 테이블·컬럼은 DB.md 그대로.
import { supabase } from "./supabase";
import type {
  Buyer, BuyerRequest, Card, ClaudeRun, Interview, Match, Pack, Purchase, PurchaseKind, RunKind, SealedQa, Seller,
} from "./server-types";

type Result<T> = { data: T | null; error: { message: string } | null };

function must<T>(r: Result<T>, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null || r.data === undefined) throw new Error(`${what}: no data`);
  return r.data;
}
function maybe<T>(r: Result<T>, what: string): T | null {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data ?? null;
}

const CARD_PUBLIC = "id, pack_id, field, language, years_experience, difficulty, rarity, one_liner, price_pack_usd, price_case_usd, listed_at";

// ----- sellers -----
export async function insertSeller(row: Pick<Seller, "role_title" | "years_experience" | "language"> & { display_name?: string }) {
  return must<Seller>(await supabase().from("sellers").insert(row).select().single(), "insertSeller");
}
export async function getSeller(id: string) {
  return maybe<Seller>(await supabase().from("sellers").select().eq("id", id).maybeSingle(), "getSeller");
}

// ----- interviews -----
export async function insertInterview(row: Partial<Interview> & Pick<Interview, "seller_id" | "seed_answers">) {
  return must<Interview>(await supabase().from("interviews").insert(row).select().single(), "insertInterview");
}
export async function getInterview(id: string) {
  return maybe<Interview>(await supabase().from("interviews").select().eq("id", id).maybeSingle(), "getInterview");
}
export async function updateInterview(id: string, patch: Partial<Interview>) {
  return must<Interview>(await supabase().from("interviews").update(patch).eq("id", id).select().single(), "updateInterview");
}

// ----- packs -----
export async function insertPack(row: Omit<Pack, "id" | "created_at">) {
  return must<Pack>(await supabase().from("packs").insert(row).select().single(), "insertPack");
}
export async function getPack(id: string) {
  return maybe<Pack>(await supabase().from("packs").select().eq("id", id).maybeSingle(), "getPack");
}

// ----- cards -----
export async function insertCard(row: Omit<Card, "id" | "listed_at">) {
  return must<Card>(await supabase().from("cards").insert(row).select(CARD_PUBLIC).single(), "insertCard");
}
export async function getCard(id: string) {
  return maybe<Card>(await supabase().from("cards").select(CARD_PUBLIC).eq("id", id).maybeSingle(), "getCard");
}
export async function getCardByPack(packId: string) {
  return maybe<Card>(await supabase().from("cards").select(CARD_PUBLIC).eq("pack_id", packId).maybeSingle(), "getCardByPack");
}
export type CardWithCounts = Card & { item_count: number; rare_count: number };
/** 공개 카드 + packs.item_count/rare_count (인계서 없음). listed_at desc. */
/** language(ISO 2글자)를 주면 그 언어 카드만 — UI 언어와 섞이지 않게 */
export async function listCards(limit: number, language?: string | null): Promise<CardWithCounts[]> {
  // cards.pack_id → packs는 다대일이라 PostgREST는 객체로 반환하지만, 생성 타입이 없으면 배열로 추론되어 cast
  let q = supabase().from("cards").select(`${CARD_PUBLIC}, packs(item_count, rare_count)`);
  if (language) q = q.eq("language", language);
  const rows = must<(Card & { packs: { item_count: number; rare_count: number } | null })[]>(
    (await q.order("listed_at", { ascending: false }).limit(limit)) as unknown as Result<(Card & { packs: { item_count: number; rare_count: number } | null })[]>,
    "listCards",
  );
  return rows.map(({ packs, ...c }) => ({ ...c, item_count: packs?.item_count ?? 0, rare_count: packs?.rare_count ?? 0 }));
}

// ----- buyers -----
export async function insertBuyer(row: Pick<Buyer, "buyer_type"> & { display_name?: string }) {
  return must<Buyer>(await supabase().from("buyers").insert(row).select().single(), "insertBuyer");
}
export async function getBuyer(id: string) {
  return maybe<Buyer>(await supabase().from("buyers").select().eq("id", id).maybeSingle(), "getBuyer");
}

// ----- buyer_requests / matches -----
export async function insertBuyerRequest(row: Pick<BuyerRequest, "buyer_id" | "request_text">) {
  return must<BuyerRequest>(await supabase().from("buyer_requests").insert(row).select().single(), "insertBuyerRequest");
}
export async function insertMatches(rows: Omit<Match, "id">[]) {
  if (rows.length === 0) return [] as Match[];
  return must<Match[]>(await supabase().from("matches").insert(rows).select(), "insertMatches");
}
export async function listMatchesForCard(cardId: string) {
  return must<Match[]>(await supabase().from("matches").select().eq("card_id", cardId), "listMatchesForCard");
}

// ----- sealed_qa -----
export async function insertSealedQa(row: Omit<SealedQa, "id" | "created_at">) {
  return must<SealedQa>(await supabase().from("sealed_qa").insert(row).select().single(), "insertSealedQa");
}
export async function countSealedQa(cardId: string, buyerId: string) {
  const r = await supabase().from("sealed_qa").select("id", { count: "exact", head: true }).eq("card_id", cardId).eq("buyer_id", buyerId);
  if (r.error) throw new Error(`countSealedQa: ${r.error.message}`);
  return r.count ?? 0;
}
export async function listSealedQaForCard(cardId: string) {
  return must<SealedQa[]>(await supabase().from("sealed_qa").select().eq("card_id", cardId).order("created_at", { ascending: true }), "listSealedQaForCard");
}

// ----- purchases -----
export async function getPurchase(buyerId: string, packId: string, kind: PurchaseKind) {
  return maybe<Purchase>(
    await supabase().from("purchases").select().eq("buyer_id", buyerId).eq("pack_id", packId).eq("kind", kind).maybeSingle(),
    "getPurchase",
  );
}
export async function insertPurchase(row: Omit<Purchase, "id" | "created_at">) {
  return must<Purchase>(await supabase().from("purchases").insert(row).select().single(), "insertPurchase");
}

// ----- claude_runs -----
export async function insertClaudeRun(row: Omit<ClaudeRun, "id" | "created_at">) {
  return must<ClaudeRun>(await supabase().from("claude_runs").insert(row).select().single(), "insertClaudeRun");
}
/** kind + ref_id의 최신 1건 */
export async function getClaudeRun(kind: RunKind, refId: string) {
  return maybe<ClaudeRun>(
    await supabase().from("claude_runs").select().eq("kind", kind).eq("ref_id", refId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "getClaudeRun",
  );
}
export async function listClaudeRuns(kind: RunKind, refIds: string[]) {
  if (refIds.length === 0) return [] as ClaudeRun[];
  return must<ClaudeRun[]>(
    await supabase().from("claude_runs").select().eq("kind", kind).in("ref_id", refIds).order("created_at", { ascending: false }),
    "listClaudeRuns",
  );
}

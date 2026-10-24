// Thin client for docs/API.md. Tries the real API; falls back to fixtures when the
// server is not there yet (network error, 404, 501) so the front end stays demo-able.
// Input rejections (422) are never faked away — the same rules run here in mock mode.
import * as mock from "./mock";
import type { AskResponse, InterviewResponse, NoteResponse, PurchaseResponse, RequestResponse, SealResponse, TraceResponse, Card } from "./types";

const FORCE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

export class ApiRejection extends Error {
  code: string;
  field?: string;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

function id(key: "seller" | "buyer") {
  if (typeof window === "undefined") return "";
  const k = `handover.${key}_id`;
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(k, v);
  }
  return v;
}
// The server issues the real id (POST /api/sellers|buyers). Keep it so refreshes stay unlocked.
function remember(key: "seller" | "buyer", serverId?: string) {
  if (typeof window !== "undefined" && serverId) localStorage.setItem(`handover.${key}_id`, serverId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit, fallback: () => Promise<T>): Promise<T> {
  if (FORCE_MOCK) return fallback();
  try {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", "x-seller-id": id("seller"), "x-buyer-id": id("buyer"), ...(init.headers || {}) } });
    if (res.status === 404 || res.status === 501) return fallback();
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = (body as { error?: { code?: string; message?: string; field?: string } }).error;
      // Server not configured (no Supabase/Anthropic keys) → demo data, so the screen never breaks. Real 422/429/403/502 still surface.
      if (res.status === 500 && (e?.code === "INTERNAL" || !e)) { console.warn(`[handover] ${path} → 500 ${e?.code ?? ""}; using demo data`); return fallback(); }
      throw new ApiRejection(e?.code || `HTTP_${res.status}`, e?.message || "Request failed", e?.field);
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiRejection) throw err;
    return fallback(); // network error → demo data
  }
}

// ── input rules (mirror of docs/API.md, applied client-side too) ──
export function checkSeedAnswers(answers: Record<string, string>, notes: string): ApiRejection | null {
  const all = [...Object.values(answers), notes].join("\n");
  for (const [k, v] of Object.entries(answers)) {
    if (v.trim().length < 40) return new ApiRejection("TOO_SHORT", "Give us a bit more. At least a few sentences per question.", `seed_answers.${k}`);
    if (v.length > 2500) return new ApiRejection("LOG_PASTE_SUSPECTED", "This looks like a call log. Please describe it in your own words.", `seed_answers.${k}`);
  }
  const turns = (all.match(/^\s*(agent|customer|rep|caller|user|bot|cs|a|c)\s*[:：]/gim) || []).length;
  const stamps = (all.match(/\b\d{1,2}:\d{2}(:\d{2})?\b/g) || []).length;
  if (turns >= 3 || stamps >= 3) return new ApiRejection("LOG_PASTE_SUSPECTED", "Looks like a pasted call log (timestamps, agent/customer turns). Remove it to continue. We only need your judgment.", "notes");
  const emails = (all.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).length;
  const phones = (all.match(/\+?\d[\d\s().-]{8,}\d/g) || []).length;
  if (emails >= 2 || phones >= 2) return new ApiRejection("PII_DETECTED", "Please remove names, emails and phone numbers.", "notes");
  return null;
}

export const api = {
  async createSeller(body: { role_title: string; years_experience: number; language: string }) {
    const r = await call<{ id: string }>("/api/sellers", { method: "POST", body: JSON.stringify(body) }, async () => ({ id: id("seller") }));
    remember("seller", r.id);
    return r;
  },
  async createInterview(body: { seed_answers: Record<string, string>; notes?: string }): Promise<InterviewResponse> {
    const rej = checkSeedAnswers(body.seed_answers, body.notes || "");
    if (rej) throw rej;
    return call("/api/interviews", { method: "POST", body: JSON.stringify(body) }, async () => { await sleep(1800); return mock.interview; });
  },
  async sealInterview(interviewId: string, followup_answers: Record<string, string>): Promise<SealResponse> {
    return call(`/api/interviews/${interviewId}/seal`, { method: "POST", body: JSON.stringify({ followup_answers }) }, async () => { await sleep(4200); return mock.seal; });
  },
  async getNote(packId: string, language?: string): Promise<NoteResponse> {
    const q = language ? `?language=${encodeURIComponent(language)}` : "";
    return call(`/api/packs/${packId}/note${q}`, { method: "GET" }, async () => ({ ...mock.noteResponse, pack_id: packId }));
  },
  // language: 현재 UI 언어 코드(en·ko·…). 주면 그 언어 카드만 — 목록이 다른 언어와 섞이지 않게.
  async listCards(language?: string): Promise<{ cards: Card[] }> {
    const q = language ? `&language=${encodeURIComponent(language)}` : "";
    return call(`/api/cards?limit=20${q}`, { method: "GET" }, async () => ({ cards: mock.cards }));
  },
  async createBuyer(body: { buyer_type: "ai_ops" | "eval_data" }) {
    const r = await call<{ id: string }>("/api/buyers", { method: "POST", body: JSON.stringify(body) }, async () => ({ id: id("buyer") }));
    remember("buyer", r.id);
    return r;
  },
  async createRequest(request_text: string, language?: string): Promise<RequestResponse> {
    return call("/api/requests", { method: "POST", body: JSON.stringify({ request_text, language }) }, async () => { await sleep(1600); return mock.request; });
  },
  async ask(cardId: string, question: string): Promise<AskResponse> {
    return call(`/api/cards/${cardId}/ask`, { method: "POST", body: JSON.stringify({ question }) }, async () => {
      await sleep(2000);
      return /prepaid|insurance|refund policy for shoes/i.test(question) ? mock.askNotCovered : mock.ask;
    });
  },
  async purchase(packId: string): Promise<PurchaseResponse> {
    return call(`/api/packs/${packId}/purchase`, { method: "POST", body: JSON.stringify({ kind: "pack" }) }, async () => ({ ...mock.purchase, pack_id: packId }));
  },
  async getTrace(packId: string): Promise<TraceResponse> {
    return call(`/api/packs/${packId}/trace`, { method: "GET" }, async () => ({ ...mock.trace, pack_id: packId }));
  },
};

export const fmtUSD = (n: number) => `USD ${Math.round(n)}`;
export const fmtS = (ms: number) => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`;
export const fmtDate = (iso: string) => iso.replace("T", " ").slice(0, 16);

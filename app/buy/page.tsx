"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Arrow, BlindCard, Bracket, Display, Fit, Lock, Section } from "@/components/ui";
import { api, ApiRejection, fmtS, fmtUSD } from "@/lib/api";
import type { AskResponse, Card, Match, RequestResponse } from "@/lib/types";
import { useT, type Key } from "@/lib/i18n";
import { BUYER_SAMPLE } from "@/lib/sample";

// Categories are derived from the card's field until the API carries one.
const CATS: { id: string; k: Key; test: RegExp }[] = [
  { id: "telecom", k: "cat.telecom", test: /telecom|billing|roaming|prepaid|retention/i },
  { id: "ecommerce", k: "cat.ecommerce", test: /return|chargeback|refund|order|shop/i },
  { id: "health", k: "cat.health", test: /clinic|front-desk|intake|insurance|hospital|patient/i },
  { id: "finance", k: "cat.finance", test: /bookkeep|account|receipt|tax|invoice/i },
  { id: "language", k: "cat.language", test: /translat|legal|review/i },
];
const catOf = (c: Card) => CATS.find((x) => x.test.test(`${c.field} ${c.one_liner}`))?.id ?? "other";

export default function Buy() {
  const { t } = useT();
  const router = useRouter();
  const [text, setText] = useState(BUYER_SAMPLE.demand);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RequestResponse | null>(null);
  const [sel, setSel] = useState<Match | null>(null);
  const [q, setQ] = useState(BUYER_SAMPLE.question);
  const [qa, setQa] = useState<{ q: string; a: AskResponse }[]>([]);
  const [asking, setAsking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [askErr, setAskErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [all, setAll] = useState<Card[]>([]);
  // keyword / category / language search over the sealed notes
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const resRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLElement>(null);

  useEffect(() => { api.listCards().then((r) => setAll(r.cards)).catch(() => {}); }, []);
  useEffect(() => { if (res) resRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [res]);

  const langs = useMemo(() => Array.from(new Set(all.map((c) => c.language))), [all]);
  const filtered = useMemo(() => {
    const needle = kw.trim().toLowerCase();
    return all.filter((c) =>
      (!cat || catOf(c) === cat) &&
      (!lang || c.language === lang) &&
      (!needle || `${c.field} ${c.one_liner} ${c.language}`.toLowerCase().includes(needle)));
  }, [all, kw, cat, lang]);

  function soon() { setToast(t("buy.soon")); window.setTimeout(() => setToast(null), 2200); }

  function pick(card: Card, match?: Match) {
    setSel(match ?? { rank: 0, score: 0, reason: "", card });
    setQa([]); setAskErr(null);
    window.setTimeout(() => askRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function find() {
    setBusy(true); setRes(null); setSel(null); setQa([]);
    try {
      await api.createBuyer({ buyer_type: "ai_ops" });
      const r = await api.createRequest(text);
      setRes(r); setSel(r.matches[0] || null);
    } finally { setBusy(false); }
  }

  async function ask(question = q) {
    if (!sel || !question.trim()) return;
    setAsking(true); setAskErr(null);
    try {
      const a = await api.ask(sel.card.id, question);
      setQa((prev) => [...prev, { q: question, a }]); setQ("");
    } catch (e) {
      setAskErr(e instanceof ApiRejection && e.code === "VALIDATION_ERROR" ? t("buy.limit") : t("err.unknown"));
    } finally { setAsking(false); }
  }

  async function unlock() {
    if (!sel) return;
    setUnlocking(true);
    try {
      const p = await api.purchase(packIdOf(sel.card.id));
      router.push(`/packs/${p.pack_id}/note`);
    } finally { setUnlocking(false); }
  }

  const askPanel = sel && (
    <aside ref={askRef} className="card paperblock-in sticky top-24 flex scroll-mt-24 flex-col gap-6 self-start p-7">
      <div className="flex items-start justify-between"><div><Bracket>{t("buy.ask_title")}</Bracket><div className="mt-2 text-[20px] font-semibold tracking-tight">{sel.card.field}</div></div><span className="font-mono text-[12px] text-ash">{t("buy.free", { n: Math.max(0, 3 - qa.length) })}</span></div>
      <div className="flex flex-col gap-5">
        {qa.map((x, i) => (
          <div key={i}>
            <Bracket>{t("buy.your_q")}</Bracket>
            <p className="mt-1 text-[16px] leading-[1.45]">{x.q}</p>
            <div className="paperblock-in mt-3 rounded-[12px] bg-paper p-5">
              <div className="flex items-center gap-2"><Lock /><Bracket>{t("buy.answer")}</Bracket></div>
              <p className={`mt-3 text-[15px] leading-[1.6] ${x.a.covered ? "" : "text-graphite"}`}>{x.a.answer}</p>
              <div className="mt-4 border-t border-rule pt-3 font-mono text-[12px] text-ash">{x.a.covered ? t("buy.based", { e: x.a.evidence_count, t: x.a.total_items }) : t("buy.not_covered")} · {fmtS(x.a.run.duration_ms)} · {t("buy.stays")}</div>
            </div>
          </div>
        ))}
        {asking && <div><div className="progress"><i style={{ animationDuration: "3s" }} /></div><div className="mt-2 font-mono text-[12px] text-graphite">{t("buy.reading")}</div></div>}
      </div>
      <div className="flex flex-col gap-3">
        {askErr && <div className="rounded-[8px] bg-clay-tint px-4 py-3 text-[14px] text-[#6E3A10]">{askErr}</div>}
        <div className="flex gap-3">
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder={t("buy.ask_ph")} disabled={asking || qa.length >= 3} />
          <button className="btn btn-sm shrink-0" onClick={() => ask()} disabled={asking || !q.trim() || qa.length >= 3}>{t("buy.ask_btn")}</button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-rule pt-6">
        <button className="btn btn-fern justify-between" onClick={unlock} disabled={unlocking}><span className="flex items-center gap-2"><Lock open /> {t("buy.unlock")}</span><span className="font-mono font-normal">{fmtUSD(sel.card.price_pack_usd)} · {t("buy.once")}</span></button>
        <button className="btn justify-between" onClick={soon}><span>{t("buy.route")}</span><span className="font-mono font-normal">{fmtUSD(sel.card.price_case_usd)} {t("card.per_case")}</span></button>
        <button className="btn justify-between" onClick={soon}><span>{t("buy.hire")}</span><span className="font-mono font-normal">{t("buy.on_hire")}</span></button>
        <span className="mt-1 text-[12px] text-ash">{toast ? <span className="chip chip-fern">{toast}</span> : t("buy.mock")}</span>
      </div>
    </aside>
  );

  return (
    <main className="flex-1">
      <div className="grain border-b border-rule">
        <Section className="py-14">
          <Bracket>{t("buy.kicker")}</Bracket>
          <h1 className="display mt-5 text-[clamp(56px,7.5vw,108px)]">{t("buy.h1a")} <em className="italic text-fern">{t("buy.h1em")}</em>.</h1>
          <p className="mt-4 max-w-[640px] text-[19px] leading-[1.5] text-graphite">{t("buy.lead")}</p>
          <div className="mt-10 max-w-[900px]">
            <textarea className="field text-[22px] leading-[1.4]" rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy && text.trim().length >= 20) { e.preventDefault(); find(); } }} placeholder={t("buy.ph")} />
            <div className="mt-6 flex items-center justify-between gap-6">
              <span className="text-[13px] text-ash">{t("buy.or_search")}</span>
              <button className="btn btn-ink" onClick={find} disabled={busy || text.trim().length < 20}>{busy ? t("buy.finding") : t("buy.find")} <Arrow /></button>
            </div>
          </div>
        </Section>
      </div>

      {/* ── matches (after a demand) ── */}
      {res && (
        <Section className="py-14">
          <div ref={resRef} className="flex scroll-mt-24 items-end justify-between">
            <Display size="clamp(64px,9vw,140px)">{t("buy.three")}</Display>
            <Bracket>{t("buy.ranked", { n: res.matches.length, c: res.run.candidate_count, s: fmtS(res.run.duration_ms) })}</Bracket>
          </div>
          <div className="mt-10 grid grid-cols-[1fr_520px] gap-10">
            <div className="stagger flex flex-col">
              {res.matches.map((m) => (
                <button key={m.card.id} onClick={() => pick(m.card, m)} className={`grid grid-cols-[110px_1fr] gap-6 border-t py-7 text-left transition-colors ${sel?.card.id === m.card.id ? "border-ink" : "border-rule hover:bg-paper-2/60"}`}>
                  <div><Fit score={m.score} /><div className="mt-2"><Bracket>{t("buy.match_n", { n: m.rank })}</Bracket></div></div>
                  <div>
                    <div className="flex items-start justify-between gap-4"><span className="font-display text-[34px] leading-none tracking-tight">{m.card.field}</span><span className="chip chip-fern shrink-0"><Lock /> {t("card.sealed")} · {m.card.item_count}</span></div>
                    <p className="mt-3 text-[15px] leading-[1.5]"><b className="font-semibold">{t("buy.why")}</b> {m.reason}</p>
                    <div className="mt-3 font-mono text-[12px] text-graphite">{m.card.language} · {m.card.years_experience} {t("card.yrs")} · {t("card.difficulty")} {m.card.difficulty}/5 · {t("card.rarity")} {m.card.rarity}/5 · {fmtUSD(m.card.price_pack_usd)} · {fmtUSD(m.card.price_case_usd)} {t("card.per_case")}</div>
                  </div>
                </button>
              ))}
              <div className="border-t border-rule" />
            </div>
            {askPanel}
          </div>
        </Section>
      )}

      {/* ── browse: keyword · category · language ── */}
      {all.length > 0 && (
        <Section className="py-14">
          <div className="flex items-end justify-between gap-6">
            <div>
              <Bracket>{t("buy.browse")}</Bracket>
              <Display className="mt-3" size="clamp(44px,6vw,88px)">{t("buy.browse_word")}</Display>
            </div>
            <span className="font-mono text-[12px] text-ash">{t("buy.results", { n: filtered.length, total: all.length })}</span>
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-ink pt-6">
            <div className="flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-ash" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
              <input className="field text-[19px]" value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("buy.search_ph")} aria-label={t("buy.search_ph")} />
              {kw && <button className="btn btn-sm" onClick={() => setKw("")}>{t("buy.clear")}</button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Bracket>{t("buy.category")}</Bracket>
              <button className={`chip ${!cat ? "chip-fern" : ""}`} onClick={() => setCat(null)}>{t("buy.filter_all")}</button>
              {CATS.map((c) => <button key={c.id} className={`chip ${cat === c.id ? "chip-fern" : ""}`} onClick={() => setCat(cat === c.id ? null : c.id)}>{t(c.k)}</button>)}
              <span className="mx-2 h-4 w-px bg-rule" />
              <Bracket>{t("chip.lang")}</Bracket>
              <button className={`chip ${!lang ? "chip-fern" : ""}`} onClick={() => setLang(null)}>{t("buy.filter_all")}</button>
              {langs.map((l) => <button key={l} className={`chip ${lang === l ? "chip-fern" : ""}`} onClick={() => setLang(lang === l ? null : l)}>{l}</button>)}
            </div>
          </div>

          <div className={`mt-8 grid gap-10 ${sel && !res ? "grid-cols-[1fr_520px]" : ""}`}>
            <div>
              {filtered.length === 0 ? (
                <div className="rounded-[12px] bg-paper-2 p-8 text-[15px] text-graphite">{t("buy.no_results")}</div>
              ) : (
                <div className={`stagger grid gap-4 ${sel && !res ? "grid-cols-2" : "grid-cols-3"}`}>
                  {filtered.map((c) => (
                    <button key={c.id} onClick={() => pick(c)} className="text-left">
                      <BlindCard card={c} selected={sel?.card.id === c.id} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!res && askPanel}
          </div>
        </Section>
      )}
    </main>
  );
}

// Until the API returns pack_id on cards, derive the mock pack id for the first card and pass through others.
function packIdOf(cardId: string) {
  return cardId === "d0f30000-0000-4000-8000-000000000001" ? "c71a0000-0000-4000-8000-000000000001" : cardId;
}

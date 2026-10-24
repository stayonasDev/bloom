"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Arrow, BlindCard, Bracket, Display, Fit, Lock, Section } from "@/components/ui";
import { api, ApiRejection, fmtS, fmtUSD } from "@/lib/api";
import type { AskResponse, Card, Match, RequestResponse } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { BUYER_SAMPLE } from "@/lib/sample";

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
  const resRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (res) resRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [res]);
  function soon() { setToast(t("buy.soon")); window.setTimeout(() => setToast(null), 2200); }
  const [all, setAll] = useState<Card[]>([]);
  useEffect(() => { api.listCards().then((r) => setAll(r.cards)).catch(() => {}); }, []);

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
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">{t("chip.lang")} EN</span><span className="chip">{t("chip.field")} telecom</span><span className="chip">{t("chip.rarity")}</span><span className="chip">{t("chip.cases")}</span>
              </div>
              <button className="btn btn-ink" onClick={find} disabled={busy || text.trim().length < 20}>{busy ? t("buy.finding") : t("buy.find")} <Arrow /></button>
            </div>
          </div>
        </Section>
      </div>

      {!res && all.length > 0 && (
        <Section className="py-14">
          <div className="flex items-end justify-between"><Bracket>{t("buy.browse")}</Bracket><span className="font-mono text-[12px] text-ash">{all.length}</span></div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {all.map((c) => <BlindCard key={c.id} card={c} />)}
          </div>
        </Section>
      )}

      {res && (
        <Section className="py-14">
          <div ref={resRef} className="flex scroll-mt-24 items-end justify-between">
            <Display size="clamp(64px,9vw,140px)">{t("buy.three")}</Display>
            <Bracket>{t("buy.ranked", { n: res.matches.length, c: res.run.candidate_count, s: fmtS(res.run.duration_ms) })}</Bracket>
          </div>

          <div className="mt-10 grid grid-cols-[1fr_520px] gap-10">
            <div className="flex flex-col">
              {res.matches.map((m) => (
                <button key={m.card.id} onClick={() => { setSel(m); setQa([]); }} className={`grid grid-cols-[110px_1fr] gap-6 border-t py-7 text-left transition-colors ${sel?.card.id === m.card.id ? "border-ink" : "border-rule hover:bg-paper-2/60"}`}>
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

            {sel && (
              <aside className="card sticky top-24 flex flex-col gap-6 self-start p-7">
                <div className="flex items-start justify-between"><div><Bracket>{t("buy.ask_title")}</Bracket><div className="mt-2 text-[20px] font-semibold tracking-tight">{sel.card.field}</div></div><span className="font-mono text-[12px] text-ash">{t("buy.free", { n: Math.max(0, 3 - qa.length) })}</span></div>

                <div className="flex flex-col gap-5">
                  {qa.map((x, i) => (
                    <div key={i}>
                      <Bracket>{t("buy.your_q")}</Bracket>
                      <p className="mt-1 text-[16px] leading-[1.45]">{x.q}</p>
                      <div className="mt-3 rounded-[12px] bg-paper p-5">
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
            )}
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

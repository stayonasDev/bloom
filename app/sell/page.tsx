"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Arrow, BlindCard, Bracket, Display, Lock, Section } from "@/components/ui";
import { api, ApiRejection, fmtS } from "@/lib/api";
import { SEED_QUESTIONS, type InterviewResponse, type SealResponse } from "@/lib/types";
import { LANGS, useT, type Key } from "@/lib/i18n";
import { SELLER_SAMPLE } from "@/lib/sample";

type Step = "write" | "followups" | "sealing" | "sealed";

const ERR_KEY: Record<string, Key> = { TOO_SHORT: "err.too_short", LOG_PASTE_SUSPECTED: "err.log", PII_DETECTED: "err.pii" };

export default function Sell() {
  const { t, lang } = useT();
  const [step, setStep] = useState<Step>("write");
  // 심사위원이 바로 실행할 수 있게 공유 샘플(lib/sample.ts ← mock/sellers/telecom-billing-en.json)을 미리 채운다. 지우고 고칠 수 있는 일반 값.
  const [role, setRole] = useState(SELLER_SAMPLE.role);
  const [years, setYears] = useState(SELLER_SAMPLE.years);
  const [writeIn, setWriteIn] = useState("");
  const [notes, setNotes] = useState(SELLER_SAMPLE.notes);
  const [answers, setAnswers] = useState<Record<string, string>>({ ...SELLER_SAMPLE.answers });
  const [interview, setInterview] = useState<InterviewResponse | null>(null);
  const [followAnswers, setFollowAnswers] = useState<Record<string, string>>({ ...SELLER_SAMPLE.followups });
  const [sealed, setSealed] = useState<SealResponse | null>(null);
  const [error, setError] = useState<ApiRejection | null>(null);
  const [busy, setBusy] = useState(false);

  const langName = writeIn || LANGS.find((l) => l.code === lang)?.name || "English";
  const fuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== "followups") return;
    fuRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    fuRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
  }, [step]);
  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (step === "write" && !busy) askMore(); else if (step === "followups") seal(); }
  }
  const stepNo = step === "write" ? 2 : step === "followups" ? 3 : 4;

  async function askMore() {
    setError(null); setBusy(true);
    try {
      await api.createSeller({ role_title: role, years_experience: Number(years) || 0, language: langName.slice(0, 2).toUpperCase() });
      const r = await api.createInterview({ seed_answers: answers, notes: notes || undefined });
      setInterview(r); setStep("followups");
    } catch (e) {
      setError(e instanceof ApiRejection ? e : new ApiRejection("UNKNOWN", "unknown"));
    } finally { setBusy(false); }
  }

  async function seal() {
    if (!interview) return;
    setError(null); setStep("sealing");
    try {
      const r = await api.sealInterview(interview.id, followAnswers);
      setSealed(r); setStep("sealed");
    } catch (e) {
      setError(e instanceof ApiRejection ? e : new ApiRejection("UNKNOWN", "unknown"));
      setStep("followups");
    }
  }

  const fieldErr = (f: string) => error?.field === f;
  const errText = (e: ApiRejection) => t(ERR_KEY[e.code] ?? "err.unknown");

  if (step === "sealed" && sealed) {
    return (
      <main className="flex-1">
        <Section className="pt-12">
          <div className="progress"><i style={{ width: "100%", animation: "none" }} /></div>
          <div className="mt-3 flex justify-between font-mono text-[13px] text-graphite"><span>{t("sealed.state")}</span><span>{fmtS(sealed.run.duration_ms)}</span></div>
          <div className="mt-12 grid grid-cols-[1fr_480px] items-start gap-16">
            <div>
              <Bracket tone="fern">{t("sealed.kicker")}</Bracket>
              <Display className="mt-4" size="clamp(64px,8vw,120px)">{t("sealed.word")}</Display>
              <p className="mt-6 max-w-[520px] text-[20px] leading-[1.45] text-graphite">{t("sealed.lead")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/packs/${sealed.pack_id}/note`} className="btn">{t("sealed.read")} <Lock /></Link>
                <Link href={`/packs/${sealed.pack_id}/trace`} className="btn">{t("sealed.trace")} <Arrow /></Link>
              </div>
              <dl className="mt-10 grid grid-cols-[180px_1fr] gap-y-2 border-t border-ink pt-6 font-mono text-[13px] text-graphite">
                <dt>{t("sealed.items")}</dt><dd>{t("sealed.items_v", { n: sealed.metrics.item_count, r: sealed.metrics.rare_count })}</dd>
                <dt>{t("sealed.gen")}</dt><dd>{sealed.metrics.generalized_count}</dd>
                <dt>{t("sealed.q")}</dt><dd>{t("sealed.q_v")}</dd>
              </dl>
            </div>
            <div className="sealin card overflow-hidden">
              <div className="sealbar" />
              <div className="flex items-center justify-between border-b border-rule px-6 py-4"><span className="flex items-center gap-2 text-[15px] font-semibold"><Lock /> Handover Note</span><span className="chip chip-fern">{t("card.sealed")} · {sealed.metrics.item_count}</span></div>
              <div className="p-2"><BlindCard card={sealed.card} /></div>
            </div>
          </div>
        </Section>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="grain border-b border-rule">
        <Section className="py-14">
          <Bracket>{t("sell.kicker", { n: step === "write" ? 1 : 2 })}</Bracket>
          <h1 className="display mt-5 text-[clamp(56px,7.5vw,108px)]">{t("sell.h1a")} <em className="italic text-fern">{t("sell.h1em")}</em> {t("sell.h1b")}</h1>
          <p className="mt-4 max-w-[640px] text-[19px] leading-[1.5] text-graphite">{t("sell.lead")}</p>
        </Section>
      </div>

      <Section className="py-14">
        <ol className="steps mb-12">
          {[["01", t("sell.role"), "1 min"], ["02", t("sell.four"), "10 min"], ["03", t("sell.fu_kicker"), "3 min"], ["04", t("sell.seal_btn"), "60 s"]].map(([n, label, time], i) => (
            <li key={n} className={i + 1 < stepNo ? "done" : i + 1 === stepNo ? "now" : ""}><span className="l">{n}</span><span className="t">{label}</span><span className="time">{time}</span></li>
          ))}
        </ol>
        <div className="grid grid-cols-[1fr_320px] gap-16" onKeyDown={onKey}>
          <div className="flex flex-col gap-12">
            <div className="grid grid-cols-[2fr_.6fr_1fr] gap-8">
              <label><span className="bracket">{t("sell.role")}</span><input className="field mt-2" value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("sell.role_ph")} /></label>
              <label><span className="bracket">{t("sell.years")}</span><input className="field mt-2" value={years} onChange={(e) => setYears(e.target.value)} placeholder="5" inputMode="numeric" /></label>
              <label><span className="bracket">{t("sell.lang")}</span><input className="field mt-2" value={langName} onChange={(e) => setWriteIn(e.target.value)} /><span className="mt-2 block text-[13px] text-ash">{t("sell.lang_help")}</span></label>
            </div>

            <label>
              <span className="bracket">{t("sell.notes")}</span>
              <textarea className={`field mt-2 ${fieldErr("notes") ? "field-clay" : ""}`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("sell.notes_ph")} />
              {fieldErr("notes") && error && <Warn>{errText(error)}</Warn>}
              <span className="mt-2 block text-[13px] text-ash">{t("sell.no_logs")}</span>
            </label>

            <div>
              <div className="flex items-end justify-between border-b border-ink pb-3"><span className="font-display text-[36px] leading-none">{t("sell.four")}</span><span className="text-[13px] text-ash">{t("sell.four_hint")}</span></div>
              <div className="mt-2 flex flex-col">
                {SEED_QUESTIONS.map((q, i) => (
                  <label key={q.id} className="border-b border-rule py-7">
                    <span className="flex items-baseline gap-4"><Bracket tone="fern">0{i + 1}</Bracket><span className="text-[20px] font-semibold tracking-tight">{t(q.id as Key)}</span></span>
                    <textarea className={`field mt-3 ${fieldErr(`seed_answers.${q.id}`) ? "field-clay" : ""}`} rows={3} value={answers[q.id]} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} disabled={step !== "write"} />
                    {fieldErr(`seed_answers.${q.id}`) && error && <Warn>{errText(error)}</Warn>}
                  </label>
                ))}
              </div>
            </div>

            {step === "write" && (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ash">{t("sell.ask_hint")} <kbd className="ml-2 rounded border border-rule px-1.5 py-0.5 font-mono text-[11px] text-ash">⌘↵</kbd></span>
                <button className="btn btn-ink" onClick={askMore} disabled={busy}>{busy ? t("sell.ask_busy") : t("sell.ask_btn")} <Arrow /></button>
              </div>
            )}
            {error && !error.field && <Warn>{errText(error)}</Warn>}

            {(step === "followups" || step === "sealing") && interview && (
              <div ref={fuRef} className="paperblock-in scroll-mt-24 rounded-[16px] bg-paper-2 p-8">
                <div className="flex items-center justify-between"><Bracket tone="fern">{t("sell.fu_kicker")}</Bracket><span className="font-mono text-[13px] text-ash">{fmtS(interview.run.duration_ms)}</span></div>
                <div className="mt-6 flex flex-col gap-8">
                  {interview.followup_questions.map((f, i) => (
                    <label key={f.id}>
                      <span className="flex items-baseline gap-4"><Bracket tone="fern">{t("sell.fu_n", { n: i + 1 })}</Bracket></span>
                      <p className="mt-2 text-[19px] leading-[1.45]">{f.question}</p>
                      <textarea className="field mt-3" rows={3} value={followAnswers[f.id] || ""} onChange={(e) => setFollowAnswers({ ...followAnswers, [f.id]: e.target.value })} disabled={step === "sealing"} />
                    </label>
                  ))}
                </div>
                <div className="mt-8 flex items-center justify-between gap-6">
                  {step === "sealing" ? (
                    <div className="flex-1"><div className="progress"><i /></div><div className="mt-2 font-mono text-[13px] text-graphite">{t("sell.sealing")}</div></div>
                  ) : (
                    <>
                      <span className="text-[13px] text-ash">{t("sell.seal_hint")}</span>
                      <button className="btn btn-fern" onClick={seal} disabled={interview.followup_questions.some((f) => !(followAnswers[f.id] || "").trim())}><Lock /> {t("sell.seal_btn")}</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-10 border-l border-rule pl-10 text-[15px] leading-[1.55]">
            <div><Bracket>{t("side.private")}</Bracket><ul className="mt-3 list-disc pl-5 text-graphite marker:text-ash"><li>{t("side.p1")}</li><li>{t("side.p2")}</li><li>{t("side.p3")}</li></ul></div>
            <div><Bracket>{t("side.buyers")}</Bracket><p className="mt-3 text-graphite">{t("side.buyers_d")}</p><dl className="mt-4 grid grid-cols-[100px_1fr] gap-y-1 font-mono text-[13px]"><dt className="text-ash">{t("side.note")}</dt><dd>USD 49–499</dd><dt className="text-ash">{t("side.per_case")}</dt><dd>{t("side.per_case_v")}</dd><dt className="text-ash">{t("side.hiring")}</dt><dd>{t("side.hiring_v")}</dd></dl></div>
            <div><Bracket>{t("side.works")}</Bracket><p className="mt-3 text-graphite">{t("side.works_d")}</p></div>
          </aside>
        </div>
      </Section>
    </main>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-[8px] bg-clay-tint px-4 py-3 text-[14px] leading-[1.5] text-[#6E3A10]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#A85A1E" strokeWidth="1.5" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M8 2.5 14.5 13.5h-13L8 2.5z" /><path d="M8 7v3M8 12v.5" strokeLinecap="round" /></svg>
      <span>{children}</span>
    </div>
  );
}

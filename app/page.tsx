"use client";

import Link from "next/link";
import { Arrow, BlindCard, Bracket, Display, Section } from "@/components/ui";
import { cards } from "@/lib/mock";
import { useT } from "@/lib/i18n";
import { Parallax, Reveal } from "@/components/motion";
import { EffectPanel } from "@/components/EffectPanel";

// demo rows for the live board (data, not UI copy — stays as the backend would return it)
const live = [
  { demand: "Roaming disputes after a plan change", who: "Support software vendor · US · EN · 11:56", fit: "0.91", note: "Telecom billing disputes", meta: "Manila · 5 yrs · 22 items · 9 not in any manual", status: "3 questions asked" },
  { demand: "Refund abuse vs. honest returns", who: "Online retailer · DE · EN, DE · 11:41", fit: "0.84", note: "Returns and chargeback judgment", meta: "Cebu · 4 yrs · 19 items", status: "unlocked · USD 129", fern: true },
  { demand: "Test cases: where support systems fail", who: "Evaluation data company · US · EN · 11:20", fit: "0.78", note: "Telecom retention and cancellations", meta: "Seoul · 7 yrs · 25 items · written in KO", status: "case routing on", fern: true },
  { demand: "Clinic intake: insurance mismatch", who: "Clinic software vendor · JP · JA · 11:03", fit: "0.72", note: "Front-desk triage and billing codes", meta: "Davao · 6 yrs · 17 items · JA copy", status: "2 questions asked" },
];

// cards fanned on an arc, like photographs laid out on a table
const fan = [-24, -16, -8, 0, 8, 16, 24];

export default function Home() {
  const { t } = useT();
  return (
    <main className="flex-1">
      {/* ── hero: title + two doors ── */}
      <div className="grain relative overflow-hidden border-b border-rule">
        <Section className="relative z-10 pt-16 pb-14">
          <Bracket>{t("home.kicker")} · 2026-10-24</Bracket>
          <h1 className="display mt-6 text-[clamp(88px,13.5vw,196px)]">
            Handover<span className="text-fern">.</span>
          </h1>
          <p className="mt-2 max-w-[640px] text-[20px] leading-[1.45] text-graphite">{t("home.lead")}</p>
          <div className="doors mt-10">
            <Reveal className="door">
              <span className="who">{t("door.p.who")}</span>
              <h3>{t("door.p.t")}</h3>
              <p>{t("door.p.d")}</p>
              <ul><li>{t("door.p.l1")}</li><li>{t("door.p.l2")}</li></ul>
              <Link href="/sell" className="btn btn-ink mt-2 self-start">{t("home.cta_write")} <Arrow /></Link>
            </Reveal>
            <Reveal delay={140} className="door door-co grain grain-dark">
              <span className="who">{t("door.c.who")}</span>
              <h3>{t("door.c.t")}</h3>
              <p>{t("door.c.d")}</p>
              <ul><li>{t("door.c.l1")}</li><li>{t("door.c.l2")}</li></ul>
              <Link href="/buy" className="btn btn-sand mt-2 self-start">{t("home.cta_post")} <Arrow /></Link>
            </Reveal>
          </div>
          <div className="mt-12 flex justify-start">
            <a href="#matches" className="grid h-12 w-12 place-items-center rounded-full border border-ink text-ink transition-colors hover:bg-ink hover:text-paper" aria-label="Scroll">
              <Arrow className="rotate-90" />
            </a>
          </div>
        </Section>
      </div>

      {/* ── full-bleed: how sealing works ── */}
      <div className="grain overflow-hidden border-t border-rule">
        <Section className="py-24">
          <div className="flex items-end justify-between">
            <Display>{t("home.sealed")}</Display>
            <Bracket>{t("home.how")}</Bracket>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-12">
            {(["1", "2", "3"] as const).map((n, i) => (
              <Reveal key={n} delay={i * 180} className="border-t border-ink pt-6">
                <Bracket tone="fern">0{n}</Bracket>
                <div className="mt-4 font-display text-[40px] leading-none">{t(`how.${n}.t`)}</div>
                <p className="mt-4 text-[16px] leading-[1.6] text-graphite">{t(`how.${n}.d`)}</p>
              </Reveal>
            ))}
          </div>
        </Section>
        <div className="arc-stage relative h-[520px]">
        <Parallax className="arc-bg" strength={14}>
          <div className="arc stagger-slow">
            {cards.slice(0, 7).map((c, i) => (
              <div key={c.id} style={{ transform: `translateX(-50%) rotate(${fan[i]}deg)`, zIndex: 10 - Math.abs(fan[i]) }}>
                <BlindCard card={c} href="/buy" />
              </div>
            ))}
          </div>
        </Parallax>
        </div>
        <div className="h-8" />
      </div>

      {/* ── live matches ── */}
      <div className="grain grain-dark bg-earth text-sand">
      <Section className="py-24">
        <div id="matches" className="flex items-end justify-between">
          <Display sand>{t("home.matches")}</Display>
          <Bracket tone="sand">{t("home.fit_kicker")}</Bracket>
        </div>
        <table className="ledger ledger-dark mt-10">
          <thead>
            <tr><th style={{ width: "36%" }}>{t("th.demand")}</th><th style={{ width: "12%" }}>{t("th.fit")}</th><th style={{ width: "36%" }}>{t("th.note")}</th><th>{t("th.status")}</th></tr>
          </thead>
          <tbody>
            {live.map((r, i) => (
              <Reveal as="tr" key={r.demand} delay={i * 140}>
                <td><div className="text-[17px] font-semibold text-white">{r.demand}</div><div className="mt-1 text-[13px] text-sand/60">{r.who}</div></td>
                <td><span className="font-mono text-[22px] text-white">{r.fit}</span></td>
                <td><div className="text-[17px] font-semibold text-white">{r.note}</div><div className="mt-1 text-[13px] text-sand/60">{r.meta}</div></td>
                <td><span className={`font-mono text-[13px] ${r.fern ? "text-[#9FE1C8]" : "text-sand/80"}`}>{r.status}</span></td>
              </Reveal>
            ))}
          </tbody>
        </table>
      </Section>
      </div>

      {/* ── three ways + how the price works · effect ── */}
      <Section className="py-24">
        <div className="grid grid-cols-[1fr_1.1fr] gap-16">
          <div>
            <Bracket>{t("earn.kicker")}</Bracket>
            <ol className="mt-6 border-t border-ink">
              {(["1", "2", "3"] as const).map((n) => (
                <li key={n} className="grid grid-cols-[64px_1fr_auto] items-center gap-5 border-b border-rule py-5">
                  <Bracket>0{n}</Bracket>
                  <div><div className="text-[20px] font-semibold tracking-tight">{t(`earn.${n}.t`)}</div><div className="text-[14px] text-graphite">{t(`earn.${n}.d`)}</div></div>
                  <span className="font-mono text-[13px] text-graphite">{t(`earn.${n}.r`)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-10">
              <Bracket>{t("price.kicker")}</Bracket>
              <ul className="mt-5 flex flex-col gap-4 border-t border-rule pt-5 text-[15px] leading-[1.55] text-graphite">
                <li className="grid grid-cols-[64px_1fr] gap-5"><span className="bracket">{t("price.l_pack")}</span><span>{t("price.pack")}</span></li>
                <li className="grid grid-cols-[64px_1fr] gap-5"><span className="bracket">{t("card.per_case")}</span><span>{t("price.case")}</span></li>
                <li className="grid grid-cols-[64px_1fr] gap-5"><span className="bracket">{t("earn.3.t")}</span><span>{t("price.hire")}</span></li>
                <li className="grid grid-cols-[64px_1fr] gap-5"><span className="bracket">$</span><span>{t("price.pay")}</span></li>
              </ul>
              <div className="mt-5 rounded-[10px] bg-paper-2 px-4 py-3 font-mono text-[13px] text-ink">{t("price.example")}</div>
            </div>
          </div>
          <EffectPanel />
        </div>
      </Section>

      <footer className="border-t border-rule">
        <Section className="flex items-center justify-between py-8 text-[13px] text-ash">
          <span className="font-display text-[20px] text-ink">Handover</span>
          <span>{t("footer.langs")}</span>
        </Section>
      </footer>
    </main>
  );
}

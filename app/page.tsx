"use client";

import Link from "next/link";
import { Arrow, BlindCard, Bracket, Display, Section, Stat } from "@/components/ui";
import { cards } from "@/lib/mock";
import { useT } from "@/lib/i18n";

// demo rows for the live board (data, not UI copy — stays as the backend would return it)
const live = [
  { demand: "Roaming disputes after a plan change", who: "Support software vendor · US · EN · 11:56", fit: "0.91", note: "Telecom billing disputes", meta: "Manila · 5 yrs · 22 items · 9 not in any manual", status: "3 questions asked" },
  { demand: "Refund abuse vs. honest returns", who: "Online retailer · DE · EN, DE · 11:41", fit: "0.84", note: "Returns and chargeback judgment", meta: "Cebu · 4 yrs · 19 items", status: "unlocked · USD 129", fern: true },
  { demand: "Test cases: where support systems fail", who: "Evaluation data company · US · EN · 11:20", fit: "0.78", note: "Telecom retention and cancellations", meta: "Seoul · 7 yrs · 25 items · written in KO", status: "case routing on", fern: true },
  { demand: "Clinic intake: insurance mismatch", who: "Clinic software vendor · JP · JA · 11:03", fit: "0.72", note: "Front-desk triage and billing codes", meta: "Davao · 6 yrs · 17 items · JA copy", status: "2 questions asked" },
];

// cards fanned on an arc, like photographs laid out on a table
const fan = [-15, -10, -5, 0, 5, 10, 15];

export default function Home() {
  const { t } = useT();
  return (
    <main className="flex-1">
      {/* ── hero ── */}
      <div className="grain overflow-hidden border-b border-rule">
        <Section className="pt-16">
          <Bracket>{t("home.kicker")} · 2026-10-24</Bracket>
          <h1 className="display mt-6 text-[clamp(88px,13.5vw,196px)]">
            Handover<span className="text-fern">.</span>
          </h1>
          <p className="mt-2 max-w-[640px] text-[20px] leading-[1.45] text-graphite">{t("home.lead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sell" className="btn btn-ink">{t("home.cta_write")} <Arrow /></Link>
            <Link href="/buy" className="btn">{t("home.cta_post")}</Link>
          </div>
        </Section>

        <div className="arc mx-auto -mt-8 max-w-[1240px]">
          {cards.slice(0, 7).map((c, i) => (
            <div key={c.id} style={{ transform: `translateX(-50%) rotate(${fan[i]}deg)`, zIndex: 10 - Math.abs(fan[i]) }}>
              <BlindCard card={c} compact href="/buy" />
            </div>
          ))}
        </div>
        <div className="flex justify-center pb-10 pt-4">
          <a href="#matches" className="grid h-12 w-12 place-items-center rounded-full border border-ink text-ink transition-colors hover:bg-ink hover:text-paper" aria-label="Scroll">
            <Arrow className="rotate-90" />
          </a>
        </div>
      </div>

      {/* ── live matches ── */}
      <Section className="pt-20">
        <div id="matches" className="flex items-end justify-between">
          <Display>{t("home.matches")}</Display>
          <Bracket>{t("home.fit_kicker")}</Bracket>
        </div>
        <table className="ledger mt-10">
          <thead>
            <tr><th style={{ width: "36%" }}>{t("th.demand")}</th><th style={{ width: "12%" }}>{t("th.fit")}</th><th style={{ width: "36%" }}>{t("th.note")}</th><th>{t("th.status")}</th></tr>
          </thead>
          <tbody>
            {live.map((r) => (
              <tr key={r.demand}>
                <td><div className="text-[17px] font-semibold">{r.demand}</div><div className="mt-1 text-[13px] text-ash">{r.who}</div></td>
                <td><span className="font-mono text-[22px]">{r.fit}</span></td>
                <td><div className="text-[17px] font-semibold">{r.note}</div><div className="mt-1 text-[13px] text-ash">{r.meta}</div></td>
                <td><span className={`font-mono text-[13px] ${r.fern ? "text-fern" : "text-graphite"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── full-bleed: how sealing works ── */}
      <div className="grain grain-dark mt-24 bg-earth text-sand">
        <Section className="py-24">
          <div className="flex items-end justify-between">
            <Display sand>{t("home.sealed")}</Display>
            <Bracket tone="sand">{t("home.how")}</Bracket>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-12">
            {(["1", "2", "3"] as const).map((n) => (
              <div key={n} className="border-t border-earth-2 pt-6">
                <Bracket tone="sand">0{n}</Bracket>
                <div className="mt-4 font-display text-[40px] leading-none">{t(`how.${n}.t`)}</div>
                <p className="mt-4 text-[16px] leading-[1.6] text-sand/80">{t(`how.${n}.d`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-20 flex items-center justify-center">
            <div className="card w-[560px] p-8 text-ink">
              <div className="flex items-center justify-between"><Bracket>Handover Note · HN-2026-10-24-0417</Bracket><span className="chip chip-fern">{t("card.sealed")} · 22</span></div>
              <div className="font-display mt-6 text-[44px] leading-none">Telecom billing disputes</div>
              <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-[13px] text-graphite">
                <span>EN · Filipino</span><span>5 {t("card.yrs")}</span>
                <span>{t("card.difficulty")} 4 / 5</span><span>{t("card.rarity")} 4 / 5 · 9 / 22</span>
                <span>USD 149 · USD 15 {t("card.per_case")}</span><span>2026-10-24 11:42</span>
              </div>
              <Link href="/buy" className="btn btn-sm mt-8">{t("home.ask_btn")} <Arrow /></Link>
            </div>
          </div>
        </Section>
      </div>

      {/* ── three ways + stats ── */}
      <Section className="py-24">
        <div className="grid grid-cols-[1fr_1.2fr] gap-16">
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
          </div>
          <div>
            <Bracket>{t("num.kicker")}</Bracket>
            <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-12 border-t border-ink pt-8">
              <Stat v="1,284" k={t("num.sealed")} />
              <Stat v="312" k={t("num.open")} />
              <Stat v="58s" k={t("num.median")} />
              <Stat v="12" k={t("num.langs")} />
            </div>
          </div>
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

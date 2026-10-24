"use client";

// "How much changes": today vs. Handover for the same person, plus a slider that shows
// monthly income from routed cases. Formula follows docs/API.md: USD 15 per case (rarity 4), author keeps 70%.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { CountUp, Reveal } from "@/components/motion";
import { Arrow, Bracket } from "@/components/ui";

const PER_CASE = 15;
const SHARE = 0.7;

export function EffectPanel() {
  const { t } = useT();
  const [n, setN] = useState(20);
  const income = Math.round(n * PER_CASE * SHARE);

  const rows: { before: string; after: React.ReactNode }[] = [
    { before: t("effect.b1"), after: <><CountUp value={1} /> {t("effect.a1")}</> },
    { before: t("effect.b2"), after: <><CountUp value={3} /> {t("effect.a2")}</> },
    { before: t("effect.b3"), after: <><CountUp value={60} ms={1800} />s {t("effect.a3")}</> },
  ];

  return (
    <div>
      <Bracket>{t("effect.kicker")}</Bracket>
      <div className="mt-6 border-t border-ink pt-8">
        <div className="font-display text-[40px] leading-none tracking-tight">{t("effect.title")}</div>

        <div className="mt-8 grid grid-cols-[1fr_40px_1.2fr] items-center gap-x-5 gap-y-6">
          <span className="bracket">{t("effect.before")}</span><span /><span className="bracket bracket-fern">{t("effect.after")}</span>
          {rows.map((r, i) => (
            <Reveal key={i} delay={i * 160} className="contents">
              <span className="text-[18px] text-graphite line-through decoration-rule">{r.before}</span>
              <Arrow className="text-ash" />
              <span className="font-mono text-[22px] font-medium text-ink">{r.after}</span>
            </Reveal>
          ))}
        </div>

        <Reveal delay={400} className="grain grain-dark mt-10 rounded-[16px] bg-earth p-7 text-sand">
          <div className="flex items-baseline justify-between gap-4">
            <span className="bracket bracket-sand">{t("effect.slider")}</span>
            <span className="font-mono text-[15px]">{t("effect.cases", { n })}</span>
          </div>
          <input type="range" min={0} max={60} step={1} value={n} onChange={(e) => setN(Number(e.target.value))} className="range mt-5 w-full" aria-label={t("effect.slider")} />
          <div className="mt-7 flex items-end justify-between gap-6">
            <div>
              <span className="bracket bracket-sand">{t("effect.income")}</span>
              <div className="mt-2 font-mono text-[64px] leading-none tracking-tight text-white transition-all duration-500">USD {income.toLocaleString("en-US")}</div>
            </div>
            <span className="font-mono text-[13px] text-sand/70">{t("effect.formula", { n })}</span>
          </div>
          <p className="mt-5 text-[13px] leading-[1.5] text-sand/70">{t("effect.note")}</p>
        </Reveal>
      </div>
    </div>
  );
}

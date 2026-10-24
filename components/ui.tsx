"use client";

import Link from "next/link";
import type { Card } from "@/lib/types";
import { fmtDate, fmtUSD } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { CountUp } from "@/components/motion";

export function Bracket({ children, tone }: { children: React.ReactNode; tone?: "fern" | "sand" }) {
  return <span className={`bracket ${tone === "fern" ? "bracket-fern" : ""} ${tone === "sand" ? "bracket-sand" : ""}`}>{children}</span>;
}

/** Poster-size editorial word. Fades left→right like a magazine spread. */
export function Display({ children, size = "clamp(96px, 14vw, 180px)", fade = true, sand = false, className = "" }: { children: React.ReactNode; size?: string; fade?: boolean; sand?: boolean; className?: string }) {
  const cls = fade ? (sand ? "display-fade-sand" : "display-fade") : "";
  return <div className={`display ${cls} ${className}`} style={{ fontSize: size }}>{children}</div>;
}

export function Stat({ v, k }: { v: React.ReactNode; k: string }) {
  return (
    <div>
      <div className="font-mono text-[40px] leading-none tracking-tight">{v}</div>
      <div className="mt-3 max-w-[220px] text-[13px] text-graphite">{k}</div>
    </div>
  );
}

export function Fit({ score }: { score: number }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <CountUp className="font-mono text-[22px] tracking-tight" value={score} ms={1600} format={(n) => n.toFixed(2)} />
      <span className="font-mono text-[12px] text-ash">fit</span>
    </span>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function Lock({ open = false, className = "" }: { open?: boolean; className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d={open ? "M5.5 7V5a2.5 2.5 0 0 1 5 0" : "M5.5 7V5a2.5 2.5 0 0 1 5 0v2"} strokeLinecap="round" />
    </svg>
  );
}

/** The blind card: everything a buyer sees before paying. */
export function BlindCard({ card, compact = false, selected = false, href }: { card: Card; compact?: boolean; selected?: boolean; href?: string }) {
  const { t } = useT();
  const body = (
    <div className={`card ${selected ? "card-sel" : ""} ${compact ? "p-4" : "p-6"} flex h-full flex-col gap-3 text-ink`}>
      <div className="flex items-center justify-between gap-2">
        <Bracket>{card.language} · {card.years_experience} {t("card.yrs")}</Bracket>
        <span className="chip chip-fern"><Lock /> {compact ? card.item_count : `${t("card.sealed")} · ${card.item_count}`}</span>
      </div>
      <div className={`font-display leading-[1.05] tracking-tight text-ink ${compact ? "text-[22px]" : "text-[30px]"}`}>{card.field}</div>
      {!compact && <p className="text-[14px] text-graphite">{card.one_liner}</p>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-2 font-mono text-[12px] text-graphite">
        <span>{t("card.difficulty")} {card.difficulty}/5 · {t("card.rarity")} {card.rarity}/5{!compact && <><br />{t("card.listed")} {fmtDate(card.listed_at)}</>}</span>
        <span className="text-right text-ink">{fmtUSD(card.price_pack_usd)}{!compact && <><br /><span className="text-graphite">{fmtUSD(card.price_case_usd)} {t("card.per_case")}</span></>}</span>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-[1240px] px-6 ${className}`}>{children}</section>;
}

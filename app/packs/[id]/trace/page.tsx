"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Arrow, Bracket, Section } from "@/components/ui";
import { api, fmtS } from "@/lib/api";
import type { TraceResponse } from "@/lib/types";
import { useT } from "@/lib/i18n";

function Line({ n, label, v, time, sub }: { n: string; label: React.ReactNode; v: React.ReactNode; time: string; sub?: React.ReactNode }) {
  return (
    <div className="border-b border-rule py-5">
      <div className="grid grid-cols-[40px_1fr_auto_72px] items-baseline gap-4">
        <span className="font-mono text-[12px] text-ash">{n}</span>
        <span className="text-[16px]">{label}</span>
        <span className="font-mono text-[16px]">{v}</span>
        <span className="text-right font-mono text-[12px] text-ash">{time}</span>
      </div>
      {sub && <div className="mt-3 pl-[56px]">{sub}</div>}
    </div>
  );
}

export default function TracePage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const [tr, setTr] = useState<TraceResponse | null>(null);
  useEffect(() => { api.getTrace(id).then(setTr); }, [id]);
  if (!tr) return <Section className="py-24"><div className="progress"><i style={{ animationDuration: "2s" }} /></div></Section>;

  const rarePct = Math.round((tr.extract.rare_count / Math.max(1, tr.extract.item_count)) * 100);
  return (
    <main className="flex-1">
      <Section className="py-14">
        <div className="mx-auto max-w-[680px]">
          <Bracket>{t("trace.kicker")} · {tr.model}</Bracket>
          <h1 className="font-display mt-4 text-[56px] leading-[.98] tracking-tight">{t("trace.h1")}</h1>
          <p className="mt-4 text-[17px] text-graphite">{t("trace.lead")}</p>

          <div className="card mt-10 px-10 py-6">
            <Line n="01" label={t("trace.l1")} v={tr.followup.question_count} time={fmtS(tr.followup.duration_ms)} />
            <Line n="02" label={t("trace.l2")} v={tr.extract.item_count} time={fmtS(tr.extract.duration_ms)}
              sub={<><div className="flex h-[6px] overflow-hidden rounded-[2px] bg-paper-2"><i className="block bg-fern" style={{ width: `${rarePct}%` }} /></div><div className="mt-2 font-mono text-[12px] text-graphite">{t("trace.split", { r: tr.extract.rare_count, m: tr.extract.manual_count })}</div></>} />
            <Line n="03" label={t("trace.l3")} v={tr.extract.generalized_count} time="—"
              sub={<div className="font-mono text-[12px] text-graphite">{tr.extract.generalization_log.map((g) => `${g.type} ×${g.count} → ${g.replaced_with}`).join(" · ")}</div>} />
            <Line n="04" label={t("trace.l4")} v={tr.last_match ? t("trace.rank", { k: tr.last_match.rank, s: tr.last_match.score.toFixed(2) }) : "—"} time={tr.last_match ? fmtS(tr.last_match.duration_ms) : "—"} />
            <Line n="05" label={t("trace.l5")} v={tr.sealed_qa.count} time={tr.sealed_qa.count ? `${fmtS(tr.sealed_qa.avg_duration_ms)} ${t("trace.avg")}` : "—"} />
            <div className="flex items-baseline justify-between pt-6"><span className="text-graphite">{t("trace.total")}</span><span className="font-mono text-[48px] leading-none tracking-tight">{Math.round(tr.total_ms / 1000)}s</span></div>
            <p className="mt-6 font-mono text-[12px] leading-[1.7] text-ash">{t("trace.worker", { m: tr.model })}</p>
          </div>

          <div className="mt-8 flex gap-3"><Link href={`/packs/${id}/note`} className="btn btn-sm">{t("trace.read")} <Arrow /></Link><Link href="/" className="btn btn-sm">{t("trace.board")}</Link></div>
        </div>
      </Section>
    </main>
  );
}

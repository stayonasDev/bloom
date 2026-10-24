"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Arrow, Bracket, Lock, Section } from "@/components/ui";
import { api, fmtUSD } from "@/lib/api";
import type { NoteResponse, NoteItem } from "@/lib/types";
import { useT, type Key } from "@/lib/i18n";

const SECTIONS: { key: keyof NoteResponse["handover_note"]; k: Key }[] = [
  { key: "rules", k: "note.rules" },
  { key: "exceptions", k: "note.exceptions" },
  { key: "judgment_calls", k: "note.judgment_calls" },
  { key: "common_mistakes", k: "note.common_mistakes" },
  { key: "never_do", k: "note.never_do" },
];

export default function NotePage() {
  const { t, lang } = useT();
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.getNote(id, lang).then(setNote).catch((e) => setErr(e.message)); }, [id, lang]);

  if (err) return <Section className="py-24"><Bracket>{t("note.locked")}</Bracket><p className="mt-4 text-[20px]">{err}</p><Link href="/buy" className="btn mt-8">{t("note.back")}</Link></Section>;
  if (!note) return <Section className="py-24"><div className="progress"><i style={{ animationDuration: "2s" }} /></div><div className="mt-2 font-mono text-[13px] text-graphite">{t("note.opening")}</div></Section>;

  const n = note.handover_note;
  const ref = "HN-2026-10-24-0417";

  return (
    <main className="flex-1">
      <Section className="py-12">
        <div className="grid grid-cols-[240px_1fr] gap-12">
          {/* chapters, like a report */}
          <aside className="sticky top-24 self-start">
            <Link href="/buy" className="mb-6 block text-[14px] text-graphite hover:text-ink">← {t("note.back")}</Link>
            <Bracket>{t("note.contents")}</Bracket>
            <ol className="mt-4 border-t border-ink">
              {SECTIONS.map((s) => (
                <li key={s.key} className="flex justify-between border-b border-rule py-3 text-[15px] text-graphite"><a href={`#${s.key}`} className="hover:text-ink">{t(s.k)}</a><span className="font-mono text-[13px] text-ash">{n[s.key].length}</span></li>
              ))}
            </ol>
            <dl className="mt-6 grid grid-cols-[84px_1fr] gap-y-2 text-[14px]">
              <dt className="text-ash">{t("note.licence")}</dt><dd>{t("note.licence_v")}</dd>
              <dt className="text-ash">{t("note.paid")}</dt><dd className="font-mono text-[13px]">{fmtUSD(149)}</dd>
              <dt className="text-ash">{t("note.copy")}</dt><dd>EN · <span className="text-fern">日本語</span></dd>
            </dl>
            <p className="mt-6 text-[13px] text-ash">{t("note.rare_hint")} <span className="font-mono text-fern">{t("note.rare")}</span> {t("note.rare_hint2")}</p>
            <Link href={`/packs/${id}/trace`} className="btn btn-sm mt-8">{t("note.trace")} <Arrow /></Link>
          </aside>

          {/* the document — content stays in the language it was written in (English) */}
          <article className="card px-14 py-12">
            <div className="flex justify-between font-mono text-[12px] uppercase tracking-[.12em] text-ash"><span>Handover Note</span><span>{ref}</span></div>
            <h1 className="font-display mt-5 text-[64px] leading-[.95] tracking-tight">Telecom billing disputes</h1>
            <p className="mt-5 font-mono text-[13px] leading-[1.7] text-graphite">
              {t("note.meta", { y: 5, n: note.metrics.item_count, r: note.metrics.rare_count })}<br />
              {note.generalization_log.map((g) => `${g.type} ×${g.count} → ${g.replaced_with}`).join(" · ")} · {t("note.author")}
            </p>
            <div className="mt-4 flex items-center gap-2 text-[13px] text-fern"><Lock open /> {t("note.unlocked")}</div>

            {SECTIONS.map((s) => (
              <section key={s.key} id={s.key} className="mt-12">
                <h2 className="flex items-baseline justify-between border-b border-rule pb-3"><span className="font-display text-[32px] leading-none">{t(s.k)}</span><span className="font-mono text-[12px] text-ash">{t("note.items", { n: n[s.key].length })}</span></h2>
                <ol className="doc-serif mt-5 list-decimal flex flex-col gap-4 pl-8">
                  {n[s.key].map((it: NoteItem) => (
                    <li key={it.id}>{it.text}{it.kind === "rare" && <span className="ml-2 whitespace-nowrap font-mono text-[12px] text-fern">{t("note.rare")}</span>}</li>
                  ))}
                </ol>
              </section>
            ))}

            <div className="grain grain-dark mt-16 flex items-center justify-between gap-8 rounded-[16px] bg-earth p-8 text-sand">
              <div><div className="font-display text-[32px] leading-none">{t("note.route_t")}</div><p className="mt-3 text-[15px] text-sand/80">{t("note.route_d")}</p></div>
              <button className="btn btn-sand shrink-0" disabled>{t("note.route_btn")}</button>
            </div>
          </article>
        </div>
      </Section>
    </main>
  );
}

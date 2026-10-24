"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANGS, useT, type Lang } from "@/lib/i18n";

export function Header() {
  const path = usePathname();
  const { t, lang, setLang } = useT();
  const links = [
    { href: "/", label: t("nav.matches") },
    { href: "/sell", label: t("nav.write") },
    { href: "/buy", label: t("nav.post") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-rule/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="block h-[10px] w-[26px] bg-ink" aria-hidden />
          <span className="font-display text-[26px] leading-none tracking-tight">Handover</span>
        </Link>
        <nav className="flex items-center gap-7 text-[15px] font-medium text-graphite">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`pb-0.5 transition-colors hover:text-ink ${path === l.href ? "border-b border-ink text-ink" : ""}`}>
              {l.label}
            </Link>
          ))}
          <label className="bracket flex cursor-pointer items-center gap-1" title={t("nav.lang")}>
            <select aria-label={t("nav.lang")} value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="cursor-pointer appearance-none bg-transparent font-mono text-[12px] uppercase tracking-[.14em] text-graphite outline-none">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <span aria-hidden>▾</span>
          </label>
        </nav>
      </div>
    </header>
  );
}

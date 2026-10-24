"use client";

// Small, physical motion. 220–320 ms ease-out, nothing bounces. Honors prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";

/** Fades/rises children in when they scroll into view. `delay` in ms staggers siblings. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" | "tr" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.classList.add("in"); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: "200% 0px -8% 0px", threshold: 0.05 } /* anything already scrolled past counts as seen */);
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = Tag as any;
  return <T ref={ref} className={`reveal ${on ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</T>;
}

/** Counts from 0 to `value` over `ms`, ease-out. Measured, not marketed. */
export function CountUp({ value, ms = 1400, format = (n: number) => String(Math.round(n)), className = "" }: { value: number; ms?: number; format?: (n: number) => string; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: jump straight to the final value
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - p, 3);
      setN(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className={className}>{format(n)}</span>;
}

/** Hero arc: cards drift a few px with the cursor (Driftime-style), straighten on hover via CSS. */
export function Parallax({ children, className = "", strength = 10 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2; // -1..1
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty("--px", `${(x * strength).toFixed(1)}px`);
    el.style.setProperty("--py", `${(y * strength * 0.5).toFixed(1)}px`);
  }
  function onLeave() { const el = ref.current; if (!el) return; el.style.setProperty("--px", "0px"); el.style.setProperty("--py", "0px"); }
  return <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`parallax ${className}`}>{children}</div>;
}

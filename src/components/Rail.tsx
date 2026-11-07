"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { STAGES } from "@/lib/stages";

/** The flywheel: four stages on a ring. The active stage is filled; the ring turns when you move. */
export function Ring({ active, size = 132 }: { active: number; size?: number }) {
  const c = size / 2, r = size / 2 - 14;
  const pos = (i: number) => {
    const a = (-90 + i * 90) * (Math.PI / 180);
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Flywheel, stage ${active + 1} of 4`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={6} />
      <g key={active} className="ring-turn">
        <circle
          cx={c} cy={c} r={r} fill="none" stroke="var(--color-money)" strokeWidth={6} strokeLinecap="round"
          strokeDasharray={`${(2 * Math.PI * r * (active + 1)) / 4} ${2 * Math.PI * r}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </g>
      {STAGES.map((s, i) => {
        const p = pos(i);
        const on = i === active, done = i < active;
        return (
          <g key={s.href}>
            <circle cx={p.x} cy={p.y} r={11} fill={on ? "var(--color-money)" : done ? "#cfe9df" : "var(--color-surface)"} stroke={on || done ? "var(--color-money)" : "var(--color-line)"} strokeWidth={2} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight={600} fill={on ? "#fff" : "var(--color-ink)"}>{s.n}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Rail() {
  const path = usePathname();
  const active = Math.max(0, STAGES.findIndex((s) => path.startsWith(s.href)));
  const onStage = STAGES.some((s) => path.startsWith(s.href));
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-5 py-6 md:flex">
      <Link href="/" className="block">
        <div className="font-display text-xl font-extrabold tracking-tight">Flywheel</div>
        <div className="text-xs text-ink-3">for Adapty · Lumen – AI Photo Editor</div>
      </Link>
      <div className="mt-6 flex justify-center text-ink">
        <Link href="/" aria-label="Back to the loop overview">
          <Ring active={onStage ? active : -1} />
        </Link>
      </div>
      <nav className="mt-6 flex flex-col gap-1" aria-label="Stages">
        {STAGES.map((s) => {
          const on = path.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={clsx(
                "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                on ? "bg-ink text-white" : "hover:bg-canvas",
              )}
            >
              <span className={clsx("mt-0.5 font-display text-sm font-bold", on ? "text-white/70" : "text-ink-3")}>{s.n}</span>
              <span>
                <span className="block text-sm font-semibold">{s.name}</span>
                <span className={clsx("block text-xs", on ? "text-white/70" : "text-ink-3")}>{s.job}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto text-xs leading-relaxed text-ink-3">
        Data: Adapty&apos;s synthetic Lumen app, 50,000 users. No real user data.
      </div>
    </aside>
  );
}

/** Small top bar for phones, where the rail is hidden. */
export function MobileStages() {
  const path = usePathname();
  return (
    <nav className="-mx-5 mb-5 flex gap-1 overflow-x-auto border-b border-line px-5 pb-3 md:hidden" aria-label="Stages">
      {STAGES.map((s) => (
        <Link key={s.href} href={s.href} className={clsx("shrink-0 rounded-full px-3 py-1.5 text-sm", path.startsWith(s.href) ? "bg-ink text-white" : "bg-surface")}>
          {s.n} {s.name}
        </Link>
      ))}
    </nav>
  );
}

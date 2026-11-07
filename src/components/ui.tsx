import clsx from "clsx";
import { MobileStages } from "./Rail";
import { STAGES } from "@/lib/stages";

export function PageHead({ stage, title, lede, right }: { stage?: number; title: string; lede: string; right?: React.ReactNode }) {
  return (
    <header className="mb-8">
      <MobileStages />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {stage ? <div className="mb-1 text-sm text-ink-3">Stage {stage} of {STAGES.length}</div> : null}
          <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
          <p className="mt-2 text-base leading-relaxed text-ink-2">{lede}</p>
        </div>
        {right}
      </div>
    </header>
  );
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={clsx("rounded-xl border border-line bg-surface p-5", className)}>{children}</section>;
}

export function Button({
  children, onClick, kind = "primary", disabled, className, type = "button", title,
}: {
  children: React.ReactNode; onClick?: () => void; kind?: "primary" | "quiet" | "money"; disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        kind === "primary" && "bg-ink text-white hover:bg-ink/90",
        kind === "money" && "bg-money text-white hover:bg-money/90",
        kind === "quiet" && "border border-line bg-surface text-ink hover:bg-canvas",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "money" | "warn" | "loss" | "lumen"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-canvas text-ink-2",
        tone === "money" && "bg-money-soft text-money",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "loss" && "bg-loss-soft text-loss",
        tone === "lumen" && "bg-lumen-soft text-lumen",
      )}
    >
      {children}
    </span>
  );
}

export const usd = (n: number, d = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d, minimumFractionDigits: d });

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}

"use client";
import type { Localized } from "@/lib/schemas";

/**
 * A faithful preview of the Lumen "Main - 3 plans" paywall with the campaign's copy.
 * The real thing is the draft flow Flywheel writes into Adapty; this is for switching languages instantly.
 * Prices are illustrative store prices; in the app they come from the store per locale.
 */
export function PaywallPreview({ pw, htmlLang }: { pw: Localized["paywall"]; htmlLang: string }) {
  const plans = [
    { label: pw.plans.annual, sub: `$49.99${pw.plans.annualSuffix}` },
    { label: pw.plans.monthly, sub: `$9.99${pw.plans.monthlySuffix}` },
    { label: pw.plans.weekly, sub: `${pw.plans.trialPrefix}$4.99${pw.plans.perWeek}` },
  ];
  return (
    <div lang={htmlLang} className="mx-auto w-[300px] rounded-[44px] border-[10px] border-[#1b1b22] bg-white shadow-[0_24px_60px_-20px_rgba(22,33,58,.45)]" style={{ fontFamily: "var(--font-banner)" }}>
      <div className="flex h-[600px] flex-col overflow-hidden rounded-[34px] px-5 pb-5 pt-9 text-[#14121C]">
        <div className="text-[24px] font-black leading-tight tracking-tight">{pw.headline}</div>
        <div className="mt-1.5 text-[13px] leading-snug text-[#7D7990]">{pw.subtitle}</div>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">
          {pw.features.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[12px] leading-tight text-[#3D3950]">
              <span className="mt-[3px] inline-block size-2.5 shrink-0 rounded-full bg-[#6C4CF5]" />
              {f}
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-2">
          {plans.map((p, i) => (
            <div key={i} className={`rounded-2xl border-2 px-4 py-2.5 ${i === 2 ? "border-[#6C4CF5] bg-[#F4F3F8]" : "border-[#E4E2EC]"}`}>
              <div className="text-[14px] font-bold">{p.label}</div>
              <div className="mt-0.5 text-[12px] text-[#7D7990]">{p.sub}</div>
            </div>
          ))}
          <div className="mt-3 rounded-full bg-[#6C4CF5] py-3 text-center text-[15px] font-bold text-white">{pw.cta}</div>
          <div className="flex justify-center gap-4 pt-1 text-[11px] text-[#A9A5B8]">
            <span>{pw.terms}</span>
            <span>{pw.privacy}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

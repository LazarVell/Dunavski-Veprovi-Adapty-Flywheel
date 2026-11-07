"use client";
import { useLayoutEffect, useRef, useState } from "react";

export const FORMATS = {
  story: { w: 1080, h: 1920, label: "Story / Reels / TikTok", ratio: "9:16", visual: "portrait" as const },
  portrait: { w: 1080, h: 1350, label: "Feed portrait", ratio: "4:5", visual: "portrait" as const },
  feed: { w: 1080, h: 1080, label: "Feed square", ratio: "1:1", visual: "square" as const },
};
export type FormatKey = keyof typeof FORMATS;

export type BannerProps = {
  format: FormatKey;
  headline: string;
  subline: string;
  cta: string;
  htmlLang: string;
  visualUrl?: string | null;
  conceptIndex?: number;
  onFit?: (fit: { shrunk: boolean; overflow: boolean }) => void;
};

/**
 * A banner at its real pixel size. Text is HTML on top of a text-free visual, so every language is exact.
 * Headline and subline shrink until they fit their box; if they still do not fit, the banner reports overflow.
 */
export function Banner({ format, headline, subline, cta, htmlLang, visualUrl, conceptIndex = 0, onFit }: BannerProps) {
  const f = FORMATS[format];
  const base = format === "story" ? { h: 104, s: 46 } : format === "portrait" ? { h: 92, s: 40 } : { h: 84, s: 36 };
  const [scale, setScale] = useState(1);
  const textRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setScale(1);
  }, [headline, subline, format]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const fits = el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    if (!fits && scale > 0.62) {
      setScale((s) => Math.round((s - 0.04) * 100) / 100);
      return;
    }
    onFit?.({ shrunk: scale < 1, overflow: !fits });
  }, [scale, headline, subline, format, onFit]);

  const gradients = [
    "radial-gradient(120% 80% at 30% 20%, #8f78ff 0%, #6c4cf5 45%, #2a1a7a 100%)",
    "radial-gradient(120% 80% at 70% 30%, #ffd2a8 0%, #f08a5d 45%, #6c4cf5 100%)",
    "radial-gradient(120% 80% at 50% 10%, #b6f0ff 0%, #4fa3d1 45%, #1d2b64 100%)",
  ];

  return (
    <div
      lang={htmlLang}
      style={{ width: f.w, height: f.h, fontFamily: "var(--font-banner)" }}
      className="relative overflow-hidden bg-[#14112b] text-white"
    >
      {visualUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={visualUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: gradients[conceptIndex % 3] }} />
      )}
      {/* legibility scrim: dark at the top (headline) and bottom (CTA) */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,8,30,.78) 0%, rgba(10,8,30,.15) 42%, rgba(10,8,30,0) 60%, rgba(10,8,30,.7) 100%)" }} />

      <div className="absolute flex flex-col" style={{ left: 80, right: 80, top: format === "story" ? 150 : 80, bottom: format === "story" ? 360 : 230 }}>
        <div className="flex items-center gap-3" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em" }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, background: "#6C4CF5", boxShadow: "0 0 0 6px rgba(255,255,255,.9)" }} />
          Lumen
        </div>
        <div ref={textRef} className="mt-8 min-h-0 flex-1 overflow-hidden" style={{ maxHeight: format === "feed" ? 470 : undefined }}>
          <div style={{ fontSize: base.h * scale, lineHeight: 1.02, fontWeight: 900, letterSpacing: "-0.025em", textWrap: "balance", overflowWrap: "break-word", hyphens: "auto" }}>
            {headline}
          </div>
          <div style={{ marginTop: 28 * scale, fontSize: base.s * scale, lineHeight: 1.25, fontWeight: 600, opacity: 0.92, textWrap: "pretty", maxWidth: 820 }}>
            {subline}
          </div>
        </div>
      </div>

      <div className="absolute flex items-center justify-center" style={{ left: 80, right: 80, bottom: format === "story" ? 200 : 80, height: 112, borderRadius: 999, background: "#ffffff", color: "#6C4CF5", fontSize: 40, fontWeight: 800 }}>
        {cta}
      </div>
    </div>
  );
}

/** Scales a real-size banner down to fit a given display width. */
export function Scaled({ width, format, children }: { width: number; format: FormatKey; children: React.ReactNode }) {
  const f = FORMATS[format];
  const s = width / f.w;
  return (
    <div style={{ width, height: f.h * s }} className="overflow-hidden rounded-lg">
      <div style={{ transform: `scale(${s})`, transformOrigin: "top left", width: f.w, height: f.h }}>{children}</div>
    </div>
  );
}

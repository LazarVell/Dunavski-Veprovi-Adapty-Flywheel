"use client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { Banner, FORMATS, type FormatKey } from "@/components/Banner";
import type { Campaign, Localized, BackCheck } from "./schemas";
import { langByKey, needsReview } from "./languages";

/** Renders one banner off-screen at full size and returns a PNG data URL. */
async function bannerPng(props: Parameters<typeof Banner>[0]) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;";
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(createElement(Banner, props)));
  await document.fonts.ready;
  await Promise.all(
    [...host.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))),
  );
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const png = await toPng(host.firstElementChild as HTMLElement, { pixelRatio: 1, cacheBust: false });
  root.unmount();
  host.remove();
  return png;
}

const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

export async function buildPack(opts: {
  campaign: Campaign;
  locs: Record<string, Localized>;
  checks: Record<string, BackCheck | undefined>;
  visuals: Record<string, string | null>;
  onProgress?: (done: number, total: number) => void;
}) {
  const zip = new JSZip();
  const langs = Object.keys(opts.locs);
  const formats = Object.keys(FORMATS) as FormatKey[];
  const total = langs.length * opts.campaign.concepts.length * formats.length;
  let done = 0;

  const rows = [["language", "review_status", "asset", "field", "text", "meaning_check"].join(",")];
  const review: string[] = [];

  for (const key of langs) {
    const lang = langByKey(key)!;
    const l = opts.locs[key];
    const status = needsReview(lang) ? "needs_native_review" : "checked";
    if (status !== "checked") review.push(`${lang.name} (${key}): machine-written, have a native speaker check every asset before publishing.`);
    const flagged = new Set((opts.checks[key]?.lines ?? []).filter((x) => x.meaningChanged).map((x) => x.field));
    const flag = (field: string) => (flagged.has(field) ? "meaning_changed" : opts.checks[key] ? "ok" : "not_checked");

    for (const [ci, c] of l.concepts.entries()) {
      for (const [field, text] of [["headline", c.headline], ["subline", c.subline], ["cta", c.cta]] as const) {
        rows.push([key, status, `banner:${c.id}`, field, text, flag(`${c.id} ${field}`)].map(csvCell).join(","));
      }
      // banners (RTL languages get copy only)
      if (!lang.rtl) {
        for (const fmt of formats) {
          const visual = opts.visuals[`${opts.campaign.concepts[ci].id}:${FORMATS[fmt].visual}`] ?? null;
          const png = await bannerPng({ format: fmt, headline: c.headline, subline: c.subline, cta: c.cta, htmlLang: lang.htmlLang, visualUrl: visual, conceptIndex: ci });
          zip.file(`banners/${key}/${c.id}_${FORMATS[fmt].ratio.replace(":", "x")}.png`, png.split(",")[1], { base64: true });
          opts.onProgress?.(++done, total);
        }
      }
    }
    l.adCopy.forEach((a, i) => {
      rows.push([key, status, `ad:${i + 1}`, "primary_text", a.primaryText, flag(`ad ${i + 1} primary text`)].map(csvCell).join(","));
      rows.push([key, status, `ad:${i + 1}`, "headline", a.headline, flag(`ad ${i + 1} headline`)].map(csvCell).join(","));
      rows.push([key, status, `ad:${i + 1}`, "description", a.description, "not_checked"].map(csvCell).join(","));
    });
    zip.file(
      `video-scripts/${key}.md`,
      `# ${opts.campaign.name} — video script (${lang.name})\n\nHook: ${l.videoScript.hook}\n\n| Time | Shot | On-screen text |\n|---|---|---|\n${l.videoScript.shots
        .map((s) => `| ${s.time} | ${s.shot} | ${s.onScreenText} |`)
        .join("\n")}\n\nCTA: ${l.videoScript.cta}\n`,
    );
  }

  zip.file("ad-copy.csv", "﻿" + rows.join("\n"));
  zip.file(
    "targeting.json",
    JSON.stringify(
      {
        campaign: opts.campaign.name,
        audience: opts.campaign.brief.audience,
        markets: opts.campaign.brief.markets,
        channels: opts.campaign.brief.channels,
        exclude: opts.campaign.brief.avoid,
        languages: langs,
        note: "Publishing to Meta/TikTok is not automated: their ad APIs need app review. Upload this pack in Ads Manager.",
      },
      null,
      2,
    ),
  );
  zip.file("NEEDS_REVIEW.txt", review.length ? review.join("\n") + "\n" : "All languages in this pack were checked.\n");
  return zip.generateAsync({ type: "blob" });
}

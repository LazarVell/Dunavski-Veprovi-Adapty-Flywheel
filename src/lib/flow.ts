/**
 * Builds the matching-paywall draft: takes Lumen's live "Main - 3 plans" flow config (schema 12, inline
 * localized values), rewrites the English copy to carry the ad's promise, and adds one locale per language.
 * Prices stay as product variables, so every locale shows the store's real localized price.
 */
import type { Localized } from "./schemas";

type TextNode = { type: "text"; text: string; attrs?: unknown } | { type: "variable"; attrs: unknown };
type Paragraph = { type: "paragraph"; content: TextNode[] };
type LocalizableContent = { values: Record<string, Paragraph[]>; _localizable: true };
type Plans = Localized["paywall"]["plans"];
type FlowConfig ={ locales: { id: string; code: string; name: string }[]; defaultLocale: string; screens: unknown[]; [k: string]: unknown };

/** The English strings in the base flow, mapped to the fields we write. */
const FIELD_BY_EN: Record<string, string> = {
  "Go Premium": "headline",
  "Everything Lumen can do, without limits.": "subtitle",
  "Unlimited AI edits": "feature0",
  "No daily limits": "feature1",
  "Pro filters and styles": "feature2",
  "New packs every week": "feature3",
  "No watermark": "feature4",
  "Export in full resolution": "feature5",
  Annual: "annual",
  Monthly: "monthly",
  Weekly: "weekly",
  Continue: "cta",
  Terms: "terms",
  Privacy: "privacy",
};

const ATTRS = { bold: false, italic: false, underline: false, strikethrough: false };

function plainText(p: Paragraph[] | undefined) {
  return (p ?? []).flatMap((x) => x.content).map((n) => (n.type === "text" ? n.text : "{var}")).join("");
}

function textFor(field: string, l: Localized): string | null {
  const pw = l.paywall;
  if (field === "headline") return pw.headline;
  if (field === "subtitle") return pw.subtitle;
  if (field.startsWith("feature")) return pw.features[Number(field.slice(7))] ?? null;
  if (field === "annual") return pw.plans.annual;
  if (field === "monthly") return pw.plans.monthly;
  if (field === "weekly") return pw.plans.weekly;
  if (field === "cta") return pw.cta;
  if (field === "terms") return pw.terms;
  if (field === "privacy") return pw.privacy;
  return null;
}

/** Walk every localizable text in the config. */
function eachLocalizable(node: unknown, fn: (c: LocalizableContent) => void) {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (o._localizable && o.values && typeof o.values === "object") fn(o as unknown as LocalizableContent);
  for (const v of Object.values(o)) eachLocalizable(v, fn);
}

export type LocaleInput = { flowLocale: string; name: string; localized: Localized };

export function buildPaywallDraft(base: FlowConfig, english: Localized, others: LocaleInput[]) {
  const cfg: FlowConfig = structuredClone(base);
  const def = cfg.defaultLocale || "en";
  const all: LocaleInput[] = [{ flowLocale: def, name: "English", localized: english }, ...others];
  let replaced = 0;

  // Lines that wrap a store price variable: [text before, {price}, text after]
  const PRICE_LINES: { match: (t: string) => boolean; before: (p: Plans) => string; after: (p: Plans) => string }[] = [
    { match: (t) => t.startsWith("3-day free trial, then "), before: (p) => p.trialPrefix, after: (p) => p.perWeek },
    { match: (t) => t === "{var} per year, best value", before: () => "", after: (p) => p.annualSuffix },
    { match: (t) => t === "{var} per month, cancel anytime", before: () => "", after: (p) => p.monthlySuffix },
  ];

  eachLocalizable(cfg, (c) => {
    const enParas = c.values[def];
    const enText = plainText(enParas);
    const field = FIELD_BY_EN[enText];
    const priceLine = PRICE_LINES.find((x) => x.match(enText));
    if (!field && !priceLine) return;
    for (const loc of all) {
      if (priceLine) {
        // keep the price variable; replace the text before and after it
        const p = loc.localized.paywall.plans;
        c.values[loc.flowLocale] = enParas.map((para) => {
          const vi = para.content.findIndex((n) => n.type === "variable");
          return {
            ...para,
            content: para.content.map((n, i) =>
              n.type !== "text" ? n : { ...n, text: i < vi ? priceLine.before(p) : i > vi ? priceLine.after(p) : n.text },
            ),
          };
        });
      } else {
        const t = textFor(field, loc.localized);
        if (t == null) continue;
        c.values[loc.flowLocale] = [{ type: "paragraph", content: [{ type: "text", text: t, attrs: ATTRS }] }];
      }
      replaced += 1;
    }
  });

  const have = new Set(cfg.locales.map((l) => l.id));
  for (const loc of others) {
    if (!have.has(loc.flowLocale)) cfg.locales.push({ id: loc.flowLocale, code: loc.flowLocale, name: loc.name });
  }
  return { config: cfg, replaced, locales: cfg.locales.map((l) => l.id) };
}

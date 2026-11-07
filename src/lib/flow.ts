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

/** An image uploaded with `flows media upload`: the three values a config binds. */
export type HeroImage = { id: string; url: string; previewValue?: string };

type HierarchyNode = { id: string; children?: HierarchyNode[] };
type Screen = { elements?: { map: Record<string, { props?: { content?: LocalizableContent } }>; hierarchy: HierarchyNode } };

const HERO_ID = "el_901M";

/**
 * Puts the ad's visual on the paywall, right above the headline, so the user sees the picture they tapped.
 * Shape per the flow-generator skill (references/media.md): an `image` element with an inline localizable value.
 */
function findHeadline(cfg: FlowConfig, def: string) {
  const els = (cfg.screens[0] as Screen)?.elements;
  return els ? Object.entries(els.map).find(([, e]) => plainText(e.props?.content?.values?.[def]) === "Go Premium")?.[0] ?? null : null;
}

function addHero(cfg: FlowConfig, hero: HeroImage, def: string, headlineId: string | null) {
  const els = (cfg.screens[0] as Screen)?.elements;
  if (!els || !headlineId) return false;
  const contains = (n: HierarchyNode, id: string): boolean => n.id === id || !!n.children?.some((c) => contains(c, id));
  // Walk down to the stack whose direct child holds the headline, and insert the image before that child.
  let parent = els.hierarchy;
  for (;;) {
    const next: HierarchyNode | undefined = parent.children?.find((c) => contains(c, headlineId));
    if (!next) return false;
    if (next.id === headlineId || next.children?.some((c) => c.id === headlineId)) break;
    parent = next;
  }
  const at = parent.children!.findIndex((c) => contains(c, headlineId));
  if (parent.children!.some((c) => c.id === HERO_ID)) return true;
  parent.children!.splice(at, 0, { id: HERO_ID });
  els.map[HERO_ID] = {
    id: HERO_ID,
    type: "image",
    caption: "Ad visual",
    props: {
      position: { type: "relative" },
      width: { type: "fill" },
      height: { type: "fixed", value: 160 },
      objectFit: "cover",
      borderRadius: { tl: 20, tr: 20, bl: 20, br: 20 },
      image: { _localizable: true, values: { [def]: { id: hero.id, url: hero.url, ...(hero.previewValue ? { previewValue: hero.previewValue } : {}) } } },
    },
    states: [],
  } as never;
  return true;
}

export function buildPaywallDraft(base: FlowConfig, english: Localized, others: LocaleInput[], hero?: HeroImage) {
  const cfg: FlowConfig = structuredClone(base);
  const def = cfg.defaultLocale || "en";
  const all: LocaleInput[] = [{ flowLocale: def, name: "English", localized: english }, ...others];
  const headlineId = findHeadline(cfg, def); // before the copy walk rewrites the English headline
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

  const heroAdded = hero ? addHero(cfg, hero, def, headlineId) : false;

  const have = new Set(cfg.locales.map((l) => l.id));
  for (const loc of others) {
    if (!have.has(loc.flowLocale)) cfg.locales.push({ id: loc.flowLocale, code: loc.flowLocale, name: loc.name });
  }
  return { config: cfg, replaced, heroAdded, locales: cfg.locales.map((l) => l.id) };
}

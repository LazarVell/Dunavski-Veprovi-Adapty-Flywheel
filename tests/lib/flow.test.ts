import { describe, expect, it } from "vitest";
import { buildOnboardingDraft, buildPaywallDraft } from "@/lib/flow";
import { makeLocalized } from "../helpers/fixtures";

const para = (...content: unknown[]) => [{ type: "paragraph", content }];
const text = (t: string) => ({ type: "text", text: t });
const variable = { type: "variable", attrs: { name: "price" } };
const loc = (values: unknown) => ({ _localizable: true, values: { en: values } });
const el = (values: unknown) => ({ props: { content: loc(values) } });

type Node = { id: string; children?: Node[] };
type Cfg = Parameters<typeof buildPaywallDraft>[0];
type Els = { map: Record<string, any>; hierarchy: Node }; // eslint-disable-line @typescript-eslint/no-explicit-any
const els = (cfg: { screens: unknown[] }) => (cfg.screens[0] as { elements: Els }).elements;
const value = (cfg: { screens: unknown[] }, id: string, locale: string) => els(cfg).map[id].props.content.values[locale];

const paywallBase = (): Cfg => ({
  locales: [{ id: "en", code: "en", name: "English" }],
  defaultLocale: "en",
  screens: [
    {
      elements: {
        map: {
          head: el(para(text("Go Premium"))),
          sub: el(para(text("Everything Lumen can do, without limits."))),
          trial: el(para(text("3-day free trial, then "), variable, text("/week"))),
          year: el(para(variable, text(" per year, best value"))),
          other: el(para(text("Something we don't touch"))),
        },
        hierarchy: { id: "root", children: [{ id: "column", children: [{ id: "top" }, { id: "titles", children: [{ id: "head" }, { id: "sub" }] }] }] },
      },
    },
  ],
});

const de = { flowLocale: "de", name: "German", localized: makeLocalized("DE") };
const en = makeLocalized("EN");
const hero = { id: "9", url: "https://cdn/x.jpg", previewValue: "abc" };

describe("buildPaywallDraft", () => {
  it("rewrites the English copy with the ad's words", () => {
    const { config } = buildPaywallDraft(paywallBase(), en, []);
    expect(value(config, "head", "en")[0].content[0].text).toBe("EN paywall");
    expect(value(config, "sub", "en")[0].content[0].text).toBe("EN sub");
  });

  it("adds each language to every known line and registers the locale", () => {
    const { config, locales } = buildPaywallDraft(paywallBase(), en, [de]);
    expect(value(config, "head", "de")[0].content[0].text).toBe("DE paywall");
    expect(locales).toEqual(["en", "de"]);
  });

  it("does not register a locale twice", () => {
    const base = paywallBase();
    base.locales.push({ id: "de", code: "de", name: "German" });
    expect(buildPaywallDraft(base, en, [de]).locales).toEqual(["en", "de"]);
  });

  it("keeps the store's price variable and translates the words around it", () => {
    const { config } = buildPaywallDraft(paywallBase(), en, [de]);
    const [before, price, after] = value(config, "trial", "de")[0].content;
    expect(before.text).toBe("DE trial, ");
    expect(price).toEqual(variable);
    expect(after.text).toBe("/DE");
  });

  it("handles a price line with no text before the price", () => {
    const { config } = buildPaywallDraft(paywallBase(), en, [de]);
    const [price, after] = value(config, "year", "de")[0].content;
    expect(price).toEqual(variable);
    expect(after.text).toBe(" DE per year");
  });

  it("leaves lines it doesn't know alone", () => {
    const { config } = buildPaywallDraft(paywallBase(), en, [de]);
    expect(value(config, "other", "en")[0].content[0].text).toBe("Something we don't touch");
    expect(value(config, "other", "de")).toBeUndefined();
  });

  it("never changes the flow it was given", () => {
    const base = paywallBase();
    const before = JSON.stringify(base);
    buildPaywallDraft(base, en, [de], hero);
    expect(JSON.stringify(base)).toBe(before);
  });

  describe("the ad's picture", () => {
    it("goes right above the block holding the headline", () => {
      const { config, heroAdded } = buildPaywallDraft(paywallBase(), en, [], hero);
      expect(heroAdded).toBe(true);
      const column = els(config).hierarchy.children![0];
      expect(column.children!.map((c) => c.id)).toEqual(["top", "el_901M", "titles"]);
    });

    it("goes right above a headline that sits directly in the screen", () => {
      const base = paywallBase();
      els(base).hierarchy = { id: "root", children: [{ id: "x" }, { id: "head" }] };
      const { config } = buildPaywallDraft(base, en, [], hero);
      expect(els(config).hierarchy.children!.map((c) => c.id)).toEqual(["x", "el_901M", "head"]);
    });

    it("hugs the uploaded crop, so Adapty never crops it to empty sky", () => {
      const { config } = buildPaywallDraft(paywallBase(), en, [], hero);
      expect(els(config).map.el_901M.props.height).toEqual({ type: "hug" });
    });

    it("carries the image's id, url and preview", () => {
      const { config } = buildPaywallDraft(paywallBase(), en, [], hero);
      expect(els(config).map.el_901M.props.image.values.en).toEqual({ id: "9", url: "https://cdn/x.jpg", previewValue: "abc" });
    });

    it("is skipped when there is none", () => {
      const { config, heroAdded } = buildPaywallDraft(paywallBase(), en, []);
      expect(heroAdded).toBe(false);
      expect(els(config).map.el_901M).toBeUndefined();
    });

    it("is reported as not added when the flow has no headline to sit above", () => {
      const base = paywallBase();
      delete els(base).map.head;
      expect(buildPaywallDraft(base, en, [], hero).heroAdded).toBe(false);
    });
  });
});

describe("buildOnboardingDraft", () => {
  const onboardingBase = (): Cfg => ({
    locales: [{ id: "en", code: "en", name: "English" }],
    defaultLocale: "en",
    screens: [
      {
        elements: {
          map: {
            head: el(para(text("Edit photos by describing them"))),
            sub: el(para(text("Remove objects, fix light, change the sky. Just say what you want."))),
          },
          hierarchy: { id: "root", children: [{ id: "head" }, { id: "sub" }] },
        },
      },
      { elements: { map: { later: el(para(text("Edit photos by describing them"))) }, hierarchy: { id: "root", children: [{ id: "later" }] } } },
    ],
  });
  const ad = { headline: "Ad headline", subline: "Ad subline" };

  it("puts the ad's words on the welcome screen only", () => {
    const { config, replaced } = buildOnboardingDraft(onboardingBase(), ad);
    expect(replaced).toBe(2);
    expect(value(config, "head", "en")[0].content[0].text).toBe("Ad headline");
    expect(value(config, "sub", "en")[0].content[0].text).toBe("Ad subline");
    const later = (config.screens[1] as { elements: Els }).elements.map.later.props.content.values.en;
    expect(later[0].content[0].text).toBe("Edit photos by describing them");
  });

  it("gives the picture a fixed height on the welcome screen", () => {
    const { config, heroAdded } = buildOnboardingDraft(onboardingBase(), ad, hero);
    expect(heroAdded).toBe(true);
    expect(els(config).map.el_901M.props.height).toEqual({ type: "fixed", value: 280 });
  });

  it("never changes the flow it was given", () => {
    const base = onboardingBase();
    const before = JSON.stringify(base);
    buildOnboardingDraft(base, ad, hero);
    expect(JSON.stringify(base)).toBe(before);
  });
});

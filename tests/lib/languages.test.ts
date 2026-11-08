import { describe, expect, it } from "vitest";
import { ALL_LANGS, deepTranslit, langByKey, langsForMarkets, needsReview, reviewStatus, srCyrlToLatn } from "@/lib/languages";

describe("srCyrlToLatn", () => {
  it.each([
    ["ћирилица", "ćirilica"],
    ["Ђорђе", "Đorđe"],
    ["Џак", "Džak"],
    ["Љубав", "Ljubav"],
    ["Њива", "Njiva"],
    ["шта чује жена", "šta čuje žena"],
  ])("converts %s", (cyr, lat) => expect(srCyrlToLatn(cyr)).toBe(lat));

  it("uses all-caps digraphs inside all-caps words", () => {
    expect(srCyrlToLatn("ЉУБАВ")).toBe("LJUBAV");
    expect(srCyrlToLatn("КОЊ")).toBe("KONJ");
    expect(srCyrlToLatn("ЏЕМПЕР")).toBe("DŽEMPER");
  });

  it("leaves Latin text, numbers and punctuation alone", () => {
    expect(srCyrlToLatn("Lumen AI, 3 дана!")).toBe("Lumen AI, 3 dana!");
  });
});

describe("deepTranslit", () => {
  it("converts every string at any depth and keeps other values", () => {
    expect(deepTranslit({ a: "шта", b: ["жена", { c: "чује" }], n: 3, ok: true, none: null })).toEqual({
      a: "šta",
      b: ["žena", { c: "čuje" }],
      n: 3,
      ok: true,
      none: null,
    });
  });

  it("does not convert object keys", () => {
    expect(Object.keys(deepTranslit({ шта: "x" }))).toEqual(["шта"]);
  });
});

describe("langsForMarkets", () => {
  it("puts English first and maps each market to its language", () => {
    expect(langsForMarkets(["NL", "US", "DE", "SE"])).toEqual(["en", "nl", "de", "sv"]);
  });

  it("lists each language once", () => {
    expect(langsForMarkets(["US", "CA", "GB", "AU"])).toEqual(["en"]);
  });

  it("always includes English and ignores unknown markets", () => {
    expect(langsForMarkets(["ZZ"])).toEqual(["en"]);
    expect(langsForMarkets([])).toEqual(["en"]);
  });
});

describe("reviewStatus", () => {
  const de = langByKey("de")!, fr = langByKey("fr")!, en = langByKey("en")!;

  it("calls English the source", () => expect(reviewStatus(en, false)).toBe("source"));
  it("has no status that claims a person checked it", () => {
    for (const l of [en, de, fr]) for (const checked of [true, false]) expect(reviewStatus(l, checked)).not.toBe("checked");
  });
  it("says machine_written until the meaning is checked", () => {
    expect(reviewStatus(de, false)).toBe("machine_written");
    expect(reviewStatus(de, true)).toBe("machine_written_meaning_checked");
  });
  it("sends a line whose meaning changed to a native speaker", () => expect(reviewStatus(de, true, true)).toBe("needs_native_review"));
  it("always asks for a native read outside tier 1", () => expect(reviewStatus(fr, true)).toBe("needs_native_review"));
});

describe("language catalog", () => {
  it("has no duplicate keys", () => {
    const keys = ALL_LANGS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("asks for native review on everything except tier 1", () => {
    expect(needsReview(langByKey("de")!)).toBe(false);
    expect(needsReview(langByKey("fr")!)).toBe(true);
  });

  it("writes Serbian Latin through Cyrillic", () => {
    expect(langByKey("sr-Latn")?.writeAs).toBe("sr-Cyrl");
    expect(langByKey("sr-Cyrl")?.writeAs).toBeUndefined();
  });

  it("returns undefined for an unknown key", () => {
    expect(langByKey("xx")).toBeUndefined();
  });
});

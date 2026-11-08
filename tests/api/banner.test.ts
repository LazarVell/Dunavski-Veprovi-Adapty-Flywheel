import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, LlmUnavailable, editImage, generateImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  LlmUnavailable: class extends Error {},
  editImage: vi.fn(),
  generateImage: vi.fn(),
}));
vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));
vi.mock("@/lib/llm", () => ({ generate, LlmUnavailable, openai: vi.fn(), withFallback: vi.fn() }));
vi.mock("@/lib/visuals", async (original) => ({ ...(await original<typeof import("@/lib/visuals")>()), editImage, generateImage }));

import { POST } from "@/app/api/banner/route";
import { getCurrent, setCurrent } from "@/lib/campaign-store";
import { resetMemory, writeBinary } from "../helpers/memory-cache";
import { call, makeLocalized, makeStored } from "../helpers/fixtures";

const concept = (id: string) => getCurrent()!.campaign.concepts.find((c) => c.id === id)!;
const edit = (conceptId = "b", instruction = "change it") => call(POST, { action: "edit", conceptId, instruction });
const undo = (conceptId = "b") => call(POST, { action: "undo", conceptId });

/** What the model says the banner should become; defaults to leaving it as it is. */
const modelReturns = (over: Record<string, string> = {}) =>
  generate.mockResolvedValueOnce({
    data: { headline: "Headline b", subline: "Subline b", cta: "Cta b", imageEdit: "", visualPrompt: "photo b", summary: "Done.", ...over },
    model: "m",
  });

const withLocales = () =>
  makeStored({
    locales: {
      de: { data: makeLocalized("DE"), model: "m", check: { lines: [] } },
      fr: { data: makeLocalized("FR"), model: "m" },
    },
  });

beforeEach(() => {
  resetMemory();
  generate.mockReset();
  editImage.mockReset().mockImplementation(async (_s: string, _i: string, aspect: string) => ({ key: `edited-${aspect}`, model: "m" }));
  generateImage.mockReset().mockImplementation(async (_p: string, aspect: string) => ({ key: `new-${aspect}`, model: "m", skipped: [] }));
  setCurrent(withLocales());
});

describe("edit: words", () => {
  beforeEach(() => {
    modelReturns({ headline: "Shorter" });
  });

  it("changes the banner, not the others", async () => {
    const { json } = await edit();
    expect(json.changed).toEqual({ words: true, picture: false });
    expect(concept("b").headline).toBe("Shorter");
    expect(concept("a").headline).toBe("Headline a");
  });

  it("marks that banner out of date in every written language", async () => {
    await edit();
    const { locales } = getCurrent()!;
    expect(locales!.de.stale).toEqual(["b"]);
    expect(locales!.fr.stale).toEqual(["b"]);
  });

  it("drops the meaning check, which was for the old words", async () => {
    await edit();
    expect(getCurrent()!.locales!.de.check).toBeUndefined();
  });

  it("doesn't touch the pictures", async () => {
    await edit();
    expect(editImage).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("offers undo and records when it changed", async () => {
    const { json } = await edit();
    expect(json.current.undoable).toEqual({ b: 1 });
    expect(getCurrent()!.bannerUpdatedAt!.b).toBeDefined();
  });
});

describe("edit: picture", () => {
  const seedPhotos = () => {
    setCurrent({ ...withLocales(), visualKeys: { "b:portrait": "pp", "b:square": "ss" } });
    writeBinary("images", "pp", "jpg", Buffer.from("x"));
    writeBinary("images", "ss", "jpg", Buffer.from("x"));
  };

  it("edits the existing photo in both shapes", async () => {
    seedPhotos();
    modelReturns({ imageEdit: "add snow", visualPrompt: "photo b with snow" });
    await edit();
    expect(editImage).toHaveBeenCalledWith("pp", "add snow", "portrait", false);
    expect(editImage).toHaveBeenCalledWith("ss", "add snow", "square", false);
    expect(getCurrent()!.visualKeys).toEqual({ "b:portrait": "edited-portrait", "b:square": "edited-square" });
  });

  it("updates the description, and leaves the words and languages alone", async () => {
    seedPhotos();
    modelReturns({ imageEdit: "add snow", visualPrompt: "photo b with snow" });
    const { json } = await edit();
    expect(json.changed).toEqual({ words: false, picture: true });
    expect(concept("b").visualPrompt).toBe("photo b with snow");
    expect(getCurrent()!.locales!.de.stale).toBeUndefined();
    expect(getCurrent()!.locales!.de.check).toBeDefined();
  });

  it("generates a photo if the banner has none yet", async () => {
    modelReturns({ imageEdit: "add snow", visualPrompt: "photo b with snow" });
    await edit();
    expect(editImage).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledWith("photo b with snow", "square", false);
    expect(getCurrent()!.visualKeys).toEqual({ "b:portrait": "new-portrait", "b:square": "new-square" });
  });

  it("ignores a blank picture instruction", async () => {
    modelReturns({ imageEdit: "   ", visualPrompt: "ignored" });
    const { json } = await edit();
    expect(json.changed.picture).toBe(false);
    expect(concept("b").visualPrompt).toBe("photo b");
  });
});

describe("edit: general", () => {
  it("records nothing when nothing changed", async () => {
    modelReturns();
    const { json } = await edit();
    expect(json.changed).toEqual({ words: false, picture: false });
    expect(json.current.undoable).toEqual({});
  });

  it("doesn't lose another banner edited meanwhile", async () => {
    generate.mockImplementationOnce(async () => {
      const s = getCurrent()!;
      s.campaign.concepts[0].headline = "Edited in parallel";
      setCurrent(s);
      return { data: { headline: "Mine", subline: "Subline b", cta: "Cta b", imageEdit: "", visualPrompt: "photo b", summary: "" }, model: "m" };
    });
    await edit();
    expect(concept("a").headline).toBe("Edited in parallel");
    expect(concept("b").headline).toBe("Mine");
  });

  it("drops an edit if a new campaign was written while it ran, even with the same banner ids", async () => {
    generate.mockImplementationOnce(async () => {
      setCurrent(makeStored({ id: "campaign-2" }));
      return { data: { headline: "From the old campaign", subline: "Subline b", cta: "Cta b", imageEdit: "", visualPrompt: "photo b", summary: "" }, model: "m" };
    });
    const r = await edit();
    expect(r.status).toBe(502);
    expect(r.json.error).toContain("new campaign");
    expect(concept("b").headline).toBe("Headline b");
  });

  it("rejects an empty instruction without calling the model", async () => {
    expect((await edit("b", "  ")).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports an unknown banner", async () => {
    const r = await edit("zzz");
    expect(r.status).toBe(502);
    expect(r.json.error).toContain("zzz");
  });

  it("says 503 when no key is set", async () => {
    generate.mockRejectedValue(new LlmUnavailable("no key"));
    expect((await edit()).status).toBe(503);
  });
});

describe("undo", () => {
  it("restores words and marks languages to be re-written", async () => {
    modelReturns({ headline: "Shorter" });
    await edit();
    const { json } = await undo();
    expect(concept("b").headline).toBe("Headline b");
    expect(json.changed.words).toBe(true);
    expect(json.current.undoable).toEqual({});
    expect(getCurrent()!.locales!.fr.stale).toEqual(["b"]);
  });

  it("restores the earlier picture", async () => {
    setCurrent({ ...withLocales(), visualKeys: { "b:portrait": "pp", "b:square": "ss" } });
    writeBinary("images", "pp", "jpg", Buffer.from("x"));
    writeBinary("images", "ss", "jpg", Buffer.from("x"));
    modelReturns({ imageEdit: "add snow", visualPrompt: "snow" });
    await edit();
    const { json } = await undo();
    expect(json.changed.picture).toBe(true);
    expect(getCurrent()!.visualKeys).toEqual({ "b:portrait": "pp", "b:square": "ss" });
    expect(concept("b").visualPrompt).toBe("photo b");
  });

  it("steps back one change at a time", async () => {
    modelReturns({ headline: "One" });
    await edit();
    modelReturns({ headline: "Two" });
    await edit();
    await undo();
    expect(concept("b").headline).toBe("One");
    await undo();
    expect(concept("b").headline).toBe("Headline b");
  });

  it("says so when there is nothing to undo", async () => {
    const r = await undo();
    expect(r.status).toBe(502);
    expect(r.json.error).toContain("Nothing to undo");
  });
});

describe("rewrite", () => {
  const rewriteReturns = (fn: (id: string) => Partial<Record<string, string>>) =>
    generate.mockResolvedValueOnce({
      data: {
        concepts: ["a", "b", "c"].map((id) => ({ id, headline: `Headline ${id}`, subline: `Subline ${id}`, cta: `Cta ${id}`, visualPrompt: `photo ${id}`, ...fn(id) })),
        summary: "Rewritten.",
      },
      model: "m",
    });
  const rewrite = (instructions = "warm light") => call(POST, { action: "rewrite", instructions });

  it("saves the instructions", async () => {
    rewriteReturns(() => ({}));
    await rewrite();
    expect(getCurrent()!.bannerInstructions).toBe("warm light");
  });

  it("clears the photo of a banner whose description changed, so a new one is made", async () => {
    setCurrent({ ...withLocales(), visualKeys: { "a:square": "keep", "b:square": "old" } });
    rewriteReturns((id) => (id === "b" ? { visualPrompt: "warm photo b" } : {}));
    const { json } = await rewrite();
    expect(json.changed).toEqual({ words: false, picture: true });
    expect(getCurrent()!.visualKeys).toEqual({ "a:square": "keep" });
    expect(json.visuals["b:square"]).toBeNull();
  });

  it("keeps a photo whose description didn't change, when only the words did", async () => {
    setCurrent({ ...withLocales(), visualKeys: { "b:square": "keep" } });
    rewriteReturns((id) => (id === "b" ? { headline: "New" } : {}));
    const { json } = await rewrite();
    expect(json.changed).toEqual({ words: true, picture: false });
    expect(getCurrent()!.visualKeys).toEqual({ "b:square": "keep" });
  });

  it("marks only the reworded banners out of date", async () => {
    rewriteReturns((id) => (id === "a" ? { headline: "New" } : {}));
    await rewrite();
    expect(getCurrent()!.locales!.de.stale).toEqual(["a"]);
  });

  it("adds no history for banners that didn't change", async () => {
    rewriteReturns((id) => (id === "a" ? { headline: "New" } : {}));
    expect((await rewrite()).json.current.undoable).toEqual({ a: 1 });
  });

  it("matches banners by position if the model changes an id", async () => {
    generate.mockResolvedValueOnce({
      data: { concepts: [{ id: "renamed", headline: "New a", subline: "Subline a", cta: "Cta a", visualPrompt: "photo a" }], summary: "" },
      model: "m",
    });
    await rewrite();
    expect(concept("a").headline).toBe("New a");
    expect(concept("b").headline).toBe("Headline b");
  });

  it("rejects empty instructions", async () => {
    expect((await rewrite("  ")).status).toBe(400);
  });
});

describe("art-direction", () => {
  beforeEach(() => {
    generate.mockResolvedValueOnce({ data: { direction: "  Warm and candid.  " }, model: "m" });
  });

  it("saves the line as the applied instructions", async () => {
    const { json } = await call(POST, { action: "art-direction" });
    expect(json.current.bannerInstructions).toBe("Warm and candid.");
    expect(getCurrent()!.bannerInstructions).toBe("Warm and candid.");
  });

  it("follows the skill file's instructions", async () => {
    await call(POST, { action: "art-direction" });
    expect(generate.mock.calls[0][0].system).toContain("art director");
  });

  it("reads all the photo descriptions", async () => {
    await call(POST, { action: "art-direction" });
    for (const id of ["a", "b", "c"]) expect(generate.mock.calls[0][0].user).toContain(`photo ${id}`);
  });

  it("doesn't put one campaign's art direction on the next", async () => {
    generate.mockReset().mockImplementationOnce(async () => {
      setCurrent(makeStored({ id: "campaign-2" }));
      return { data: { direction: "Old look" }, model: "m" };
    });
    expect((await call(POST, { action: "art-direction" })).status).toBe(502);
    expect(getCurrent()!.bannerInstructions).toBeUndefined();
  });

  it("changes no banner", async () => {
    const { json } = await call(POST, { action: "art-direction" });
    expect(json.changed).toEqual({ words: false, picture: false });
    expect(json.current.undoable).toEqual({});
  });
});

describe("requests", () => {
  it("needs a campaign", async () => {
    resetMemory();
    expect((await edit()).status).toBe(400);
  });

  it("rejects an unknown action", async () => {
    expect((await call(POST, { action: "dance" })).status).toBe(400);
  });
});

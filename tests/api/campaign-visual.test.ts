import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, LlmUnavailable, generateImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  LlmUnavailable: class extends Error {},
  generateImage: vi.fn(),
}));
vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));
vi.mock("@/lib/llm", () => ({ generate, LlmUnavailable, openai: vi.fn(), withFallback: vi.fn() }));
vi.mock("@/lib/adapty", () => ({ appId: async () => "app1" }));
vi.mock("@/lib/visuals", async (original) => ({ ...(await original<typeof import("@/lib/visuals")>()), generateImage }));

import { GET, POST } from "@/app/api/campaign/route";
import { POST as visualPost } from "@/app/api/visual/route";
import { getCurrent, setCurrent } from "@/lib/campaign-store";
import type { AdPaywall } from "@/lib/ads";
import { resetMemory } from "../helpers/memory-cache";
import { call, makeCampaign, makeLocalized, makeStored } from "../helpers/fixtures";

beforeEach(() => {
  resetMemory();
  generate.mockReset().mockImplementation(async () => ({ data: makeCampaign(), model: "m" }));
  generateImage.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

describe("POST /api/campaign", () => {
  it("makes a new campaign every time, even for the same prompt (no caching)", async () => {
    const a = await call(POST, { prompt: "same" });
    const b = await call(POST, { prompt: "same" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(a.json.current.id).not.toBe(b.json.current.id);
  });

  it("carries nothing over from the campaign it replaces", async () => {
    const snap = { concept: makeCampaign().concepts[0], visualKeys: {} };
    setCurrent(
      makeStored({
        locales: { de: { data: makeLocalized("DE"), model: "m" } },
        visualKeys: { "a:square": "old" },
        bannerHistory: { a: [snap] },
        bannerInstructions: "old look",
        adPaywalls: { app1: { a: { conceptId: "a" } as AdPaywall } },
      }),
    );
    await call(POST, { prompt: "new" });
    const s = getCurrent()!;
    expect(s.id).not.toBe("campaign-1");
    expect(s).not.toHaveProperty("locales");
    expect(s).not.toHaveProperty("visualKeys");
    expect(s).not.toHaveProperty("bannerHistory");
    expect(s).not.toHaveProperty("bannerInstructions");
    expect(s).not.toHaveProperty("adPaywalls");
  });

  it("gives the model the prompt and the Insights numbers", async () => {
    await call(POST, { prompt: "  for parents  " });
    const { user } = generate.mock.calls[0][0];
    expect(user).toContain("for parents");
    expect(user).toContain("FACT SHEET");
  });

  it("trims the saved prompt", async () => {
    await call(POST, { prompt: "  for parents  " });
    expect(getCurrent()!.prompt).toBe("for parents");
  });

  it.each(["", "   "])("rejects an empty prompt (%j) without calling the model", async (prompt) => {
    expect((await call(POST, { prompt })).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("leaves the current campaign alone if writing fails", async () => {
    setCurrent(makeStored());
    generate.mockRejectedValue(new Error("boom"));
    expect((await call(POST, { prompt: "new" })).status).toBe(500);
    expect(getCurrent()!.id).toBe("campaign-1");
  });

  it("says 503 when no key is set", async () => {
    generate.mockRejectedValue(new LlmUnavailable("no key"));
    expect((await call(POST, { prompt: "new" })).status).toBe(503);
  });
});

describe("GET /api/campaign", () => {
  it("sends the Studio's flow from the skill file", async () => {
    const j = await (await GET()).json();
    expect(j.current).toBeNull();
    expect(j.director.source).toContain("creative-studio/SKILL.md");
    expect(j.director.steps[0].id).toBe("campaign");
  });

  it("sends this account's paywalls only", async () => {
    setCurrent(makeStored({ adPaywalls: { app1: { a: { conceptId: "a" } as AdPaywall }, other: { b: { conceptId: "b" } as AdPaywall } } }));
    const j = await (await GET()).json();
    expect(Object.keys(j.adapty.adPaywalls)).toEqual(["a"]);
  });
});

describe("POST /api/visual", () => {
  beforeEach(() => setCurrent(makeStored()));

  it("draws from the banner's own description", async () => {
    generateImage.mockResolvedValue({ key: "aaaa", model: "m", skipped: [] });
    await call(visualPost, { conceptId: "b", aspect: "square", live: true });
    expect(generateImage).toHaveBeenCalledWith("photo b", "square", true);
  });

  it("records the picture on the campaign", async () => {
    generateImage.mockResolvedValue({ key: "aaaa", model: "m", skipped: [] });
    const r = await call(visualPost, { conceptId: "a", aspect: "square" });
    expect(r.json.url).toBe("/api/visual/aaaa");
    expect(getCurrent()!.visualKeys).toEqual({ "a:square": "aaaa" });
  });

  it("always generates, even when the banner already has a picture", async () => {
    generateImage.mockResolvedValueOnce({ key: "aaaa", model: "m", skipped: [] }).mockResolvedValueOnce({ key: "bbbb", model: "m", skipped: [] });
    await call(visualPost, { conceptId: "a", aspect: "square" });
    await call(visualPost, { conceptId: "a", aspect: "square" });
    expect(getCurrent()!.visualKeys).toEqual({ "a:square": "bbbb" });
  });

  it("defaults to portrait", async () => {
    generateImage.mockResolvedValue({ key: "aaaa", model: "m", skipped: [] });
    await call(visualPost, { conceptId: "a" });
    expect(getCurrent()!.visualKeys).toEqual({ "a:portrait": "aaaa" });
  });

  it("won't put a picture on a campaign that replaced its own", async () => {
    generateImage.mockImplementation(async () => {
      setCurrent(makeStored({ id: "campaign-2" }));
      return { key: "aaaa", model: "m", skipped: [] };
    });
    expect((await call(visualPost, { conceptId: "a" })).status).toBe(409);
    expect(getCurrent()!.visualKeys).toBeUndefined();
  });

  it("rejects an unknown banner", async () => {
    expect((await call(visualPost, { conceptId: "zzz" })).status).toBe(400);
  });

  it("needs a campaign", async () => {
    resetMemory();
    expect((await call(visualPost, { conceptId: "a" })).status).toBe(400);
  });

  it("says 503 when no key is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await call(visualPost, { conceptId: "a" })).status).toBe(503);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("says 502 when the image API fails", async () => {
    generateImage.mockRejectedValue(new Error("image down"));
    const r = await call(visualPost, { conceptId: "a" });
    expect(r.status).toBe(502);
    expect(r.json.error).toBe("image down");
  });
});

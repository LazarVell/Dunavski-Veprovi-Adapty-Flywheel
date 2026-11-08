import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { images } = vi.hoisted(() => ({ images: { generate: vi.fn(), edit: vi.fn() } }));
vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));
vi.mock("@/lib/llm", () => ({
  openai: () => ({ images }),
  withFallback: async (models: string[], call: (m: string) => Promise<unknown>) => ({ result: await call(models[0]), model: models[0], skipped: [] }),
}));

import { editImage, generateImage, hasImage, heroCrop, promptKey, visualKeyFor, visualUrl, visualUrls } from "@/lib/visuals";
import { readBinary, resetMemory, writeBinary } from "../helpers/memory-cache";
import { makeStored } from "../helpers/fixtures";

const image = { data: [{ b64_json: Buffer.from("picture").toString("base64") }] };
const c = makeStored().campaign.concepts[0];

beforeEach(() => {
  resetMemory();
  images.generate.mockReset().mockResolvedValue(image);
  images.edit.mockReset().mockResolvedValue(image);
});

describe("generateImage", () => {
  it("makes a new image every time, even for the same description (no caching)", async () => {
    const a = await generateImage("a photo", "square");
    const b = await generateImage("a photo", "square");
    expect(a.key).not.toBe(b.key);
    expect(images.generate).toHaveBeenCalledTimes(2);
  });

  it("uses keys the image route accepts", async () => {
    expect((await generateImage("a photo", "square")).key).toMatch(/^[a-f0-9]{16}$/);
  });

  it("saves the picture", async () => {
    const { key } = await generateImage("a photo", "square");
    expect(readBinary("images", key, "jpg")?.toString()).toBe("picture");
  });

  it("always forbids text in the picture", async () => {
    await generateImage("a photo", "portrait");
    expect(images.generate.mock.calls[0][0].prompt).toMatch(/^a photo\n[\s\S]*no text/);
  });

  it("asks for the right shape", async () => {
    await generateImage("a photo", "square");
    expect(images.generate.mock.calls[0][0].size).toBe("1024x1024");
  });

  it("fails clearly if the API returns no image", async () => {
    images.generate.mockResolvedValue({ data: [] });
    await expect(generateImage("a photo", "square")).rejects.toThrow("no image");
  });
});

describe("editImage", () => {
  beforeEach(() => writeBinary("images", "source", "jpg", Buffer.from("original")));

  it("makes a new image every time (no caching)", async () => {
    const a = await editImage("source", "add snow", "square");
    const b = await editImage("source", "add snow", "square");
    expect(a.key).not.toBe(b.key);
    expect(images.edit).toHaveBeenCalledTimes(2);
  });

  it("leaves the source picture in place, so undo works", async () => {
    await editImage("source", "add snow", "square");
    expect(readBinary("images", "source", "jpg")?.toString()).toBe("original");
  });

  it("fails clearly if the source is gone", async () => {
    await expect(editImage("missing", "add snow", "square")).rejects.toThrow("missing from the cache");
  });
});

describe("visualKeyFor", () => {
  it("uses the picture recorded on the campaign", () => {
    expect(visualKeyFor(makeStored({ visualKeys: { "a:square": "recorded" } }), c, "square")).toBe("recorded");
  });

  it("falls back to where older campaigns kept it", () => {
    expect(visualKeyFor(makeStored(), c, "square")).toBe(promptKey(c.visualPrompt, "square"));
  });

  it("keeps portrait and square apart", () => {
    expect(promptKey("x", "square")).not.toBe(promptKey("x", "portrait"));
  });
});

describe("heroCrop", () => {
  beforeEach(async () => {
    const photo = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#cc8844" } }).jpeg().toBuffer();
    writeBinary("images", "square", "jpg", photo);
  });

  it("makes a 2:1 crop for the paywall", async () => {
    const key = (await heroCrop("square"))!;
    const meta = await sharp(readBinary("images", key, "jpg")!).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 512]);
  });

  it("makes the crop once per photo", async () => {
    expect(await heroCrop("square")).toBe(await heroCrop("square"));
  });

  it("returns nothing for a missing photo", async () => {
    await expect(heroCrop("missing")).resolves.toBeNull();
  });

  it("is listed with the banner's pictures", async () => {
    const stored = makeStored({ visualKeys: { "a:square": "square" } });
    const urls = await visualUrls(stored);
    expect(urls["a:square"]).toBe(visualUrl("square"));
    expect(urls["a:hero"]).toMatch(/^\/api\/visual\/[a-f0-9]{16}$/);
    expect(urls["b:hero"]).toBeNull();
    expect(hasImage("square")).toBe(true);
  });
});

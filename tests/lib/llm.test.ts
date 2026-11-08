import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generate, LlmUnavailable, openai, shouldFallBack, TEXT_MODELS, withFallback } from "@/lib/llm";

const apiError = (status: number) => new OpenAI.APIError(status, undefined, `http ${status}`, new Headers());
const input = { kind: "test", schema: z.object({ x: z.number() }), system: "sys", user: "same input" };
const ok = (x: number) => ({ status: "completed", output: [], output_parsed: { x } });

describe("shouldFallBack", () => {
  it.each([403, 404, 429, 500, 503])("tries another model after HTTP %i", (s) => expect(shouldFallBack(apiError(s))).toBe(true));
  it.each([400, 401, 422])("does not after HTTP %i, another model won't help", (s) => expect(shouldFallBack(apiError(s))).toBe(false));
  it("tries another model after a connection error", () => expect(shouldFallBack(new OpenAI.APIConnectionError({ message: "down" }))).toBe(true));
  it("does not after our own errors", () => expect(shouldFallBack(new Error("schema"))).toBe(false));
});

describe("withFallback", () => {
  it("stops at the first model that works", async () => {
    const call = vi.fn().mockResolvedValue("done");
    await expect(withFallback(["a", "b"], call)).resolves.toEqual({ result: "done", model: "a", skipped: [] });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("moves down the chain and says what it skipped", async () => {
    const call = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValue("done");
    const r = await withFallback(["a", "b"], call);
    expect(r.model).toBe("b");
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toContain("a:");
  });

  it("stops at once on an error another model can't fix", async () => {
    const call = vi.fn().mockRejectedValue(apiError(400));
    await expect(withFallback(["a", "b"], call)).rejects.toThrow("http 400");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("names the models when all of them fail", async () => {
    await expect(withFallback(["a", "b"], vi.fn().mockRejectedValue(apiError(500)))).rejects.toThrow(/a, b/);
  });
});

describe("generate", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  const parse = () => vi.spyOn(openai().responses, "parse");

  it("asks the model every time, even for identical input (no caching)", async () => {
    const spy = parse().mockResolvedValueOnce(ok(1) as never).mockResolvedValueOnce(ok(2) as never);
    expect((await generate(input)).data).toEqual({ x: 1 });
    expect((await generate(input)).data).toEqual({ x: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reports which model answered", async () => {
    parse().mockResolvedValue(ok(1) as never);
    expect((await generate(input)).model).toBe(TEXT_MODELS[0]);
  });

  it("falls back to the next model", async () => {
    parse().mockRejectedValueOnce(apiError(429)).mockResolvedValue(ok(1) as never);
    expect((await generate(input)).model).toBe(TEXT_MODELS[1]);
  });

  it("explains a missing API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(generate(input)).rejects.toBeInstanceOf(LlmUnavailable);
  });

  it("rejects an answer that was cut off", async () => {
    parse().mockResolvedValue({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } as never);
    await expect(generate(input)).rejects.toThrow("stopped early: max_output_tokens");
  });

  it("surfaces a refusal", async () => {
    parse().mockResolvedValue({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] } as never);
    await expect(generate(input)).rejects.toThrow("declined: no");
  });

  it("rejects output that doesn't match the schema", async () => {
    parse().mockResolvedValue({ status: "completed", output: [], output_parsed: null } as never);
    await expect(generate(input)).rejects.toThrow("did not match the schema");
  });
});

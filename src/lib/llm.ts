import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { hashKey, readCache, writeCache } from "./cache";

/**
 * Text models, best first. If one is unavailable (no access yet, not found, rate limited, server error),
 * the next one is tried. Override with OPENAI_TEXT_MODELS=model-a,model-b,...
 */
export const TEXT_MODELS = (process.env.OPENAI_TEXT_MODELS || process.env.OPENAI_TEXT_MODEL || "gpt-5.5,gpt-5.4-mini,gpt-4.1-mini")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EFFORT = process.env.OPENAI_TEXT_EFFORT as "low" | "medium" | "high" | undefined;

let client: OpenAI | null = null;
export const openai = () => (client ??= new OpenAI());

export class LlmUnavailable extends Error {}

/** Errors where trying another model can help. Schema, prompt and auth problems are not among them. */
export function shouldFallBack(e: unknown) {
  if (e instanceof OpenAI.APIConnectionError) return true;
  if (e instanceof OpenAI.APIError) return e.status === 403 || e.status === 404 || e.status === 429 || (e.status ?? 0) >= 500;
  return false;
}

/** Runs `call` on each model in order until one works. Returns the result and the model that produced it. */
export async function withFallback<T>(models: string[], call: (model: string) => Promise<T>): Promise<{ result: T; model: string; skipped: string[] }> {
  const skipped: string[] = [];
  let last: unknown;
  for (const model of models) {
    try {
      return { result: await call(model), model, skipped };
    } catch (e) {
      last = e;
      if (!shouldFallBack(e)) throw e;
      skipped.push(`${model}: ${(e as Error).message.slice(0, 120)}`);
      console.warn(`[fallback] ${model} unavailable, trying next. ${(e as Error).message.slice(0, 120)}`);
    }
  }
  throw new Error(`No model in [${models.join(", ")}] could answer. Last error: ${(last as Error)?.message}`);
}

type Cached<T> = { data: T; model: string };

/**
 * One structured call, cached on disk per model.
 * First pass: a cached result from any model in the chain wins (best model first), so the demo replays
 * instantly and never goes live by accident just because a key is set. Second pass: call the models in order.
 * `fresh: true` skips the cache and asks the best available model again.
 * The model only writes words: every number it may cite is passed in `user`, computed in code.
 */
export async function generate<S extends z.ZodType>(opts: {
  kind: string;
  schema: S;
  system: string;
  user: string;
  fresh?: boolean;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; cached: boolean; key: string; model: string }> {
  const keyFor = (model: string) => hashKey(opts.kind, model, opts.system, opts.user);
  const bucket = `llm/${opts.kind}`;
  const hasKey = !!process.env.OPENAI_API_KEY;
  let last: unknown = null;

  if (!opts.fresh) {
    for (const model of TEXT_MODELS) {
      const key = keyFor(model);
      const hit = readCache<Cached<z.infer<S>>>(bucket, key);
      if (hit) return { data: hit.data, cached: true, key, model };
    }
  }
  for (const model of TEXT_MODELS) {
    const key = keyFor(model);
    if (!hasKey) continue;
    try {
      const data = await callModel(model, opts);
      writeCache(bucket, key, { data, model } satisfies Cached<z.infer<S>>);
      return { data, cached: false, key, model };
    } catch (e) {
      last = e;
      if (!shouldFallBack(e)) throw e;
      console.warn(`[fallback] ${model} unavailable for ${opts.kind}, trying next. ${(e as Error).message.slice(0, 120)}`);
    }
  }
  if (!hasKey) throw new LlmUnavailable("OPENAI_API_KEY is not set in .env and nothing is cached for this input.");
  throw new Error(`No text model could answer (${TEXT_MODELS.join(", ")}). Last error: ${(last as Error)?.message}`);
}

async function callModel<S extends z.ZodType>(model: string, opts: { kind: string; schema: S; system: string; user: string; maxTokens?: number }) {
  const res = await openai().responses.parse({
    model,
    instructions: opts.system,
    input: opts.user,
    max_output_tokens: opts.maxTokens ?? 16000,
    ...(EFFORT ? { reasoning: { effort: EFFORT } } : {}),
    text: { format: zodTextFormat(opts.schema, opts.kind) },
  });
  if (res.status === "incomplete") throw new Error(`${model} stopped early: ${res.incomplete_details?.reason ?? "unknown reason"}`);
  const refusal = res.output.flatMap((o) => (o.type === "message" ? o.content : [])).find((c) => c.type === "refusal");
  if (refusal && refusal.type === "refusal") throw new Error(`${model} declined: ${refusal.refusal}`);
  if (!res.output_parsed) throw new Error(`${model} returned output that did not match the schema`);
  return res.output_parsed as z.infer<S>;
}

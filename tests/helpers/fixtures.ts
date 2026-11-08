import type { Campaign, Localized } from "@/lib/schemas";
import type { StoredCampaign } from "@/lib/campaign-store";

export const makeCampaign = (): Campaign => ({
  name: "Test Campaign",
  brief: {
    audience: "parents",
    hook: "better photos",
    markets: ["US", "DE"],
    channels: ["apple_search_ads"],
    avoid: ["TikTok Ads: refunds"],
    why: ["Good channel"],
  },
  concepts: ["a", "b", "c"].map((id) => ({
    id,
    name: `Concept ${id}`,
    visualPrompt: `photo ${id}`,
    headline: `Headline ${id}`,
    subline: `Subline ${id}`,
    cta: `Cta ${id}`,
  })),
  adCopy: [{ primaryText: "Primary", headline: "Ad headline", description: "Description" }],
  videoScript: { hook: "Hook", shots: [{ time: "0-3s", shot: "Shot", onScreenText: "Text" }], cta: "Go" },
  paywall: { headline: "Paywall", subtitle: "Sub", features: ["One", "Two", "Three", "Four", "Five", "Six"], cta: "Continue" },
});

export const makeStored = (over: Partial<StoredCampaign> = {}): StoredCampaign => ({
  id: "campaign-1",
  prompt: "A prompt",
  campaign: makeCampaign(),
  model: "test-model",
  createdAt: "2026-11-07T10:00:00.000Z",
  ...over,
});

/** A whole language where every banner line starts with `word`. */
export const makeLocalized = (word: string): Localized => ({
  concepts: ["a", "b", "c"].map((id) => ({ id, headline: `${word} наслов ${id}`, subline: `${word} подн ${id}`, cta: `${word} дугме ${id}` })),
  adCopy: [{ primaryText: `${word} primary`, headline: `${word} ad`, description: `${word} desc` }],
  videoScript: { hook: `${word} hook`, shots: [{ time: "0-3s", shot: `${word} shot`, onScreenText: `${word} text` }], cta: `${word} go` },
  paywall: {
    headline: `${word} paywall`,
    subtitle: `${word} sub`,
    features: ["1", "2", "3", "4", "5", "6"].map((n) => `${word} feature ${n}`),
    cta: `${word} continue`,
    plans: {
      annual: `${word} annual`,
      monthly: `${word} monthly`,
      weekly: `${word} weekly`,
      annualSuffix: ` ${word} per year`,
      monthlySuffix: ` ${word} per month`,
      trialPrefix: `${word} trial, `,
      perWeek: `/${word}`,
    },
    terms: `${word} terms`,
    privacy: `${word} privacy`,
  },
});

/** Calls a route handler with a JSON body and returns its status and parsed response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read whatever shape each route returns
export async function call<T = Record<string, any>>(handler: (req: Request) => Promise<Response>, body: unknown): Promise<{ status: number; json: T }> {
  const res = await handler(new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as T };
}

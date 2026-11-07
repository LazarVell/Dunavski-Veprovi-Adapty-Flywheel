/** Shapes the text model must return (enforced with structured outputs) and that the UI renders. */
import { z } from "zod";

export const ConceptSchema = z.object({
  id: z.string().describe("short slug, e.g. 'before-after'"),
  name: z.string(),
  visualPrompt: z
    .string()
    .describe("Prompt for a text-free photo visual. Must say: no text, no letters, no logos, no UI."),
  headline: z.string().describe("max 6 words"),
  subline: z.string().describe("max 12 words"),
  cta: z.string().describe("max 3 words"),
});

export type Concept = z.infer<typeof ConceptSchema>;

/** One banner changed as the user asked: words, picture, or both. */
export const BannerEditSchema = z.object({
  headline: z.string().describe("max 6 words; unchanged unless the request is about the words"),
  subline: z.string().describe("max 12 words; unchanged unless the request is about the words"),
  cta: z.string().describe("max 3 words; unchanged unless the request is about the words"),
  imageEdit: z
    .string()
    .describe("instruction for an image editor that changes the existing photo, 1-2 sentences; empty string when the picture stays as it is"),
  visualPrompt: z.string().describe("full description of the photo after the change; identical to the current one when the picture stays"),
  summary: z.string().describe("one short sentence for the user saying what changed"),
});
export type BannerEdit = z.infer<typeof BannerEditSchema>;

/** All banners rewritten to follow the growth lead's instructions. */
export const BannersRewriteSchema = z.object({
  concepts: z.array(
    z.object({ id: z.string(), headline: z.string(), subline: z.string(), cta: z.string(), visualPrompt: z.string() }),
  ),
  summary: z.string().describe("one short sentence for the user saying what changed"),
});

export const BannerCopySchema = z.object({
  concepts: z.array(z.object({ id: z.string(), headline: z.string(), subline: z.string(), cta: z.string() })),
});

export const CampaignSchema = z.object({
  name: z.string(),
  brief: z.object({
    audience: z.string(),
    hook: z.string(),
    markets: z.array(z.string()).describe("ISO country codes, best first"),
    channels: z.array(z.string()).describe("paid channels to fund: any of apple_search_ads, meta_ads, google_uac, tiktok_ads. Never organic."),
    avoid: z.array(z.string()).describe("short phrases: who/what to keep out, with the reason and number"),
    why: z.array(z.string()).describe("3-5 plain sentences, each quoting numbers from the fact sheet, no source labels"),
  }),
  concepts: z.array(ConceptSchema).describe("exactly 3 creative concepts; the first is the before/after AI edit"),
  adCopy: z
    .array(z.object({ primaryText: z.string(), headline: z.string(), description: z.string() }))
    .describe("3 variants to test"),
  videoScript: z.object({
    hook: z.string(),
    shots: z.array(z.object({ time: z.string(), shot: z.string(), onScreenText: z.string() })),
    cta: z.string(),
  }),
  paywall: z.object({
    headline: z.string().describe("message-matched to the ad, max 5 words"),
    subtitle: z.string().describe("max 10 words"),
    features: z.array(z.string()).describe("exactly 6 short benefit lines, max 5 words each"),
    cta: z.string().describe("max 2 words"),
  }),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** Everything that gets written per language (the brief stays in English). */
export const LocalizedSchema = z.object({
  concepts: z.array(z.object({ id: z.string(), headline: z.string(), subline: z.string(), cta: z.string() })),
  adCopy: z.array(z.object({ primaryText: z.string(), headline: z.string(), description: z.string() })),
  videoScript: z.object({
    hook: z.string(),
    shots: z.array(z.object({ time: z.string(), shot: z.string(), onScreenText: z.string() })),
    cta: z.string(),
  }),
  paywall: z.object({
    headline: z.string(),
    subtitle: z.string(),
    features: z.array(z.string()),
    cta: z.string(),
    plans: z.object({
      annual: z.string(),
      monthly: z.string(),
      weekly: z.string(),
      annualSuffix: z.string().describe("text after the yearly price, e.g. ' per year, best value'"),
      monthlySuffix: z.string().describe("text after the monthly price, e.g. ' per month, cancel anytime'"),
      trialPrefix: z.string(),
      perWeek: z.string(),
    }),
    terms: z.string(),
    privacy: z.string(),
  }),
});
export type Localized = z.infer<typeof LocalizedSchema>;

export const BackCheckSchema = z.object({
  lines: z.array(
    z.object({
      field: z.string(),
      backTranslation: z.string().describe("literal English back-translation of the localized line"),
      meaningChanged: z.boolean(),
      note: z.string().describe("empty when meaning is preserved"),
    }),
  ),
});
export type BackCheck = z.infer<typeof BackCheckSchema>;

export const NarrationSchema = z.object({
  cards: z.array(z.object({ id: z.string(), soWhat: z.string().describe("2 sentences max: what it means and what to do") })),
});
export type Narration = z.infer<typeof NarrationSchema>;

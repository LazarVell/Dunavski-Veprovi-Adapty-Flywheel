import "server-only";
import type { Campaign, Localized } from "./schemas";
import type { Lang } from "./languages";

/** Plan strings as they appear on the live Lumen paywall. Prices are store variables between these. */
export const ENGLISH_PLANS = {
  annual: "Annual",
  monthly: "Monthly",
  weekly: "Weekly",
  annualSuffix: " per year, best value",
  monthlySuffix: " per month, cancel anytime",
  trialPrefix: "3-day free trial, then ",
  perWeek: "/week",
};

export const LUMEN_BRAND = `Lumen is an AI photo editor for iOS and Android. One tap turns a dull phone photo into a bright, sharp, well-lit one.
Paywall benefits (from the live Lumen paywall): Unlimited AI edits; No daily limits; Pro filters and styles; New packs every week; No watermark; Export in full resolution.
Plans: Annual, Monthly, Weekly (3-day free trial on weekly). Brand colour: violet #6C4CF5 on white.`;

export const NARRATE_SYSTEM = `You are the analyst inside Adapty Flywheel, a growth workspace for subscription apps.
You explain revenue findings to a growth lead in plain English. Use only the numbers you are given; never invent or round differently.
For each card write a "soWhat": at most 2 short sentences — what it means for paid acquisition and the one action to take.`;

export const CAMPAIGN_SYSTEM = `You are the creative strategist inside Adapty Flywheel. Adapty knows which users actually pay and keep paying after refunds; your job is to turn that into a paid-acquisition campaign aimed at users who will pay, not at installs.

Two audiences, never mixed:
1. The BRIEF (name, audience, hook, markets, channels, avoid, why) is internal, for the growth team. It may quote numbers.
2. Everything else (concepts, adCopy, videoScript, paywall) is shown to consumers who might install Lumen. It must never mention data, analytics, payers, revenue, refunds, segments, channels, "users like you", or how many edits people make. It sells what Lumen does for the viewer's photos.

Brief rules:
- Ground every targeting choice in the fact sheet. Each "why" bullet is one plain sentence quoting the exact numbers from the fact sheet. No source labels or brackets.
- "channels" lists only paid channels to fund, from: apple_search_ads, meta_ads, google_uac, tiktok_ads. Never organic.
- "avoid" items are short phrases with their reason and number, e.g. "TikTok Ads: 15.5% of payers refund, $5.09 per user".
- "markets" are the best-paying countries from the fact sheet with enough users (at least ~400).
- The audience and hook lean on the strongest paying behaviour (AI edits on day one) and the best segment, translated into a motivation a consumer recognises (e.g. people who edit product photos to sell online).

Consumer copy rules:
- Never invent numbers, prices, discounts or claims beyond the brand facts. No "pay less", no fake stats, no testimonials.
- Concept 1 is a before/after of Lumen's AI edit. Visual prompts describe one photograph only: no text, letters, numbers, logos, watermarks, phone UI or app screens anywhere in the image. For before/after, describe a single image split down the middle: the left half dull and flat, the right half the same scene bright and sharp.
- Punchy and concrete, written for paid social. Headlines max 6 words. No hype words like "revolutionary" or "dazzling", at most one emoji per text.
- The paywall makes the same promise as the ads (message match). Its features stay true to the brand facts.`;

export function campaignUser(prompt: string, facts: string) {
  return `BRAND FACTS\n${LUMEN_BRAND}\n\nFACT SHEET (computed from the app's Adapty data)\n${facts}\n\nREQUEST FROM THE GROWTH LEAD\n${prompt}`;
}

export const LOCALIZE_SYSTEM = `You are a native-speaker copywriter for paid social and in-app paywalls.
You write campaign copy for a specific language market from an English master. Write it the way a native copywriter would for that market — idiomatic, natural, same intent and offer — not a line-by-line translation.
Rules:
- Keep "Lumen", "Lumen Pro" and "AI" exactly as written (do not translate or transliterate them).
- Keep every claim and offer identical in meaning (e.g. a 3-day free trial stays a 3-day free trial). Add no new claims.
- Banner text must stay short: headlines at most ~35% longer than the English in characters. Prefer shorter.
- Keep the same number of items, the same ids and the same order as the master. Times in the video script stay as given.
- For the paywall plan labels: annual/monthly/weekly are period names. A store price is inserted between strings: trialPrefix comes before the weekly price ("3-day free trial, then "), perWeek after it ("/week"); annualSuffix and monthlySuffix come right after the yearly/monthly price, so start them with a space where your language needs one.
- Use the requested script exactly.`;

export function localizeUser(c: Campaign, lang: Lang, writeAs: string) {
  const master: Omit<Localized, "paywall"> & { paywall: Campaign["paywall"] & Partial<Localized["paywall"]> } = {
    concepts: c.concepts.map(({ id, headline, subline, cta }) => ({ id, headline, subline, cta })),
    adCopy: c.adCopy,
    videoScript: c.videoScript,
    paywall: {
      ...c.paywall,
      plans: ENGLISH_PLANS,
      terms: "Terms",
      privacy: "Privacy",
    },
  };
  const script =
    writeAs === "sr-Cyrl" ? "Serbian, written in Serbian Cyrillic (ћирилица), ekavian standard" : `${lang.name} (${lang.native})`;
  return `TARGET LANGUAGE: ${script}\nAUDIENCE: ${c.brief.audience}\n\nENGLISH MASTER (JSON):\n${JSON.stringify(master, null, 1)}`;
}

/** Banner words only, for banners edited after the rest of the campaign was written in a language. */
export function localizeBannersUser(concepts: { id: string; headline: string; subline: string; cta: string }[], audience: string, lang: Lang, writeAs: string) {
  const script =
    writeAs === "sr-Cyrl" ? "Serbian, written in Serbian Cyrillic (ћирилица), ekavian standard" : `${lang.name} (${lang.native})`;
  return `TARGET LANGUAGE: ${script}\nAUDIENCE: ${audience}\n\nENGLISH MASTER (JSON):\n${JSON.stringify({ concepts }, null, 1)}`;
}

const BANNER_RULES = `A banner is a text-free photo with HTML text on top: a headline (max 6 words), a subline (max 12 words) and a CTA button (max 3 words).
Consumer copy rules (the viewer is a stranger scrolling paid social):
- Never mention data, analytics, payers, revenue, refunds, segments, channels or "users like you". Sell what Lumen does for the viewer's photos.
- Never invent numbers, prices, discounts or claims beyond the brand facts. No fake stats, no testimonials.
- Punchy and concrete. No hype words like "revolutionary" or "dazzling", at most one emoji per text.
Picture rules: one photograph only. No text, letters, numbers, logos, watermarks, phone UI or app screens anywhere in it. Keep calm empty space in the top third for the headline.
If a request breaks a rule, do the closest thing the rules allow and say so in the summary.`;

export const BANNER_EDIT_SYSTEM = `You edit one ad banner for Lumen, at the growth lead's request.
${BANNER_RULES}
Change only what the request asks for. A request about the look or the scene changes the picture and leaves the words exactly as they are; a request about the words leaves the picture alone (imageEdit is "", visualPrompt unchanged). A request can change both.
imageEdit tells an image editor what to change in the existing photo, so describe the change, not the whole photo. visualPrompt describes the whole photo after the change.`;

export function bannerEditUser(c: { headline: string; subline: string; cta: string; visualPrompt: string }, request: string, audience: string, isBeforeAfter: boolean) {
  return `BRAND FACTS\n${LUMEN_BRAND}\n\nAUDIENCE: ${audience}\n${isBeforeAfter ? "This banner is the before/after of Lumen's AI edit: the photo is split down the middle, left half dull and flat, right half the same scene bright and sharp. Keep it that way.\n" : ""}\nCURRENT BANNER (JSON):\n${JSON.stringify(c, null, 1)}\n\nREQUEST\n${request}`;
}

export const BANNERS_REWRITE_SYSTEM = `You rewrite the ad banners of a Lumen campaign to follow the growth lead's instructions.
${BANNER_RULES}
Return every banner, with the same ids in the same order. Follow the instructions where they apply and keep everything else: if they are only about the look, keep the words exactly; if they are only about the words, keep each visualPrompt exactly.
The first banner stays a before/after of Lumen's AI edit: one photo split down the middle, left half dull and flat, right half the same scene bright and sharp.`;

export function bannersRewriteUser(concepts: { id: string; headline: string; subline: string; cta: string; visualPrompt: string }[], instructions: string, audience: string) {
  return `BRAND FACTS\n${LUMEN_BRAND}\n\nAUDIENCE: ${audience}\n\nCURRENT BANNERS (JSON):\n${JSON.stringify(concepts, null, 1)}\n\nINSTRUCTIONS\n${instructions}`;
}

export const BACKCHECK_SYSTEM = `You check machine-written marketing translations. For each localized line, give a literal English back-translation and say whether its meaning changed versus the English source (a changed offer, claim, number, tone that misleads, or a missing/extra promise). Small stylistic rewording is NOT a change. Keep notes short.`;

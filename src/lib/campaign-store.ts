import "server-only";
import { readCache, writeCache } from "./cache";
import { factSheet } from "./insights";
import { visualUrls } from "./visuals";
import type { Campaign, Concept } from "./schemas";
import type { AdPaywall } from "./ads";

/** A banner as it was before an edit, for undo. `visualKeys` are its edited-photo overrides at the time (none = generated photo). */
export type BannerSnapshot = { concept: Concept; visualKeys: Record<string, string> };

export type StoredCampaign = {
  id: string; prompt: string; campaign: Campaign; model?: string; createdAt: string;
  /** Older single-paywall drafts (one per campaign). New drafts are per ad, in `adPaywalls`. */
  paywallFlow?: PaywallResult;
  /** One matched paywall per ad, keyed by Adapty app id, then concept id. */
  adPaywalls?: Record<string, Record<string, AdPaywall>>;
  /**
   * The campaign as the model first wrote it, kept once a banner is edited. Languages are written from it
   * (so their cache stays valid), and only the banners that differ from it are re-written on top.
   */
  base?: Campaign;
  /** Edited banner photos, `${conceptId}:${aspect}` -> image key. Unedited banners use the photo of their description. */
  visualKeys?: Record<string, string>;
  /** Earlier versions of each banner, oldest first. */
  bannerHistory?: Record<string, BannerSnapshot[]>;
  /** When each banner last changed, so a paywall draft made before that can say it is out of date. */
  bannerUpdatedAt?: Record<string, string>;
  /** The last instructions applied to all banners. */
  bannerInstructions?: string;
};
export type PaywallResult = { flowId: string; name: string; locales: string[]; createdAt: string; validation: string };

export const getCurrent = () => readCache<StoredCampaign>("campaigns", "current");
export const setCurrent = (c: StoredCampaign) => writeCache("campaigns", "current", c);

/** Merge one ad's Adapty state into the stored campaign (re-reads first, so parallel steps don't clobber each other). */
export function saveAdPaywall(app: string, p: AdPaywall) {
  const cur = getCurrent();
  if (!cur) return;
  const forApp = { ...(cur.adPaywalls?.[app] ?? {}), [p.conceptId]: p };
  setCurrent({ ...cur, adPaywalls: { ...(cur.adPaywalls ?? {}), [app]: forApp } });
}

/** Every number the model wrote in the brief must appear in the fact sheet we gave it. Returns the ones that don't. */
function unverifiedNumbers(lines: string[]) {
  const facts = factSheet();
  const known = new Set((facts.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const bad = new Set<string>();
  for (const line of lines) {
    for (const n of line.match(/\d+(?:\.\d+)?/g) ?? []) {
      const v = String(Number(n));
      // ignore small counts and ranges like "5-7" / "5+" that come from bucket labels
      if (Number(n) <= 13 && Number.isInteger(Number(n)) && !n.includes(".")) continue;
      if (!known.has(v)) bad.add(n);
    }
  }
  return [...bad];
}

/** What the Studio page gets for the current campaign: the campaign with its number check, and its banner photos. */
export async function campaignPayload(cur: StoredCampaign | null) {
  if (!cur) return { current: null, visuals: {} };
  return {
    current: {
      ...cur,
      base: undefined,
      bannerHistory: undefined,
      unverified: unverifiedNumbers([...cur.campaign.brief.why, ...cur.campaign.brief.avoid]),
      undoable: Object.fromEntries(Object.entries(cur.bannerHistory ?? {}).filter(([, v]) => v.length).map(([k, v]) => [k, v.length])),
    },
    visuals: await visualUrls(cur),
  };
}

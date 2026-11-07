import "server-only";
import { readCache, writeCache } from "./cache";
import type { Campaign } from "./schemas";
import type { AdPaywall } from "./ads";

export type StoredCampaign = {
  id: string; prompt: string; campaign: Campaign; model?: string; createdAt: string;
  /** Older single-paywall drafts (one per campaign). New drafts are per ad, in `adPaywalls`. */
  paywallFlow?: PaywallResult;
  /** One matched paywall per ad, keyed by Adapty app id, then concept id. */
  adPaywalls?: Record<string, Record<string, AdPaywall>>;
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

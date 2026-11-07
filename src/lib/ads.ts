/**
 * Ad names tie an ad to its paywall.
 * The Meta/TikTok ad is named exactly this; the attribution integration sends the name to Adapty as the
 * install's "creative", and the Adapty segment Flywheel creates matches on it. So users who tapped this
 * ad are the users who see this ad's paywall.
 */
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const adName = (campaignName: string, conceptId: string) => `flywheel_${slug(campaignName).slice(0, 40)}_${slug(conceptId)}`;

export const paywallFlowName = (campaignName: string, conceptName: string) => `Flywheel · ${campaignName} · ${conceptName}`.slice(0, 100);

export const segmentTitle = (ad: string) => `Flywheel · Ad: ${ad}`.slice(0, 100);

export const abTestTitle = (conceptName: string) => `Flywheel: current vs matched paywall (${conceptName})`.slice(0, 100);

/** What Flywheel created in Adapty for one ad. Stored with the campaign so every step is reused, never duplicated. */
export type AdPaywall = {
  conceptId: string;
  adName: string;
  flowId: string;
  flowName: string;
  locales: string[];
  validation: string;
  heroUrl: string | null;
  renderUrl?: string | null;
  builderUrl?: string | null;
  segmentId?: string;
  segmentTitle?: string;
  abTestId?: string;
  abTestTitle?: string;
  abTestError?: string;
  /** when Flywheel last wrote the flow's config, and when it last published it (published is current only if it's later) */
  configAt?: string;
  publishedAt?: string;
  publishError?: string;
  updatedAt: string;
};

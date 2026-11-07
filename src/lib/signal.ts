/**
 * Signal: what each install is worth, sent back to the ad platforms.
 *
 * Real: the model (data/derived/signal.json, fitted in scripts/precompute.ts) and its check on later users it never saw.
 * MOCKED: sending. The payloads below follow each platform's documented shape, but nothing goes to Meta, TikTok or Google:
 * their ad APIs need app review, same as Studio's publish button.
 */
import signal from "../../data/derived/signal.json";
import { CHANNEL_LABEL, COUNTRY_NAME, GOAL_LABEL } from "./insights";

export const S = signal;
export const FEATURES = ["channel", "country", "goal", "edits", "platform", "push"] as const;
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, string>;

export const FEATURE_LABEL: Record<Feature, string> = {
  channel: "Channel", country: "Country", goal: "Onboarding goal", edits: "AI edits on day one", platform: "Platform", push: "Push opt-in",
};
const EDITS_ORDER = ["0", "1-2", "3-4", "5-7", "8-12", "13+"];

export const valueLabel = (f: Feature, v: string) =>
  f === "channel" ? CHANNEL_LABEL[v] ?? v
  : f === "country" ? COUNTRY_NAME[v] ?? v
  : f === "goal" ? GOAL_LABEL[v] ?? v
  : f === "edits" ? `${v} edits`
  : f === "push" ? (v === "yes" ? "opted in" : "no push")
  : v;

/** The choices for each feature, in a sensible order for a select. */
export const OPTIONS: Record<Feature, string[]> = Object.fromEntries(
  FEATURES.map((f) => {
    const keys = Object.keys(signal.factors[f]);
    return [f, f === "edits" ? EDITS_ORDER.filter((k) => keys.includes(k)) : keys.sort((a, b) => valueLabel(f, a).localeCompare(valueLabel(f, b)))];
  }),
) as Record<Feature, string[]>;

export const TIER_NAMES = ["Lowest fifth", "Low", "Middle", "High", "Top fifth"] as const;

export function score(x: Features) {
  const factors = signal.factors as Record<Feature, Record<string, number>>;
  const breakdown = FEATURES.map((f) => ({ feature: f, label: valueLabel(f, x[f]), factor: factors[f][x[f]] ?? 1 }));
  const value = breakdown.reduce((p, b) => p * b.factor, signal.base);
  const tier = signal.tiers.filter((cut) => value >= cut).length; // 0..4
  return { value: Math.round(value * 100) / 100, tier, tierName: TIER_NAMES[tier], breakdown };
}

const EVENT = "lumen_value_24h";

/** Illustrative event bodies, one per platform. Not sent anywhere. */
export function payloads(x: Features, value: number, t: number) {
  const custom = { value, currency: "USD", predicted_window_days: 60, flywheel_tier: score(x).tier + 1 };
  return {
    Meta: {
      note: "Conversions API, app event (graph.facebook.com/{dataset_id}/events)",
      body: {
        data: [{
          event_name: EVENT, event_time: t, action_source: "app",
          user_data: { anon_id: "<adapty profile id>", madid: "<IDFA / GAID when allowed>" },
          app_data: { advertiser_tracking_enabled: 1, application_tracking_enabled: 1, extinfo: [x.platform === "iOS" ? "i2" : "a2"] },
          custom_data: custom,
        }],
      },
    },
    TikTok: {
      note: "Events API 2.0, app source (business-api.tiktok.com/open_api/v1.3/event/track/)",
      body: {
        event_source: "app", event_source_id: "<TikTok app id>",
        data: [{ event: EVENT, event_time: t, user: { idfa: "<when allowed>", external_id: "<hashed adapty profile id>" }, properties: custom }],
      },
    },
    Google: {
      note: "GA4 Measurement Protocol for Firebase apps, imported as a conversion with value",
      body: { app_instance_id: "<firebase app instance id>", events: [{ name: EVENT, params: custom }] },
    },
  };
}

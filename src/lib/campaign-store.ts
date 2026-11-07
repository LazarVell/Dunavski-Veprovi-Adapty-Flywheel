import "server-only";
import { readCache, writeCache } from "./cache";
import type { Campaign } from "./schemas";

export type StoredCampaign = { id: string; prompt: string; campaign: Campaign; model?: string; createdAt: string; paywallFlow?: PaywallResult };
export type PaywallResult = { flowId: string; name: string; locales: string[]; createdAt: string; validation: string };

export const getCurrent = () => readCache<StoredCampaign>("campaigns", "current");
export const setCurrent = (c: StoredCampaign) => writeCache("campaigns", "current", c);

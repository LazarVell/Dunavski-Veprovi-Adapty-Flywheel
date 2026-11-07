import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { adapty, APP_ID, withTempJson } from "@/lib/adapty";
import { buildPaywallDraft, type LocaleInput } from "@/lib/flow";
import { getCurrent, setCurrent } from "@/lib/campaign-store";
import { langByKey } from "@/lib/languages";
import type { Localized } from "@/lib/schemas";

const BASE_FLOW_NAME = process.env.ADAPTY_BASE_FLOW_NAME || "Main - 3 plans";

type FlowRow = { id: string; name: string; status: string };

async function baseConfig() {
  try {
    const list = await adapty<{ data: FlowRow[] }>(["flows", "list", "--app", APP_ID]);
    const row = list.data.find((f) => f.name === BASE_FLOW_NAME);
    if (!row) throw new Error(`No flow named "${BASE_FLOW_NAME}" in the app`);
    const env = await adapty<{ config: never }>(["flows", "config", "get", row.id, "--app", APP_ID]);
    return { config: env.config, baseFlowId: row.id, source: "live" as const };
  } catch (e) {
    // Offline fallback: the seed kit's flow file (placeholder product ids; fine for preview, not for creation)
    const file = path.join(process.cwd(), "data", "derived", "paywall-base.flow.json");
    return { config: JSON.parse(fs.readFileSync(file, "utf8")), baseFlowId: null, source: "offline" as const, error: (e as Error).message };
  }
}

/**
 * POST { locales: {lang, localized}[], create?: boolean }
 * Always: build the draft config and validate it against the base flow (advisory, saves nothing).
 * With create: true, create a NEW flow in Adapty and write the config as a draft. Never publishes.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { locales: { lang: string; localized: Localized }[]; create?: boolean };
  const cur = getCurrent();
  if (!cur) return NextResponse.json({ error: "No campaign yet" }, { status: 400 });

  const en = body.locales.find((l) => l.lang === "en");
  if (!en) return NextResponse.json({ error: "English copy is required" }, { status: 400 });
  const others: LocaleInput[] = body.locales
    .filter((l) => l.lang !== "en")
    .map((l) => ({ ...l, meta: langByKey(l.lang) }))
    .filter((l) => l.meta && !l.meta.rtl)
    .map((l) => ({ flowLocale: l.meta!.flowLocale, name: l.meta!.name, localized: l.localized }));

  const base = await baseConfig();
  const draft = buildPaywallDraft(base.config, en.localized, others);

  let validation = "skipped (offline)";
  if (base.baseFlowId) {
    try {
      await withTempJson(draft.config, (f) => adapty(["flows", "config", "validate", base.baseFlowId!, "--app", APP_ID, "--config-file", f]));
      validation = "publishable";
    } catch (e) {
      validation = `not publishable: ${(e as Error).message}`;
    }
  }

  if (!body.create) {
    return NextResponse.json({ dryRun: true, source: base.source, locales: draft.locales, replaced: draft.replaced, validation });
  }
  if (!base.baseFlowId) return NextResponse.json({ error: `Adapty CLI unavailable: ${"error" in base ? base.error : ""}` }, { status: 503 });

  const name = `Flywheel · ${cur.campaign.name}`.slice(0, 80);
  const created = await adapty<{ id?: string; data?: { id: string } }>(["flows", "create", "--app", APP_ID, "--name", name]);
  const flowId = created.id ?? created.data?.id;
  if (!flowId) return NextResponse.json({ error: "flows create returned no id", created }, { status: 502 });
  await withTempJson(draft.config, (f) => adapty(["flows", "config", "update", flowId, "--app", APP_ID, "--config-file", f]));

  const paywallFlow = { flowId, name, locales: draft.locales, createdAt: new Date().toISOString(), validation };
  setCurrent({ ...cur, paywallFlow });
  return NextResponse.json({ dryRun: false, ...paywallFlow });
}

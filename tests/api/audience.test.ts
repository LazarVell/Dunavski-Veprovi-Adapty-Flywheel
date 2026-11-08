import { beforeEach, describe, expect, it, vi } from "vitest";

const a = vi.hoisted(() => ({
  adapty: vi.fn(),
  findFlowByName: vi.fn(),
  findSegmentByTitle: vi.fn(),
  listAbTests: vi.fn(),
  placementIdByDevId: vi.fn(),
  publishFlow: vi.fn(),
}));
vi.mock("@/lib/cache", () => import("../helpers/memory-cache"));
vi.mock("@/lib/llm", () => ({ generate: vi.fn(), LlmUnavailable: class extends Error {}, openai: vi.fn(), withFallback: vi.fn() }));
vi.mock("@/lib/adapty", () => ({ ...a, appId: async () => "app1", unwrap: <T,>(x: T) => x }));

import { POST } from "@/app/api/audience/route";
import { getCurrent, setCurrent } from "@/lib/campaign-store";
import type { AdPaywall } from "@/lib/ads";
import { resetMemory } from "../helpers/memory-cache";
import { call, makeStored } from "../helpers/fixtures";

const paywall = (over: Partial<AdPaywall> = {}): AdPaywall => ({
  conceptId: "a",
  adName: "flywheel_test_a",
  flowId: "flow-1",
  flowName: "Flow",
  locales: ["en"],
  validation: "publishable",
  heroUrl: null,
  updatedAt: "2026-11-07T10:00:00.000Z",
  ...over,
});
const seed = (over: Partial<AdPaywall> = {}) => setCurrent(makeStored({ adPaywalls: { app1: { a: paywall(over) } } }));
const saved = () => getCurrent()!.adPaywalls!.app1.a;
const step = (s: string, conceptId = "a") => call(POST, { conceptId, step: s });
/** every argument the CLI was called with, as one list */
const cliArgs = () => a.adapty.mock.calls[0][0] as string[];

beforeEach(() => {
  resetMemory();
  Object.values(a).forEach((f) => f.mockReset());
  seed();
});

describe("segment", () => {
  it("creates a segment of this ad's installs", async () => {
    a.findSegmentByTitle.mockResolvedValue(null);
    a.adapty.mockResolvedValue({ id: "seg-1", title: "t" });
    const { json } = await step("segment");
    expect(cliArgs()).toContain("creative:IN:flywheel_test_a");
    expect(json.reused).toBe(false);
    expect(saved().segmentId).toBe("seg-1");
  });

  it("reuses one that already exists", async () => {
    a.findSegmentByTitle.mockResolvedValue({ id: "seg-old", title: "t" });
    const { json } = await step("segment");
    expect(a.adapty).not.toHaveBeenCalled();
    expect(json.reused).toBe(true);
    expect(saved().segmentId).toBe("seg-old");
  });
});

describe("publish", () => {
  it("publishes this ad's flow and clears the old test error", async () => {
    seed({ abTestError: "must be published first" });
    a.publishFlow.mockResolvedValue({ status: "published" });
    await step("publish");
    expect(a.publishFlow).toHaveBeenCalledWith("app1", "flow-1");
    expect(saved().publishedAt).toBeDefined();
    expect(saved().abTestError).toBeUndefined();
  });

  it("records a failure", async () => {
    a.publishFlow.mockRejectedValue(new Error("publication_failed"));
    const r = await step("publish");
    expect(r.status).toBe(502);
    expect(saved().publishError).toBe("publication_failed");
    expect(saved().publishedAt).toBeUndefined();
  });
});

describe("abtest", () => {
  const ready = () => {
    seed({ segmentId: "seg-1" });
    a.listAbTests.mockResolvedValue([]);
    a.placementIdByDevId.mockResolvedValue("place-1");
    a.findFlowByName.mockResolvedValue({ id: "base-flow", name: "Main - 3 plans", status: "published" });
  };

  it("needs the segment first", async () => {
    const r = await step("abtest");
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("segment");
  });

  it("creates a 50/50 test for that segment, current vs this ad's paywall", async () => {
    ready();
    a.adapty.mockResolvedValue({ ab_test_id: "t1" });
    const { json } = await step("abtest");
    const args = cliArgs();
    expect(args[args.indexOf("--segment") + 1]).toBe("seg-1");
    expect(args[args.indexOf("--placement") + 1]).toBe("place-1");
    expect(JSON.parse(args[args.indexOf("--flows") + 1])).toEqual([
      { flow_id: "base-flow", weight: 50, title: "A current" },
      { flow_id: "flow-1", weight: 50, title: "B matched" },
    ]);
    expect(json.state).toBe("draft");
    expect(saved().abTestId).toBe("t1");
  });

  it("never starts the test", async () => {
    ready();
    a.adapty.mockResolvedValue({ ab_test_id: "t1" });
    await step("abtest");
    expect(a.adapty).toHaveBeenCalledTimes(1);
    expect(cliArgs().slice(0, 2)).toEqual(["ab-tests", "create"]);
  });

  it("reuses a test with the same title", async () => {
    ready();
    a.listAbTests.mockResolvedValue([{ ab_test_id: "t-old", title: "Flywheel: current vs matched paywall (Concept a)", state: "draft" }]);
    const { json } = await step("abtest");
    expect(a.adapty).not.toHaveBeenCalled();
    expect(json.reused).toBe(true);
    expect(saved().abTestId).toBe("t-old");
  });

  it("explains that a flow has to be published first", async () => {
    ready();
    a.adapty.mockRejectedValue(new Error("adapty ab-tests create failed (exit 4): Flow must be published"));
    const r = await step("abtest");
    expect(r.status).toBe(422);
    expect(r.json.error).toContain("Publish this ad's paywall");
    expect(saved().abTestError).toContain("Publish this ad's paywall");
  });

  it("passes on any other error", async () => {
    ready();
    a.adapty.mockRejectedValue(new Error("Something else"));
    expect((await step("abtest")).json.error).toBe("Something else");
  });

  it("reports a missing base flow", async () => {
    ready();
    a.findFlowByName.mockResolvedValue(null);
    const r = await step("abtest");
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("Main - 3 plans");
  });
});

describe("requests", () => {
  it("needs a campaign", async () => {
    resetMemory();
    expect((await step("segment")).status).toBe(400);
  });

  it("rejects an unknown ad", async () => {
    expect((await step("segment", "zzz")).status).toBe(400);
  });

  it("needs the ad's paywall first", async () => {
    setCurrent(makeStored());
    const r = await step("publish");
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("paywall first");
  });

  it("says 502 when the CLI is unavailable", async () => {
    a.findSegmentByTitle.mockRejectedValue(new Error("not logged in"));
    expect((await step("segment")).status).toBe(502);
  });
});

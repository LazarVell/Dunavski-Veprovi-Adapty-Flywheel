import { describe, expect, it } from "vitest";
import { SIGNAL_ENABLED, STAGES } from "@/lib/stages";

describe("STAGES", () => {
  it("keeps Signal hidden while it is not being presented", () => {
    expect(SIGNAL_ENABLED).toBe(false);
    expect(STAGES.map((s) => s.href)).not.toContain("/signal");
  });

  it("numbers the presented stages 1 to 4, in order", () => {
    expect(STAGES.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(STAGES.map((s) => s.name)).toEqual(["Insights", "Creative Studio", "Funding", "Watch"]);
  });
});

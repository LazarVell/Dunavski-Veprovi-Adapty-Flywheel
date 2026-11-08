import { describe, expect, it } from "vitest";
import { batchSteps } from "@/lib/batch-steps";

type Step = { id: string; group?: string };
const ids = (steps: Step[]) => batchSteps(steps).map((b) => b.map((s) => s.id));

describe("batchSteps", () => {
  it("runs steps without a group one at a time, in order", () => {
    expect(ids([{ id: "a" }, { id: "b" }])).toEqual([["a"], ["b"]]);
  });

  it("runs consecutive steps of one group together", () => {
    expect(ids([{ id: "a" }, { id: "b", group: "g" }, { id: "c", group: "g" }, { id: "d" }])).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("does not merge a group that is split by another step", () => {
    expect(ids([{ id: "a", group: "g" }, { id: "b" }, { id: "c", group: "g" }])).toEqual([["a"], ["b"], ["c"]]);
  });

  it("keeps two neighbouring groups apart", () => {
    expect(ids([{ id: "a", group: "x" }, { id: "b", group: "y" }])).toEqual([["a"], ["b"]]);
  });

  it("handles an empty flow", () => {
    expect(ids([])).toEqual([]);
  });
});

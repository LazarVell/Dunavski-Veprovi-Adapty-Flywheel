import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadStudioSkill, STEP_IDS } from "@/lib/studio-skill";

const skill = (flow: string, art = "## Art direction\n\nBe an art director.\n") => `---\nname: x\n---\n\n## Flow\n\n${flow}\n\n${art}\n## Rules\n\n- none\n`;
const json = (steps: unknown) => "```json\n" + JSON.stringify({ steps }) + "\n```";
const withFile = (text: string) => vi.spyOn(fs, "readFileSync").mockReturnValue(text);

describe("the real SKILL.md", () => {
  const s = loadStudioSkill();

  it("loads without problems", () => expect(s.problems).toEqual([]));

  it("only has steps the page can run", () => {
    for (const step of s.steps) expect(STEP_IDS).toContain(step.id);
  });

  it("starts with the campaign", () => expect(s.steps[0].id).toBe("campaign"));

  it("never lets the page run the Adapty step by itself", () => {
    expect(s.steps.find((x) => x.id === "adapty")?.auto).toBe(false);
  });

  it("makes pictures and languages together", () => {
    const group = (id: string) => s.steps.find((x) => x.id === id)?.group;
    expect(group("visuals")).toBeDefined();
    expect(group("visuals")).toBe(group("languages"));
  });

  it("gives the art director only its own section", () => {
    expect(s.artDirection).toContain("art director");
    expect(s.artDirection).not.toContain("## Rules");
  });
});

describe("a skill file that changes or breaks", () => {
  it("follows the steps in the file", () => {
    withFile(skill(json([{ id: "campaign", title: "Only this" }])));
    const s = loadStudioSkill();
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0]).toMatchObject({ title: "Only this", auto: true, detail: "" });
    expect(s.problems).toEqual([]);
  });

  it("uses the art direction written in the file", () => {
    withFile(skill(json([{ id: "campaign", title: "x" }]), "## Art direction\n\nOnly black and white.\n"));
    expect(loadStudioSkill().artDirection).toBe("Only black and white.");
  });

  it("keeps but reports a step it doesn't know", () => {
    withFile(skill(json([{ id: "dance", title: "Dance" }])));
    const s = loadStudioSkill();
    expect(s.steps[0].id).toBe("dance");
    expect(s.problems[0]).toContain("dance");
  });

  it("falls back when the file is missing", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const s = loadStudioSkill();
    expect(s.steps.map((x) => x.id)).toEqual([...STEP_IDS]);
    expect(s.artDirection).toContain("art director");
    expect(s.problems[0]).toContain("not found");
  });

  it.each([
    ["broken JSON", "```json\n{ nope\n```", "invalid"],
    ["no JSON block", "just words", "No ```json"],
    ["no steps", "```json\n" + '{"steps":[]}' + "\n```", "invalid"],
    ["a step with no title", json([{ id: "campaign" }]), "invalid"],
  ])("falls back on %s", (_name, flow, problem) => {
    withFile(skill(flow));
    const s = loadStudioSkill();
    expect(s.steps.map((x) => x.id)).toEqual([...STEP_IDS]);
    expect(s.problems[0]).toContain(problem);
  });

  it("falls back when the art direction section is missing", () => {
    withFile(skill(json([{ id: "campaign", title: "x" }]), ""));
    const s = loadStudioSkill();
    expect(s.artDirection).toContain("art director");
    expect(s.problems[0]).toContain("Art direction");
  });

  it("keeps every default step safe", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadStudioSkill().steps.find((x) => x.id === "adapty")?.auto).toBe(false);
  });
});

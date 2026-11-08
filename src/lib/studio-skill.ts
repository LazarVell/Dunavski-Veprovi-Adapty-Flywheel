import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * The Creative Studio skill (.claude/skills/creative-studio/SKILL.md) is the page's playbook.
 * The app reads two parts of it: the JSON block under "## Flow" (which steps the page runs after the
 * user writes a campaign, and in what order) and the "## Art direction" section (the art director
 * model's instructions). The same file is a Claude Code skill for driving the Studio through the API.
 * Read on every request, so an edit to the file shows up on the next page load.
 */
export const SKILL_PATH = ".claude/skills/creative-studio/SKILL.md";

/** Steps the page knows how to run. A step id it doesn't know is shown and skipped. */
export const STEP_IDS = ["campaign", "art-direction", "visuals", "languages", "adapty"] as const;

const StepSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string().default(""),
  /** steps with the same group run together */
  group: z.string().optional(),
  /** false = never run by the page; shown as the user's next step */
  auto: z.boolean().default(true),
});
export type FlowStep = z.infer<typeof StepSchema>;

const DEFAULT_STEPS: FlowStep[] = [
  { id: "campaign", title: "Write the campaign", detail: "", auto: true },
  { id: "art-direction", title: "Write the art direction", detail: "", auto: true },
  { id: "visuals", group: "make", title: "Generate the pictures", detail: "", auto: true },
  { id: "languages", group: "make", title: "Write the languages for the markets", detail: "", auto: true },
  { id: "adapty", title: "Make each ad's paywall and onboarding in Adapty", detail: "", auto: false },
];

const DEFAULT_ART_DIRECTION = `You are the art director for a Lumen ad campaign. Given the campaign's audience and its banners' photo descriptions,
write their shared art direction in one or two sentences: who is in the pictures, the setting, the light and the mood.
Describe the look, not each banner. Leave out the before/after idea and the fixed rules (no text, no logos). At most 45 words.`;

/** The body of a "## Heading" section, up to the next "## ". */
function section(md: string, heading: string) {
  const m = md.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  return m?.[1].trim() ?? null;
}

export type StudioSkill = { source: string; steps: FlowStep[]; artDirection: string; problems: string[] };

export function loadStudioSkill(): StudioSkill {
  const problems: string[] = [];
  let md = "";
  try {
    md = fs.readFileSync(path.join(process.cwd(), SKILL_PATH), "utf8");
  } catch {
    problems.push(`${SKILL_PATH} not found; using the built-in flow`);
  }

  let steps = DEFAULT_STEPS;
  const flow = md && section(md, "Flow");
  const json = flow?.match(/```json\s*\n([\s\S]*?)```/)?.[1];
  if (md && !json) problems.push("No ```json block under ## Flow; using the built-in flow");
  if (json) {
    try {
      const parsed = z.object({ steps: z.array(StepSchema).min(1) }).parse(JSON.parse(json));
      steps = parsed.steps;
      const unknown = steps.filter((s) => !(STEP_IDS as readonly string[]).includes(s.id)).map((s) => s.id);
      if (unknown.length) problems.push(`Unknown step ${unknown.join(", ")}: shown, not run`);
    } catch (e) {
      problems.push(`## Flow JSON is invalid (${(e as Error).message.slice(0, 120)}); using the built-in flow`);
    }
  }

  const art = md && section(md, "Art direction");
  if (md && !art) problems.push("No ## Art direction section; using the built-in instructions");
  return { source: SKILL_PATH, steps, artDirection: art || DEFAULT_ART_DIRECTION, problems };
}

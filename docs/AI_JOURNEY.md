# AI journey (long version)

The full, step-by-step record behind [AI_LOG.md](../AI_LOG.md). The AI log is the required one-page summary; this file keeps the details and the reasoning behind each decision.

## Tools

| Tool | What we used it for |
|---|---|
| **Claude Code** (VS Code extension, model Claude Opus 5.5) | Research, setup, coding and writing. Our main pair programmer. |
| **Agent skills** (installed in this project's `.claude/skills/`) | Domain playbooks Claude loads when a task calls for one: Adapty, marketing and frontend design. |
| **Adapty Developer CLI** (`adapty`) | Reading and changing the Adapty account and analytics, used by Claude and by the Adapty skills |

## Our IDE

We both use **VS Code with the official Claude Code extension**. Why:

- **It feels good to work in.** We already know VS Code, so the AI fits into a familiar editor rather than adding a new tool to learn.
- **The terminal is right there.** We run the `adapty` CLI, scripts and the dev server in VS Code's built-in terminal, next to the Claude conversation.
- **Git history and diffs are one click away.** We can check earlier commits and commit messages to catch inconsistencies in what the AI changed, and review the AI's edits as diffs before keeping them.
- **Merge conflicts are easier to resolve.** With two of us committing to the same project, VS Code's merge view helps us resolve conflicts carefully and understand both sides.

## How we work with AI

- **We make the decisions; the AI researches, checks and does the work.** Claude suggests options and explains the trade-offs, and we choose. When we disagreed with a suggestion, we said so and Claude changed course (see entry 4).
- **We check claims before acting on them.** Blog posts and social media disagreed on star counts, skill counts and hackathon dates. We went to the GitHub repos themselves before deciding anything.
- **We read third-party code before installing it.** Skills are instructions Claude follows, and some include scripts. Before installing any, Claude listed every file, looked for hooks (scripts that run automatically), searched the scripts for network calls and shell commands, and reported what it found.
- **We keep the context lean.** Each installed skill costs some of the model's attention. We installed only what this project needs, and we didn't install skills that would compete with each other for the same requests.
- **We keep everything scoped to this project.** Every skill lives in this project's `.claude/skills/` folder. Nothing was installed for other projects on the machine.

---

## Journey log

### 1. Exploring Adapty's developer surfaces (Day 1)

Our challenge is to build a feature *for* Adapty. Adapty seeded a demo subscription app, "Lumen", with about 50k users of data. Before writing any code, we had Claude map what we can program against:

- The Developer CLI: analytics, paywalls, flows, A/B tests, segments and attribution
- Adapty's MCP server
- The server-side API and the Analytics Export API
- Webhooks
- Adapty's official agent skills

We also noted the limits, for example the analytics rate limits and that custom attributes can't be grouped on directly. Then we had Claude look through the Lumen data for patterns worth building around.

**Why:** knowing the platform's capabilities and gaps first keeps us from designing a feature the APIs can't support.

### 2. Looking for proven Claude Code skills

We asked Claude to find the Claude Code setup a past Anthropic hackathon winner had open-sourced. Claude found **Everything Claude Code** (`affaan-m/everything-claude-code`). It's a large collection: about 71 agents, 314 skills and 98 commands.

- **What we found:** the hackathon details were inconsistent across sources (different event names and dates), and we found no official Anthropic confirmation. The repo itself is real and very widely used.
- **Decision: we did not install it all.** The repo's own README warns that the full plugin advertises its whole catalog to the model and loads rules every session. For a 24-hour hackathon, that context is better spent on our data and code.
- **Takeaway:** a popular collection isn't automatically the right one. The skills that fit our task beat a big general bundle.

### 3. Installing Adapty's official skills

Since we're building *for* Adapty, Adapty's own skill pack (`adaptyteam/adapty-skills`, 14 skills) was the most relevant find. Examples: growth-advisor, ab-tests, paywall-teardown, flow-audit and adapty-docs.

- **We wanted them scoped to this project only.** The CLI's `adapty skills install` has no project-only option; it installs for every project on the machine. So Claude downloaded the official repo and copied the skill folders into `.claude/skills/` by hand.
- **Security review before installing:** no hooks. The bundled scripts only call the `adapty` CLI, check adapty.io links, or install an image-resizing library (`sharp`). Two skills (A/B tests and Apple Search Ads) can affect real users or spend money; both ask for confirmation first.
- **Left out on purpose:** the plugin also bundles Adapty's MCP server, which can read and write the account. We didn't add it, because we didn't ask for it and it needs a separate sign-in.

### 4. Choosing marketing and frontend skills

Part of our feature helps users write prompts for banners and marketing copy, and we need a polished UI. We asked Claude for options.

**Marketing:** from `coreyhaines31/marketingskills` (53 skills), we installed 8:
- product-marketing
- ad-creative
- image
- copywriting
- copy-editing
- social
- marketing-psychology
- aso

- We **skipped its `paywalls` and `ab-testing` skills**, because they overlap with Adapty's `paywall-teardown` and `ab-tests`. Two skills competing for the same requests leads to unpredictable results, and Adapty's versions fit this project better.
- We start with `product-marketing`: it writes one shared product/audience/voice file that the other marketing skills read, so the copy stays consistent.

**Frontend:** we installed Anthropic's official `frontend-design` skill. It's a single instructions file with no scripts.

**Where we pushed back:** Claude also suggested `ui-ux-pro-max`, a popular skill with a large design catalog and a Python search script. We questioned whether it was worth the weight. Claude agreed with our concerns:
- Most of its catalog is common design knowledge a frontier model already has.
- A lot of its size supports other AI coding tools and stacks we won't use.
- Every design decision would go through a script call, which costs time and context.
- It would compete with the design skills we already have.

We dropped it. The one useful part, a UX/accessibility checklist to run before shipping, we'll just do as a review step before the demo.

**Security review:** all 9 skills are Markdown only. The network calls in them are documented examples (Gemini image API, ElevenLabs, Hacker News, Bluesky) that only run when asked. We left out the skills' test files.

### Installed skills (current)

| Source | Skills |
|---|---|
| `adaptyteam/adapty-skills` | ab-tests, adapty-attribution, adapty-docs, adapty-integration, adapty-mail, ads-manager, audiences, flow-audit, flow-generator, growth-advisor, migrate-placements, onboarding-teardown, paywall-teardown, purchase-testing |
| `coreyhaines31/marketingskills` | product-marketing, ad-creative, image, copywriting, copy-editing, social, marketing-psychology, aso |
| `anthropics/skills` | frontend-design |

All are pinned to the versions downloaded on November 7, 2026. They don't update automatically.

### 5. Making Adapty's seed script run on Windows

- **Goal:** seed the Lumen demo app into our Adapty account using Adapty's script (`adapty-seed-data-hack/seed_adapty.py`) on a Windows machine.
- **How we used AI:** the script failed on Windows. Claude traced it to how the script starts the `adapty` CLI:
  - **The CLI wasn't found.** On Windows, npm installs `adapty` and `npx` as `.cmd` wrapper scripts, and Python's `subprocess` can't find those by bare name.
  - **Some arguments broke.** Running the `.cmd` wrapper sends arguments through `cmd.exe`, which treats characters like `>` in the filter `total_revenue_usd:>:0` as shell redirection.
- **Decision and why:** Claude changed only the `Cli` class. The script now uses the full path to the CLI, and on Windows it runs the CLI's own entry script with `node` directly, bypassing `cmd.exe`. On macOS and Linux it behaves exactly as before. **The change exists only for Windows compatibility.** The seeding logic and data are unchanged. The diff is saved as [`patches/seed_adapty-windows.patch`](../patches/seed_adapty-windows.patch).
- **What we checked or changed by hand:** we reviewed the diff (one class, 14 lines added and 4 removed, with comments explaining each Windows case) and ran the seeder successfully on November 6.

### 6. Checking our repo against the official rules

- **Goal:** make sure the repository matches what the organizers asked for before we write product code.
- **How we used AI:** we asked Claude to check for repo instructions in the organizers' Notion page. A plain web fetch returned only an empty JavaScript shell, so Claude read the page through Notion's public page-data endpoint instead. That page linked to the event site, which in turn linked to a second, more detailed **Participant Guide**. That guide has the real spec: README sections, an AI_LOG.md of ½–1 page with fixed contents, a demo video of 2 minutes at most, and the judging weights.
- **Decision and why:** our AI log had grown into a 3-page journal, so we split it. [AI_LOG.md](../AI_LOG.md) now follows the required format, and the detail moved here. We also added a README with the required sections, a `.gitignore` and `.env.example` for secrets, and kept Adapty's seed kit out of our repo, saving our one change to it as a patch.
- **What we checked or changed by hand:** the two official pages disagree in places (team size "up to 4" vs "1–3"; demo "5 minutes" vs "3 minutes"). We follow the more detailed Participant Guide and will confirm at the event.

---

<!-- New entries go above this line, numbered in order. Template:

### N. <What we did>

- **Goal:**
- **How we used AI:**
- **Decision and why:**
- **What we checked or changed by hand:**
-->

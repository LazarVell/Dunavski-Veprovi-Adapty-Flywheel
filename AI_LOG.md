# AI Log

How we used AI to build Adapty Flywheel at First Commit: Adapty Hackathon Belgrade (November 7–8, 2026). The step-by-step version, with the reasoning behind each decision, is in [docs/AI_JOURNEY.md](docs/AI_JOURNEY.md).

## Tools and what we used them for

| Tool | Used for |
|---|---|
| **Claude Code** (VS Code extension, Claude Opus 5.5) | Our main pair programmer: research, data analysis, coding, writing |
| **Adapty Developer CLI** | Reading and changing the Lumen demo account (analytics, flows, placements), called by Claude and by the Adapty skills |
| **OpenAI API** (inside the product) | GPT writes the campaign copy, every language, the back-translation check and the insight explanations, using structured outputs over numbers our code computed. The image API makes text-free banner visuals; all text on banners is rendered by us, in code. |

## Our setup

- **Rules and memory:** Claude Code's persistent project memory holds the event rules, our plan, data findings and environment quirks (for example, "run Python through PowerShell, not Bash"). [PLAN.md](PLAN.md) is the shared spec both of us and Claude work from.
- **Skills, scoped to this repo only** (`.claude/skills/`, 23 in total): Adapty's official pack (flow-generator, ab-tests, growth-advisor and others), 8 marketing skills, and Anthropic's frontend-design. We read every skill's files for hooks, scripts and network calls before installing it. We dropped overlapping skills so that two of them never compete for the same request.
- **MCP:** not connected on purpose. The Adapty MCP server can write to the account; the CLI gives us the same reads with commands we can see and review.
- **Subagents:** <!-- TODO: fill in once we use them (e.g. parallel research or a review agent before the demo) --> none yet.

## Prompts that worked well

1. *"check if there are instructions on how the repo should look for adaptys hackathon. also here: <Notion link>"* — Claude went past the empty page fetch, read Notion's page data directly, followed links to a second, more detailed guide, and came back with a gap list for our repo.
2. *(paraphrased)* "Find the Claude Code setup a past hackathon winner open-sourced, but check whether it's worth installing." — it surfaced a 300+ skill bundle and also the README's own warning about context cost, which is why we built a small, curated set instead.
3. *"research what we can add to app so we make it attractive to customers and users … we want to sell this!"* — Claude compared us with creative-analytics tools (Motion, Superscale, Segwise) and Adapty's own research. It picked "signal engineering" (send each install's predicted value back to the ad platforms) as the piece that closes our loop. Then it checked that this would hold up on our data before writing any code: on later users it never trained on, the top-scored fifth brought in 44% of revenue. That became stage 5, Signal.

## One thing AI got wrong, and how we caught it

Claude's saved memory said the judging criteria "were not published" and treated the AI log as an open-ended journal. Working from that, we had written a 3-page log. When we asked Claude to check the organizers' pages directly, it found the Participant Guide: fixed judging weights, and an AI log of ½–1 page with set contents. **Lesson:** memory is a cache, not a source. We now recheck rules against the official page before building on them.

## What we'd never delegate to AI

- **Numbers shown on stage.** Every figure in the demo is recomputed by a script from the raw data, not quoted from a chat.
- **Anything that touches real users or real money:** publishing a flow, starting an A/B test, ad spend. The AI drafts; we confirm.
- **Secrets.** API keys stay in `.env` and are never pasted into chat.
- **The call on what's real vs. mocked**, and the honesty of how we present it.

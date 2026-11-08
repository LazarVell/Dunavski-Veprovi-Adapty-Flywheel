# AI Log

The step-by-step version is in [docs/AI_JOURNEY.md](docs/AI_JOURNEY.md).

## Tools and what we used them for

| Tool | Used for |
|---|---|
| **Claude Code** (VS Code extension, Claude Opus 5.5) | Our main pair programmer: research, data analysis, coding, writing |
| **Adapty Developer CLI** | Reading and changing the Lumen demo account (analytics, flows, placements), called by Claude and by the Adapty skills |
| **OpenAI API** (inside the product) | GPT writes the copy, every language, the back-translation check and the insight explanations, as structured output over numbers our code computed. The image API makes text-free visuals; banner text is rendered in code. |

## Our setup

- **Rules and memory:** Claude Code's persistent project memory holds the event rules, our plan, data findings and environment quirks. [PLAN.md](PLAN.md) is our shared spec.
- **Skills, scoped to this repo** (`.claude/skills/`, 24 in total): 23 third-party (Adapty's official pack, 8 marketing skills, Anthropic's frontend-design), whose files we checked for hooks, scripts and network calls before installing. One is our own: `creative-studio`, the playbook the Studio page itself runs.
- **MCP:** not connected on purpose. The Adapty MCP server can write to the account; the CLI gives the same reads with commands we can review.
- **Subagents:** none. Everything ran in the main Claude session.
- **Checks:** 365 unit tests (`npm test`, no model or Adapty calls). In the product, a second model call back-translates each language and flags changed meaning.

## Prompts that worked well

1. *"check if there are instructions on how the repo should look for adaptys hackathon. also here: <Notion link>"* — Claude went past the empty page fetch, read Notion's page data directly, followed links to a second, more detailed guide, and came back with a gap list for our repo.
2. *(paraphrased)* "Find the Claude Code setup a past hackathon winner open-sourced, but check whether it's worth installing." — it surfaced a 300+ skill bundle and the README's own warning about context cost, so we built a small, curated set.
3. *"research what we can add to app so we make it attractive to customers and users … we want to sell this!"* — Claude compared us with creative-analytics tools (Motion, Superscale, Segwise) and picked "signal engineering": sending each install's predicted value back to the ad platforms. It tested this on our data before any code was written: on later users, adding day-one behaviour raised the top-scored fifth's share of 60-day revenue from 29.5% to 41.6%. We built it as a fifth stage, Signal, then switched it off for the demo.

## One thing AI got wrong, and how we caught it

Claude's saved memory said the judging criteria "were not published" and treated the AI log as an open-ended journal. Working from that, we had written a 3-page log. When we asked Claude to check the organizers' pages directly, it found the Participant Guide: fixed judging weights, and an AI log of ½–1 page with set contents. **Lesson:** memory is a cache, not a source. We now recheck rules against the official page before building on them.

## What we'd never delegate to AI

- **Numbers shown on stage.** Every data figure in the demo is computed by a script from the raw data, not quoted from a chat.
- **Anything that touches real users or real money:** publishing a flow, starting an A/B test, ad spend. The AI drafts; we confirm.
- **Secrets.** API keys stay in `.env` and are never pasted into chat.
- **The call on what's real vs. mocked.**

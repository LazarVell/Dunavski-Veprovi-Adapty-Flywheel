# Adapty Flywheel

**Find out who pays, make ads for those people, and fund the spend.**

Built at First Commit: Adapty Hackathon Belgrade, November 7–8, 2026.

> Status: in progress during the hackathon. Sections marked **TODO** are filled in as we build.

## What it does

Ad tools optimize for installs and clicks. Adapty knows which users actually pay, and keep paying after refunds. Flywheel is a workspace connected to an Adapty account that turns that knowledge into a loop:

```
  1. INSIGHTS ──► 2. CREATIVE STUDIO ──► 3. FUNDING ──► 4. WATCH
       ▲                                                    │
       └────────────────────────────────────────────────────┘
```

1. **Insights:** explains in plain English, with numbers, which users and channels make money (for example: Apple Search Ads users bring in $15.03 each in 60 days, TikTok users $5.09, and 15.5% of TikTok payers refund).
2. **Creative Studio:** turns those findings into a campaign pack: brief, ad copy, banners in several languages, a video script, and a **matching paywall draft created in Adapty**.
3. **Funding:** shows what the campaign costs, how much could be advanced against unpaid store revenue (Adapty Finance), and when it pays back.
4. **Watch:** follows the users the campaign brings in and posts Slack alerts (converting well, refund spike, creative fatigue).

## Who it's for

Growth and marketing leads at subscription apps who run paid acquisition. Today they judge campaigns by installs and cost per install in the ad platform, then find out weeks later in Adapty which users actually paid. The ads, the paywall and the funding decision are made in three separate tools.

## How to run it

Quick start (runs on the committed data and demo cache, no keys needed):

```bash
npm install
npm run dev        # http://localhost:3000
```

For live generation, copy `.env.example` to `.env` and add `OPENAI_API_KEY` (all AI in the app: copy, languages, meaning check, insight explanations and banner visuals) and optionally `SLACK_WEBHOOK_URL`. Drafting the paywall in Adapty needs the Adapty CLI, logged in.

To recompute the numbers from the raw dataset (optional; the results are committed in `data/derived/`):

1. Node.js 20+ and the Adapty CLI: `npm install -g adapty@latest`, then `adapty auth login`.
2. Adapty's demo-data kit, cloned into this folder (it's git-ignored and not part of our code):
   ```bash
   git clone https://github.com/kpotehin/adapty-seed-data-hack.git
   ```
   On Windows, apply our compatibility fix before seeding: `git -C adapty-seed-data-hack apply ../patches/seed_adapty-windows.patch`. Then seed **one new** Adapty app with `python seed_adapty.py`, following that repo's README.
3. Copy `.env.example` to `.env` and fill in the keys. For judging, we send test keys through the submission form, never in this repo.

```bash
npm run precompute   # reads adapty-seed-data-hack/data/offline/*.csv.gz, writes data/derived/*.json
```

## What's real and what's mocked

| Real | Mocked or assumed |
|---|---|
| Data analysis of the Lumen account and offline dataset, and GPT's explanations of it | Publishing to Meta/TikTok: we export an upload-ready pack instead, because their ad APIs need app review |
| Banner rendering and all ad copy, in every language | Adapty Finance fee rate (a setting, default 2.5%) and acquisition cost per channel (typed in; the seed data has no ad spend) |
| The matching paywall, created as a draft flow in Adapty, with its languages | Time passing in Watch: we replay a later group of users to stand in for "a week later" |
| Slack alerts through a real webhook | Demo visuals are generated ahead of time and cached; live generation is available |
| Image generation through the OpenAI API | |

All data is Adapty's synthetic Lumen demo app. No real user data is used.

## Architecture

One Next.js (TypeScript) app. Numbers are computed in code; the text model (OpenAI GPT) only writes words about numbers it is handed.

```
adapty-seed-data-hack/ (CSV.gz) ──► scripts/precompute.ts ──► data/derived/*.json (committed)
                                                                    │
  Insights page ◄── src/lib/insights.ts (cards, fact sheet) ◄───────┤
  Studio ──► /api/campaign  (GPT: brief, concepts, copy, script, paywall copy)
         ──► /api/localize  (GPT: each language from the English master; Serbian Cyrillic → Latin in code;
                             second call back-translates and flags changed meaning)
         ──► /api/visual    (OpenAI image API: one text-free visual per concept, reused for every language)
         ──► banners: React at real pixel size, text shrinks to fit, html-to-image → PNG, JSZip export pack
         ──► /api/paywall   (Adapty CLI: config get "Main - 3 plans" → add copy + locales → validate →
                             flows create + config update, as a draft; never published)
  Funding page ◄── src/lib/funding.ts (unpaid store revenue, per-channel revenue curves, payback, advance)
  Watch page   ◄── src/lib/watch.ts (weekly cohorts replayed; alerts) ──► /api/slack (incoming webhook)
```

- **Text model calls** (`src/lib/llm.ts`): the OpenAI Responses API (`gpt-5.5` by default, `OPENAI_TEXT_MODEL` to change it) with structured outputs (Zod schemas in `src/lib/schemas.ts`). Every result is cached in `data/demo-cache/` by its inputs, so the demo replays instantly and runs without keys.
- **Adapty CLI** (`src/lib/adapty.ts`): runs the CLI's own entry file with Node, no shell. The CLI is limited to 2 requests per second per app and never retries.

## What we'd do next

TODO: refine at the end. Current list:

- Pull real ad spend from Adapty Attribution instead of typed-in costs.
- Publish directly to the Meta and TikTok ad APIs once app review is done.
- Connect to Adapty Finance's real offer and eligibility.
- Measure creative performance per language and feed it back into Insights.

## Team

TODO: names and who did what.

| Who | What they did |
|---|---|
| Lazar | TODO |
| TODO | TODO |

## Pre-existing code and third-party material

Hackathon rule 1 asks us to disclose anything that wasn't written during the event:

- **Adapty's demo-data kit** ([kpotehin/adapty-seed-data-hack](https://github.com/kpotehin/adapty-seed-data-hack)), provided by the organizers. It is not committed here. Our only change to it, a Windows compatibility fix in the CLI launcher (made on November 6 to seed the account before the event), is in [`patches/seed_adapty-windows.patch`](patches/seed_adapty-windows.patch).
- **Agent skills** in `.claude/skills/`: third-party instruction files for Claude Code, copied unmodified, pinned to the versions of November 7, 2026:
  - 14 skills from [adaptyteam/adapty-skills](https://github.com/adaptyteam/adapty-skills)
  - 8 skills from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
  - `frontend-design` from [anthropics/skills](https://github.com/anthropics/skills)
- `data/derived/paywall-base.flow.json` is an unmodified copy of the kit's `flows/main.json`, used only as an offline fallback when the Adapty CLI can't fetch the live flow. The other files in `data/derived/` are aggregates our script computed from the kit's synthetic dataset.
- The Next.js starter files came from `create-next-app` 15.5.4.
- Everything else in this repo was written during the hackathon.

## How we used AI

See [AI_LOG.md](AI_LOG.md) for the summary and [docs/AI_JOURNEY.md](docs/AI_JOURNEY.md) for the full log.

## License

TODO: choose a license (rule 7: it's our call).

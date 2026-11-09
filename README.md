# Adapty Flywheel

**Find out who pays, make ads for those people, and fund the spend.**

Built at First Commit: Adapty Hackathon Belgrade, November 7–8, 2026.

## What it does

Ad tools optimize for installs and clicks. Adapty knows which users actually pay, and keep paying after refunds. Flywheel is a workspace connected to an Adapty account that turns that knowledge into a loop:

```
  1. INSIGHTS ──► 2. CREATIVE STUDIO ──► 3. FUNDING ──► 4. WATCH
       ▲                                                    │
       └────────────────────────────────────────────────────┘
```

1. **Insights:** explains in plain English, with numbers, which users and channels make money (for example: Apple Search Ads users bring in $15.03 each in 60 days, TikTok users $5.09, and 15.5% of TikTok payers refund).
2. **Creative Studio:** turns those findings into a campaign pack: brief, ad copy, banners in several languages, a video script, and, for each ad, a **matching paywall and a matching onboarding drafted in Adapty**, a segment of that ad's installs and draft A/B tests against the current flows.
3. **Funding:** shows what the campaign costs, how much could be advanced against unpaid store revenue (Adapty Finance), and when it pays back.
4. **Watch:** follows the users the campaign brings in and posts Slack alerts (converting well, refund spike, creative fatigue). A tired ad gets a one-click "make fresh variants" that reopens Creative Studio with a refresh request.

A fifth stage, Signal (a predicted value per install for the ad platforms), is built but switched off and not part of the demo. Its code stays in the repo behind `SIGNAL_ENABLED` in `src/lib/stages.ts`.

## Who it's for

Growth and marketing leads at subscription apps who run paid acquisition. Today they judge campaigns by installs and cost per install in the ad platform, then find out weeks later in Adapty which users actually paid. The ads, the paywall and the funding decision are made in three separate tools.

## How to run it

Copy `.env.example` to `.env`. To use every feature, connect all three services:

- **OpenAI:** `OPENAI_API_KEY`, for all AI in the app (copy, languages, meaning check, insight explanations and banner visuals).
- **Adapty:** the Adapty CLI (`npm install -g adapty@latest`, then `adapty auth login`), for the paywall, onboarding, segment and A/B test drafts. The account needs the seeded Lumen app; on a new account, follow [Full install](#full-install).
- **Slack:** `SLACK_WEBHOOK_URL`, for Watch alerts. Without it they only show as a preview.

Then:

```bash
npm install
npm run dev        # http://localhost:3000
```

For judging, we send test keys through the submission form, never in this repo.

The numbers on every page come from the committed `data/derived/` and need no key. The AI-written parts (insight explanations, campaigns, languages, banner images) are generated live: every new campaign is written from scratch, and nothing is reused from an earlier one. The current campaign, its languages and its pictures are saved locally in `data/demo-cache/` (not committed), so a reload doesn't write them again. Each campaign is kept when a new one replaces it, and can be reopened from Previous campaigns in the Studio.

Run the unit tests with `npm test` (`npm run test:watch` while working). They need no keys, make no model or Adapty calls, and don't touch `data/demo-cache/`.

### Full install

For a new machine and a new Adapty account. Needs Node.js 20+ and Python 3.9+. Seeding takes about 15 minutes.

1. Get the code:
   ```bash
   git clone https://github.com/LazarVell/Dunavski-Veprovi-Adapty-Flywheel.git
   cd Dunavski-Veprovi-Adapty-Flywheel
   npm install
   cp .env.example .env   # Windows: copy .env.example .env
   ```
2. Fill in `OPENAI_API_KEY` and `SLACK_WEBHOOK_URL` in `.env`. Leave `ADAPTY_APP_ID` empty: the app finds Lumen by its title.
3. Sign up at [app.adapty.io](https://app.adapty.io), then run `npm install -g adapty@latest` and `adapty auth login`.
4. From this repo's folder, get Adapty's demo-data kit (git-ignored, not part of our code) and seed the Lumen app. Run it only once:
   ```bash
   git clone https://github.com/kpotehin/adapty-seed-data-hack.git
   git -C adapty-seed-data-hack apply ../patches/seed_adapty-windows.patch   # Windows only
   cd adapty-seed-data-hack
   python3 seed_adapty.py   # Windows: python seed_adapty.py
   cd ..
   ```
   The script creates the app "Lumen - AI Photo Editor (Hackathon)". When it asks for the secret API key, copy it from Dashboard → Lumen app → App settings → General.
5. Start it with `npm run dev` and open http://localhost:3000.

To recompute the numbers from the raw dataset (optional; the results are committed in `data/derived/`), clone the kit into this folder as in step 4 and run `npm run precompute`. It reads `adapty-seed-data-hack/data/offline/*.csv.gz` and writes `data/derived/*.json`.

## What's real and what's mocked

| Real                                                                                                                                                           | Mocked or assumed                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analysis of Adapty's Lumen demo dataset (every number computed by our script), and GPT's explanations of it                                                    | Live account numbers: Insights, Funding and Watch use figures precomputed from the offline Lumen dataset, not read live from the account's analytics                                                                                      |
| Banner rendering and all ad copy, in every language                                                                                                            | Publishing to Meta/TikTok: we export an upload-ready pack instead, because their ad APIs need app review                                                                                                                                  |
| The matching paywall and onboarding, created as draft flows in Adapty (paywall in every language, onboarding in English), plus the segment and draft A/B tests | The Adapty Finance advance: an estimate from Adapty's published terms (up to 85%, fee 2.5%–3.25%, default 2.5%), with no real offer or eligibility check. Acquisition cost per channel is typed in, because the seed data has no ad spend |
| Slack alerts through a real webhook                                                                                                                            | Time passing in Watch: we replay a later group of users to stand in for "a week later"                                                                                                                                                    |
| Image generation through the OpenAI API                                                                                                                        | Ad click-through in Watch (used for the fatigue alert)                                                                                                                                                                                    |

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
                             flows create + config update, as a draft; published only on its own button,
                             because Adapty tests only published flows; A/B tests are created as drafts, never started)
         ──► /api/onboarding (Adapty CLI: config get "Onboarding - Weekly first" → ad picture + words on the welcome
                             screen → validate → flows create + config update as a draft; publish on its own button;
                             draft A/B test on the onboarding placement)
  Funding page ◄── src/lib/funding.ts (unpaid store revenue, per-channel revenue curves, payback, advance)
  Watch page   ◄── src/lib/watch.ts (weekly cohorts replayed; alerts) ──► /api/slack (incoming webhook)
```

- **Text model calls** (`src/lib/llm.ts`): the OpenAI Responses API (`gpt-5.5` by default, `OPENAI_TEXT_MODEL` to change it) with structured outputs (Zod schemas in `src/lib/schemas.ts`). Nothing is cached by its inputs: every call asks the model again. The current campaign keeps its own languages and meaning checks, so the check reads the same text that is on screen.
- **Creative Studio skill** (`.claude/skills/creative-studio/SKILL.md`): the Studio's playbook. The page runs its `## Flow` steps after a campaign is written (campaign → art direction → pictures and languages → hand-off to Adapty) and gives its `## Art direction` section to the art director model. The same file is a Claude Code skill for driving the Studio through the API.
- **Adapty CLI** (`src/lib/adapty.ts`): runs the CLI's own entry file with Node, no shell. The CLI is limited to 2 requests per second per app and never retries.

## What we'd do next

- Pull real ad spend from Adapty Attribution instead of typed-in costs.
- Publish directly to the Meta and TikTok ad APIs once app review is done.
- Generate the TikTok/Reels video by sending the script straight to Grok (the Studio's button is a placeholder for now).
- Connect to Adapty Finance's real offer and eligibility.
- Measure creative performance per language and feed it back into Insights.
- Add day-one behaviour to the predicted value Adapty Attribution already sends Meta. On the synthetic Lumen data, adding AI edits, onboarding goal and push opt-in to country, store, device and locale raised the top-scored fifth's share of 60-day revenue on later users from 29.5% to 41.6%.

## Team

| Who     | What they did |
| ------- | ------------- |
| Lazar   | Built the core Flywheel app (Insights, Creative Studio, Funding, Watch), the Studio director skill, unit tests and demo polish. |
| Nemanja | Built the ad-to-app match: a matching paywall and onboarding per ad in Adapty, the publish step, and the draft A/B test with its check. |

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

No license chosen yet.

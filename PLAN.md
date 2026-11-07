# Adapty Flywheel: plan synopsis

Agreed on 2026-11-07, day 1 of First Commit: Adapty Hackathon Belgrade.

**One line:** find out who pays, make ads for those people, and fund the spend.

**The pitch:** ad tools optimize for installs and clicks. Adapty knows which users actually pay and stay paying once refunds come out. With Adapty Finance it can also advance the money. Flywheel is a separate workspace, connected to an Adapty account, that joins these into one loop covering the app, its marketing and its finances.

```
  1. INSIGHTS ──► 2. CREATIVE STUDIO ──► 3. FUNDING ──► 4. WATCH
       ▲                                                    │
       └────────────────────────────────────────────────────┘
```

The demo uses the Lumen app already seeded in the Adapty account (app id `e27c8246-b940-45f0-a76e-5b119afbfa0a`; seed kit in `adapty-seed-data-hack/`).

---

## 1. Insights: who pays, and why
**What it does:** reads the account's revenue data and explains, in plain English with numbers, which users and channels make money.
- **Sources:** offline Lumen data (`adapty-seed-data-hack/data/offline/*.csv.gz`), plus `adapty analytics` CLI calls where the live account supports them.
- **Findings for the demo:**
  - Apple Search Ads users bring in about $15 each; TikTok users about $5, and 15.5% of TikTok payers refund.
  - 5 or more AI edits on the first day is the strongest sign a user will pay.
  - The best-paying markets are NL, US, DE, SE and GB.
- **Bonus alert:** the finished "Settings" A/B test probably declared the wrong winner.
- **Hands on to the next steps:** the creative brief (who to target, which hook, which markets) and the recommended languages.
- Recheck all numbers with a script before using them on stage.

## 2. Creative Studio: ads for the users who pay
**What it does:** from a prompt like "make a campaign for my paying users," it produces a full campaign pack built on what Insights found.
- **Creative brief:** the hook (AI edits), target markets, and what to avoid (TikTok-style audiences that refund).
- **Ad copy:** headlines and body text, with variants to test.
- **Banners:** TikTok/Reels, feed and story sizes. Two layers:
  - **Visuals (OpenAI image API, our own key):** one text-free image per creative concept, for example a before/after photo pair showing Lumen's AI edit. Generated once and reused for every language.
  - **Text (HTML templates, rendered to PNG):** GPT writes the localized copy and layout on top, using Lumen's brand colors and copy from the seed flows (`adapty-seed-data-hack/flows/*.json`).
  - Text never goes into the image model: it renders Cyrillic and long localized lines unreliably, and 11 languages would mean 11× the image calls. Overlaying it ourselves keeps every language exact and makes the language switcher instant.
  - Fallback if the image API fails or is slow: pre-generate the demo visuals and cache them on disk.
- **TikTok video script:** hook, shots and on-screen text.
- **Matching paywall (real):** a paywall variant that carries the same message as the ad, created as a draft flow in Adapty (`adapty flows create/validate`; see the flow-generator skill). Only Adapty can line up the ad and the paywall like this.
- **Export pack:** banners, a copy CSV and targeting JSON, ready to upload.
- **Mocked:** the "Publish to Meta/TikTok" button. Their ad APIs need app review, so we can't wire them up in a weekend.

## 3. Funding: pay for the campaign with Adapty Finance
**What it does:** shows how much the campaign costs, how much it can borrow against store revenue that's earned but not yet paid out, and when it pays back.
- **Unpaid revenue:** estimated from `transactions.csv`. Apple pays roughly 33 days after its fiscal month closes.
- **Advance:** up to 85% of that revenue, per Adapty's public page (https://adapty.io/finance/). The fee is a setting, defaulting to 2.5%; Adapty publishes a flat 2.5%–3.25% per advance.
- **Acquisition cost per channel:** typed in, because the seed data has no ad spend.
- **Payback:** acquisition cost compared with 60-day revenue per user, giving a payback in days.
- **Chart:** cash over time, with and without the advance.
- **Guardrail:** it recommends not funding TikTok, because that spend loses money once refunds come out.
- **Pitch hook:** Adapty's Welmi case study (https://adapty.io/case-studies/welmi-app/), where advances paid for ads and revenue grew 6x in 4 months.

## 4. Watch: did the campaign's users pay?
**What it does:** follows the users the campaign brought in and posts alerts to Slack.
- **Positive alert:** "Campaign users are converting at 31%, refunds are normal, keep going."
- **Warning alert:** "Refunds are spiking in MX, I suggest pausing it."
- **Creative fatigue:** a flag when an ad's results start dropping.
- **Mocked:** time passing. We replay a later group of users to stand in for "a week later".

---

## Multi-language content
- **Tier 1 (in the demo, checked by us):** English, Russian, Serbian, German, Spanish.
- **Tier 2 (marked "double-check before publishing"):** Portuguese (Brazil), French, Italian, Dutch, Swedish, Turkish.
- **Data-suggested languages (on top of the defaults):** any other language that is a strong market in the app's own data is offered too, with the same "double-check before publishing" warning.
  - **"Strong market" rule (a setting):** at least 3% of the app's revenue, or at least 300 users with revenue per user at or above the app average.
  - **In Lumen, only Japanese qualifies:** 4.4% of revenue, 1,196 users, $8.34 per user. Polish (2.7%, $4.88) and Hindi (1.5%, $1.39) fall below the threshold and appear in a collapsed "not suggested" list with their numbers.
  - **Where it shows up:** a "Suggested from your data" label with the reason (for example "4.4% of your revenue, 1,196 users").
- **Review warnings:** Tier 1 languages are marked "checked". Tier 2 and data-suggested languages show a yellow notice on every asset: "Machine-written. Have a native speaker check this before publishing." The export pack includes a `review_status` column and a list of what still needs review, and the first export asks for confirmation. Paywall languages go in only as drafts, never published automatically.
- **Scripts:** Latin and Cyrillic use Noto Sans. Japanese, Chinese and Korean use the matching Noto Sans fonts, loaded only when needed (the browser handles line breaking), and Hindi uses Noto Sans Devanagari. Right-to-left languages (Arabic, Hebrew) get copy only, with no banners or paywall, because the layout would need mirroring.
- **What gets translated:** ad copy, banners and video scripts, written for each language from the brief rather than translated line by line. "Lumen", plan names and "AI" stay the same in every language.
- **Paywall in Adapty (real):** languages are added to the draft flow itself. Flow JSON has a `locales` list (currently only `en`) and marks translatable strings with `_localizable`.
- **Insights choose the languages:** "Add German, Dutch and Swedish first" (those markets bring in $12–15 per user). It warns on Portuguese (Brazil) and Turkish (under $2 per user, and over 6% of payments fail).
- **Serbian:** Latin by default. Generated in Cyrillic and converted to Latin in code (љ→lj, њ→nj, џ→dž), so both versions always match. Converting Latin to Cyrillic isn't exact, so we avoid that direction. In the Adapty paywall flow, the locale code matters: `sr` means Cyrillic and `sr-Latn` means Latin. We add `sr-Latn`, plus `sr` if we want both.
- **Fonts:** Noto Sans covers every language we support. Each banner is tagged with its language (`lang="sr-Latn"`, `lang="sr-Cyrl"`, `lang="ru"`, and so on) so Serbian letter shapes render correctly.
- **Long text:** text shrinks to fit each banner size, and banners where it still overflows are flagged. German and Russian run about 20–35% longer than English.
- **Quality check:** GPT translates each version back into English and flags any line whose meaning changed.
- **Optional:** Insights explanations and Slack alerts in the team's own language. The interface stays in English.

---

## Demo script (about 3 minutes)
1. **Insights:** the TikTok vs Apple Search Ads gap, the AI-edit predictor, the best-paying markets, and the wrong A/B winner.
2. **Creative Studio:** type the prompt, show the campaign pack (the before/after visual of Lumen's AI edit leads it), then the language switcher: **English → Russian → Serbian → German, Spanish and the rest**. The matching paywall switches language alongside it.
3. **Funding:** the cost of the campaign, the advance, the payback period, and "don't fund TikTok."
4. **Watch:** a Slack alert arrives. Then back to the loop diagram.

## What's real and what's mocked

| Real | Mocked or assumed |
|---|---|
| Data analysis and GPT's explanations | Publishing to Meta/TikTok (we export a pack instead) |
| Banner rendering and all the copy | The fee rate and acquisition costs (both settings) |
| The paywall draft and its languages in Adapty | Time passing in Watch |
| The Slack webhook | Demo visuals are generated ahead of time and cached (live generation uses Flare) |
| Image generation through the OpenAI API (GPT Image 2.6) | |

## Build plan

| When | What |
|---|---|
| **Sat afternoon** | App skeleton and the Insights engine |
| **Sat evening** | Creative Studio: confirm the key can use both 2.6 image models, run one test call to check `max`/`complexity`, then wire up image generation, banner rendering, the paywall draft, and English/Russian/Serbian. Show this at the check-in. |
| **Sun morning** | Pre-generate and cache the demo visuals with Sunburst, the back-translation check, German and Spanish, Tier 2 languages, the Funding calculator, the Slack alert, then rehearsal |

**What to cut first if we run late:** the Tier 2 languages after the back-translation check, then live image generation on stage (show only cached visuals), then live CLI calls (falling back to offline data), then the video script, then Slack.

## Ask the Adapty team at the check-in
- What does Adapty Finance actually charge, and who qualifies?
- Does Adapty Attribution hold ad spend? If so, Funding could use real acquisition costs instead of typed-in ones.

## Still open
1. Team size and skills.
2. Stack: proposed Python (FastAPI) with a simple web UI.
3. The headline: Creative Studio leading with Funding as the closer, or Finance first.

## Environment notes
- Run Python and the `adapty` CLI through PowerShell, not Bash: the Bash tool fails on fnm.
- Don't rerun the seeder into the Lumen app, because it counts toward billing. Create a new app if fresh data is needed.
- The CLI analytics rate limit is 2 requests/sec per app, and the CLI never retries (exit code 4 means rate limited).
- Image generation uses the user's OpenAI API key, stored as `OPENAI_API_KEY` in a `.env` file that is never committed or pasted into chat. `gpt-image-1` was retired on 2026-10-23.
- Image models: `gpt-image-2.6-sunburst` for pre-generated demo visuals (best quality), `gpt-image-2.6-flare` for anything generated live on stage (faster). Confirm with `GET /v1/models` that the key can use both.
- Image settings: start at quality `high`. Only test `max`, and the `complexity` setting (passed as an extra body field), with a live call, because sources disagree on what OpenAI's API accepts. Generate each visual at the aspect ratio it will be shown at (9:16, 1:1, 4:5) and reuse it across languages.
- API usage is billed separately from a ChatGPT subscription.

---
name: creative-studio
description: Use when running Flywheel's Creative Studio, from a one-line campaign request to finished ads — "make a campaign for…", "run the studio", "write the banners", "make the visuals", "translate the campaign", "change this banner", "make the ad's paywall", "export the pack". Directs the whole flow in order, through the app's own API, and keeps its guardrails (never start an A/B test, flag machine-written languages, no invented numbers). The Studio page itself follows this file's Flow and Art direction sections.
---

# Creative Studio

Creative Studio turns one request ("A campaign for parents: kids' and holiday photos, in the US and Canada") into a
campaign aimed at the users who pay: a brief grounded in the Insights numbers, three ad concepts with banners in
every language, ad copy, a video script, and a paywall in Adapty that repeats the ad.

**This file is read by the app.** The Studio page runs the steps in **Flow** after the user writes the campaign, and
the art direction model is given the **Art direction** section as its instructions. Change them here and the page
follows on the next load. Everything else is for an agent (or a person) driving the Studio by hand.

## Flow

The page starts with the user's prompt and runs these groups in order; the steps inside one group run together.
`auto: false` steps are never run by the page: they are shown as the next thing for the user to do.

```json
{
  "steps": [
    { "id": "campaign", "title": "Write the campaign", "detail": "Brief, three concepts, ad copy, video script and paywall copy, from the prompt and the Insights fact sheet.", "auto": true },
    { "id": "art-direction", "title": "Write the art direction", "detail": "One line describing the look of all three pictures. It goes into the instructions box, where the user can change it and generate again.", "auto": true },
    { "id": "visuals", "group": "make", "title": "Generate the pictures", "detail": "A text-free photo per concept, portrait and square. The words are set on top in every language.", "auto": true },
    { "id": "languages", "group": "make", "title": "Write the languages for the markets", "detail": "Every language of the brief's markets, each checked against the English by back-translation.", "auto": true },
    { "id": "adapty", "title": "Make each ad's paywall and onboarding in Adapty", "detail": "Draft flows, the ad's segment, publish, and draft A/B tests. Each step is the user's click.", "auto": false }
  ]
}
```

## Art direction

You are the art director for a Lumen ad campaign. You get the campaign's audience and the photo descriptions of its
banners. Write the art direction they share, as one or two sentences a growth lead could edit: who is in the
pictures, the setting, the light and the mood. Describe the look, not each banner, and name nothing a camera can't
see. Keep the before/after idea out of it (it belongs to one banner only). Don't repeat the fixed rules (no text, no
logos, space for the headline): they are added to every picture anyway. At most 45 words.

## Rules

- **Numbers come from code.** The brief may quote only numbers from the Insights fact sheet; the page flags any
  number it can't find there. Consumer-facing words (banners, ad copy, script, paywall) never mention data, payers,
  refunds or segments, and never invent prices, discounts, stats or testimonials.
- **Languages.** Every translation is machine-written for that campaign, and no person has read it. Each one gets a
  machine back-translation check against the English. Only languages with users in the app's data are offered. Languages outside English, Serbian, German and Spanish,
  and any line whose meaning changed, are marked "needs native review" on screen and in the export pack. Serbian is written in Cyrillic and converted to
  Latin in code. Right-to-left languages get copy only, no banners.
- **Adapty.** Flywheel creates flows and A/B tests as drafts. It publishes a flow only when the user clicks
  "Publish" (Adapty only tests published flows; an unused flow reaches no one). It **never starts an A/B test**.
- **Cost.** Nothing is cached: every campaign, rewrite, edit and picture is a new model call, and the same prompt
  twice gives two different campaigns. Pictures cost the most and take up to a minute: change one banner with its own
  prompt box instead of regenerating all of them. A campaign's languages are written once and saved with it.

## Driving it from an agent

The app runs at `http://localhost:3000` (`npm run dev`). Every route takes and returns JSON (`POST`, `content-type: application/json`).

| Step | Call | Notes |
|---|---|---|
| Campaign | `/api/campaign` `{ "prompt": "…" }` | A new campaign every time, replacing the current one. Returns `current` and `visuals`. |
| Reopen a campaign | `/api/campaign` `{ "open": "<id>" }` | Brings a saved one back with its languages, pictures and edits, with no model call. Ids come from `previous` in any `/api/campaign` response. |
| Art direction | `/api/banner` `{ "action": "art-direction" }` | Writes the instructions line from the photo descriptions and stores it with the campaign. |
| Pictures | `/api/visual` `{ "conceptId": "…", "aspect": "portrait" \| "square" }` | A new photo for that banner, saved with the campaign. Only ask for ones whose `visuals` entry is `null`. `"live": true` uses the faster model. |
| Language | `/api/localize` `{ "lang": "de" }`, then `{ "lang": "de", "check": true }` | Written on the first request and saved with the campaign; the check reads that same text. Keys: `en sr-Latn sr-Cyrl de es pt-BR fr nl sv tr`, plus `ja pl hi ar` when the data suggests them. |
| All banners | `/api/banner` `{ "action": "rewrite", "instructions": "…" }` | Rewrites words and photo descriptions; then make the pictures whose `visuals` entry is `null`. |
| One banner | `/api/banner` `{ "action": "edit", "conceptId": "…", "instruction": "…" }` | Words, picture (edited in place) or both. `{ "action": "undo", "conceptId": "…" }` reverts. |
| Ad's paywall | `/api/paywall` `{ "create": true, "conceptId": "…", "locales": [{ "lang", "localized" }], "visualUrl": <square visual> }` | Draft flow in Adapty, validated. Needs the Adapty CLI, logged in. |
| Segment, publish, test | `/api/audience` `{ "conceptId": "…", "step": "segment" \| "publish" \| "abtest" }` | In that order. Ask the user before `publish`. The test is created as a draft. |
| Ad's onboarding | `/api/onboarding` `{ "conceptId": "…", "step": "flow" \| "publish" \| "abtest" }` | Same pattern, on the onboarding placement. Needs the paywall and segment first. |

Export (banners as PNG, ad copy CSV with review status, scripts, targeting JSON) is built in the browser: use the
page's **Download pack** button.

Order for a full run: campaign → art direction → pictures and the languages of the brief's markets → show the user
the banners → their edits → paywall → segment → (ask) publish → draft test. Stop there; starting the test is theirs.

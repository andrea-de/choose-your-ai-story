# Tales Unwritten

A gamebook that writes itself as you read. Pick a hero and a place (or roll the dice), and the opening page is written for you. Each choice says *turn to page 43*; the page turns, and if nobody has been there before, it is written on the spot. Every page is kept, so the next reader who makes the same choice finds the same page, and can branch off somewhere new.

Built for phones first. Every story is one of six kinds of book, each with its own paper, type, sketch style, page transition and voice:

| Theme | Look | Choices read | Changing pages |
|---|---|---|---|
| Historic fantasy | Parchment, dip-pen type, red drop cap, ink-sketch marginalia | turn to 43 | 3D page turn, forward or back |
| Future | Dark glass, scanlines, glowing cyan line art, words that decode | jump to LOG 043 | screen flare and shift |
| Noir | Typed case file, venetian-blind shadows, coffee ring, rubber stamps, sketches as clipped photos | see file No. 43 | top sheet pulled off the pile |
| Pirate | Captain's log over a sea chart with rhumb lines and compass roses | turn to 43 | 3D page turn |
| Dreamscape | A twilight sky with a slowly drifting aurora behind sheer pages, iridescent headings, glowing sketches over their own reflection | drift to 43 | the page dissolves as the next comes into focus |
| Ancient myth | Papyrus framed by a Greek key, carved initials, sketches painted in a terracotta disc like black-figure pottery | go to XLIII | the scroll rolls up, or unrolls back |

Words appear as they would be read (tap to read ahead), and a simple line sketch appears on most pages, chosen from a hand-drawn library and recoloured to suit each theme.

## Getting started

### What you need

- **Node.js 22 or newer.**
- **A Gemini API key** (optional). Without one, a built-in mock storyteller writes placeholder passages and sketches, so everything works offline.
  1. Go to [Google AI Studio → API keys](https://aistudio.google.com/apikey) and create a key.
  2. Set a spending cap in the Google Cloud console before sharing the app with anyone.

### Run it

```bash
git clone https://github.com/andrea-de/choose-your-ai-story
cd choose-your-ai-story
npm install
cp .env.example .env.local     # then put your key after GEMINI_API_KEY=
npm run dev
```

Open <http://localhost:3000>. The footer of the title page says *no storyteller key configured* while the mock is in use.

To read on your phone, join the same Wi-Fi and run `npm run dev -- -H 0.0.0.0`, then open `http://<your-computer's-IP>:3000`.

For a faster production build: `npm run build && npm start`.

### Settings (`.env.local`)

| Variable | Default | What it does |
|---|---|---|
| `GEMINI_API_KEY` | unset | Your key. Unset means the mock storyteller. |
| `AI_PROVIDER` | `gemini` if a key is set, else `mock` | Force `gemini` or `mock`. |
| `GEMINI_TEXT_MODEL` | `gemini-3.8-flash` | Model that writes the story. |
| `SKETCHES` | `library` | `library`: the model picks a drawing from the hand-drawn set, free. `generate`: an image model draws a new one per page (paid, needs billing). `off`: no sketches. |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-lite-image` | Only used with `SKETCHES=generate`. |
| `PREFETCH_CHOICES` | `true` | Write the pages behind each choice while the reader is still reading, so turning is instant. `false` halves text cost but makes readers wait. |
| `STORY_STORE` | `file` | `file` keeps stories in `.data/` across restarts; `memory` forgets them on restart. |

### What it costs

At Google's September 2026 prices, a page costs roughly **$0.005–0.01** of text, and library sketches cost nothing. A page is written once and every later reader sees it for free. Text prices for `gemini-3.8-flash` double on January 1, 2027. (With `SKETCHES=generate`, add about $0.034 per sketch.)

### Troubleshooting

- **"The quill slipped. Please try again."** Writing the page failed. The terminal running the server shows the real error. Tapping *Try the page again* retries.
- **Model not found errors.** Google renames models over time; set `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL` to current IDs from the [model list](https://ai.google.dev/gemini-api/docs/models).
- **Pages write but no sketches appear with `SKETCHES=generate`.** Image models need billing enabled on the key's project. The default `library` mode needs nothing extra.
- **Start fresh.** Stop the server and delete the `.data/` folder.

## How it works

- **One tree per story.** Pages are numbered 1–400 and handed out at random, like a real gamebook. Page 1 is always the start.
- **Written once.** The first reader to turn to a page triggers generation; concurrent readers wait for that one write (`StoryService.ensureWritten`, plus an atomic claim in the store).
- **Written ahead.** When a page is served, the pages behind its choices are generated in the background (`PREFETCH_CHOICES`).
- **Continuity.** Each story has a *bible* (world, characters, fixed rules). Each page records the facts it establishes or retires, and the model gets only the facts true on *that* branch.
- **Rules in code.** Page numbers and when a branch must end are decided in code (seeded, reproducible), never by the model.
- **Themes.** `src/lib/themes.ts` holds each theme's narration voice, presets and interface wording; `src/app/themes/*.css` holds its look.
- **Sketches.** Sixty hand-drawn SVGs live in `public/sketches/`, catalogued in `src/lib/sketches.ts`. About thirty are shared by every theme (people, places, weather and everyday objects); the rest are tagged with the themes they suit (a robot for Future, a revolver for Noir, a temple for Ancient…), so each story is offered roughly 40 that fit it. When writing a page, the model also picks the sketch that fits best (or none), avoiding the previous page's. Each shows one subject in black lines on white, and each theme recolours them in CSS. To add one, draw a 200×200 SVG in the same style, save it in `public/sketches/`, and add its id, a description and optionally `themes` to the catalogue.
- **Models.** Gemini text with structured JSON output writes each page; a Gemini image model draws each sketch. Both sit behind the `StoryTeller` interface in `src/lib/ai/`, so another provider can be swapped in.

## Tests

```bash
npm run check      # typecheck, lint, unit tests (Vitest)
npm run test:e2e   # Playwright on a phone and a desktop viewport, using the mock storyteller
```

## Storage

Stories are kept in memory and written to `.data/`. That suits local play and a single server. Hosting on serverless or several instances needs a database-backed `StoryStore` (for example Postgres or Firestore) and blob storage for sketches.

## History

This replaces a 2023 version (Next.js 13, OpenAI, MongoDB) whose commits are kept in this repository's history.

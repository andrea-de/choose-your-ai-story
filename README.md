# Tales Unwritten

A gamebook that writes itself as you read. Pick a hero and a place (or roll the dice), and the opening page is written for you. Each choice says *turn to page 43*; the page turns, and if nobody has been there before, it is written on the spot. Every page is kept, so the next reader who makes the same choice finds the same page, and can branch off somewhere new.

Built for phones first. Every story is one of four kinds of book, each with its own paper, type, sketch style, page transition and voice:

| Theme | Look | Choices read | Changing pages |
|---|---|---|---|
| Historic fantasy | Parchment, dip-pen type, red drop cap, ink-sketch marginalia | turn to 43 | 3D page turn, forward or back |
| Future | Dark glass, scanlines, glowing cyan line art, words that decode | jump to LOG 043 | screen flare and shift |
| Noir | Typed case file, venetian-blind shadows, coffee ring, rubber stamps, sketches as clipped photos | see file No. 43 | top sheet pulled off the pile |
| Pirate | Captain's log over a sea chart with rhumb lines and compass roses | turn to 43 | 3D page turn |

Words appear as they would be read (tap to read ahead), and a simple sketch appears on every page.

## Running it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY, or leave it blank for the mock storyteller
npm run dev
```

Without a key, a built-in mock storyteller writes placeholder passages and sketches, so the whole app works offline.

## How it works

- **One tree per story.** Pages are numbered 1–400 and handed out at random, like a real gamebook. Page 1 is always the start.
- **Written once.** The first reader to turn to a page triggers generation; concurrent readers wait for that one write (`StoryService.ensureWritten`, plus an atomic claim in the store).
- **Written ahead.** When a page is served, the pages behind its choices are generated in the background (`PREFETCH_CHOICES`).
- **Continuity.** Each story has a *bible* (world, characters, fixed rules). Each page records the facts it establishes or retires, and the model gets only the facts true on *that* branch.
- **Rules in code.** Page numbers and when a branch must end are decided in code (seeded, reproducible), never by the model.
- **Themes.** `src/lib/themes.ts` holds each theme's narration voice, sketch style, presets and interface wording; `src/app/themes/*.css` holds its look. Sketches are always requested as black lines on white, and each theme recolours them in CSS.
- **Models.** Gemini text (`gemini-3.8-flash`) with structured JSON output, and Gemini image (`gemini-3.1-flash-lite-image`) for the sketches. Override with `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL`.

## Tests

```bash
npm run check      # typecheck, lint, unit tests (Vitest)
npm run test:e2e   # Playwright on a phone and a desktop viewport, using the mock storyteller
```

## Storage

Stories are kept in memory and written to `.data/`. That suits local play and a single server. Hosting on serverless or several instances needs a database-backed `StoryStore` (for example Postgres or Firestore) and blob storage for sketches.

## History

This replaces a 2023 version (Next.js 13, OpenAI, MongoDB) whose commits are kept in this repository's history.

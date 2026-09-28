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

Nothing scrolls. Every screen is a sheet of the book: the title page, the choice of book, the new-tale form, the shelf of tales already begun, and each page of the story. A page too long for the screen runs on over several sheets, and you turn to the next one (tap *turn the leaf*, swipe, or use the arrow keys) with that book's own transition. Words and choices hold their place from the start, so nothing moves as it appears.

Every story opens on its **cover**: the title, what it is about, and a map of the story so far, with the pages you have read marked (tap one to go back to it), the pages other readers wrote, the paths nobody has taken yet, and the endings found.

The **menu ribbon** turns to the settings: sound effects, reading aloud, text size, how quickly words appear (or all at once), and whether pages turn with a flourish or simply fade. They are remembered in the browser.

When you begin a tale you pick up to two **moods** (eight shared ones, like funny, spooky or twisty, plus two of each book's own, like treasure-hunting for pirates or double-crossing for noir), and **who reads it aloud**: the book's own character narrator (an old sea dog, the ship's computer, a hardboiled gumshoe…) or a plain audiobook narrator.

Switch **narration** on in the settings to have new pages read aloud as you turn to them; tap any paragraph to hear it from there, and use the play/pause ribbon to stop and carry on. The narrator's pace can be slower or faster without changing the voice's pitch (the server stretches the audio with ffmpeg's `atempo`; without ffmpeg it plays at normal speed). Each kind of book has its own narrator, and the voice shifts with the tone you picked and with the mood of each page:

| Theme | Narrator | Voice |
|---|---|---|
| Historic fantasy | An old chronicler reading by the hearth | Gacrux |
| Future | The ship's archive intelligence replaying a mission log | Kore |
| Noir | The detective, alone at 3 a.m. in a 1940s radio drama | Algenib |
| Pirate | A grizzled bosun spinning a yarn in a dockside tavern | Fenrir |
| Dreamscape | A voice just behind your ear as you drift off | Achernar |
| Ancient myth | A rhapsode singing in a stone amphitheatre at dusk | Charon |

The narrator starts within about a second, even on a page nobody has heard, because the audio streams in as it is spoken. The words appear in time with the voice, and the sheet turns as the reading reaches the next one. Profiles, tone shifts and mood shifts live in `src/lib/voices.ts`.

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
| `NARRATION` | `on` | `off` removes reading aloud: no speaker button, and no page is ever recorded. |
| `SHOW_COSTS` | `true` | Each story's running cost (writing, narration, sketches) on its cover. `false` hides it from readers; it is still logged on the server and kept with the story. |
| `GEMINI_SPEECH_MODEL` | `gemini-3.8-flash-tts` | Model that reads pages aloud. `gemini-3.8-flash-lite-tts` is a third cheaper. |

### What it costs

At Google's September 2026 prices, a page costs roughly **$0.005–0.01** of text, and library sketches cost nothing. A page is written once and every later reader sees it for free. Text prices for `gemini-3.8-flash` double on January 1, 2027. (With `SKETCHES=generate`, add about $0.034 per sketch.)

Reading aloud costs about **$0.02 per page** (roughly a minute of audio, stored as a 3 MB WAV), and only for pages someone listens to. The first listener hears the narrator about a second after turning the page: the speech model streams, and the browser plays the audio as it arrives while the rest is still being recorded. The finished recording is kept for every later listener. Speech prices also double on January 1, 2027.

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
- **Sheets.** `Flow` lays a page out in CSS columns exactly one screen wide, so the browser does the pagination; the reader sees one column at a time, and `TurningBook` turns between them with the theme's transition. Each word's sheet is measured once, so the reveal (and the narrator) can start where a sheet starts.
- **Streaming speech.** The narration route sends raw PCM as the speech model produces it (about 2.5 times faster than it plays). Listeners who arrive mid-recording share it from the first byte (`LiveRecording`), and the finished WAV is stored. The browser plays it through Web Audio (`narrator.ts`); word timings start from an estimate and are corrected when the recording ends, long before the narrator does.
- **Voices.** Each page records a `mood` (hush, wonder, suspense, peril, sorrow, mirth or triumph), chosen by the model as it writes. The narration prompt combines the theme's narrator, the tone the reader picked and that mood, laid out the way Google's speech guide recommends (profile, director's notes, then the transcript). In plain prose, the model read the directions aloud too.
- **Models.** Gemini text with structured JSON output writes each page; a Gemini image model draws each sketch; a Gemini speech model reads pages aloud. All sit behind the `StoryTeller` interface in `src/lib/ai/`, so another provider can be swapped in.

## Tests

```bash
npm run check      # typecheck, lint, unit tests (Vitest)
npm run test:e2e   # Playwright on a phone and a desktop viewport, using the mock storyteller
E2E_PORT=3219 npm run test:e2e   # if port 3100 is taken
```

## Storage

Stories are kept in memory and written to `.data/`. That suits local play and a single server. Hosting on serverless or several instances needs a database-backed `StoryStore` (for example Postgres or Firestore) and blob storage for sketches.

## History

This replaces a 2023 version (Next.js 13, OpenAI, MongoDB) whose commits are kept in this repository's history.

# Promo media

Everything Tales Unwritten needs for promotion and social media, made from the running app: real tales, real screens, real page turns and the app's own sound. One command rebuilds the lot:

```bash
npm run promo        # tales → stills → videos → gallery
```

**Mobile only:** everything is 9:16, 4:5 or square. Needs `ffmpeg`, Playwright's Chromium, and the voice models (below).

Without `GEMINI_API_KEY` everything still runs, but the tales on screen are the mock storyteller's placeholders, read aloud by Kokoro. The voices, shots, cuts, timings and checks are final. The gallery says the tales are placeholders, and `promo:approve` refuses to approve them.

## Voices

Every spoken word is made locally by [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), so voices cost nothing and come out the same every time. Each take is listened to before it is kept: Whisper (`base.en`) transcribes it and a take that does not say its line fails the build, and its pitch is measured so no two speakers in a video sound alike.

| Who | Kokoro voice | Pitch |
|---|---|---|
| Presenter (the tour) | `am_michael` | ~118 Hz |
| Reader (the shorts) | `af_heart` | ~207 Hz |
| The app's narrator, placeholder tales only | one per book: `bm_fable`, `af_bella`, `am_fenrir`, `am_puck`, `bf_emma`, `bm_george` | 106–207 Hz |

With real tales the narrator is the app's own Gemini narration. `PROMO_VOICE=gemini` makes the presenter and reader with Gemini speech instead of Kokoro (paid; logged to `promo/voice/ledger.json`).

Setup, once per machine (about 350 MB):

```bash
python3 -m venv /opt/kokoro/venv
/opt/kokoro/venv/bin/pip install kokoro-onnx soundfile faster-whisper
cd /opt/kokoro && for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f; done
```

`KOKORO_DIR` and `KOKORO_PYTHON` point elsewhere if need be.

## The steps

| Command | What it does | Output |
|---|---|---|
| `npm run promo:content` | Begins each tale in `tales.json` through the app's own API, reads it along a path of choices, and records the narration for the pages the videos play. `node promo/content.mjs status` exits 0 when nothing is missing and spends nothing. | `promo/data/<storyteller>/` (`gemini/` is committed; `mock/` is not) |
| `npm run promo:stills` | The app's phone screens at 1080×1920, then compositions built in HTML in the app's own type: six 1080×1920 stories, six 1080×1350 feed posts and a 1080×1080 square. `--compose` re-composes without new screenshots. | `promo/out/stills/` |
| `npm run promo:video` | Every production in `productions/`: the promo tour and three social shorts, all 9:16. | `promo/out/video/` |
| `npm run promo:gallery` | The review page: every asset grouped by where it goes, each checked against that slot. | `promo/out/gallery/index.html` |
| `npm run promo:approve` | Copies the built gallery to `promo/gallery/` (tracked) with an `APPROVED` line. | `promo/gallery/` |

The app is served from a production build (`next build`, skipped when current) on a private port, over a throwaway copy of the promo tales, with `SHOW_COSTS=false`. Your own `.data/` is never touched: the server reads `STORY_DATA_DIR`.

## How the videos are made

- **Lines first.** Each production's spoken lines are voiced before anything is filmed, listened to and measured. Takes are kept in `promo/voice/` (committed) keyed by engine, voice, speed and words, so only an edited line is ever voiced again.
- **Beats.** Each production is a list of beats, each recorded as its own clip in a fresh browser. A beat drives the app the way a reader would (taps, typing, page turns) and waits on the real speech it carries. Frames come from Chromium's screencast (sharp text, unlike Playwright's video). Sound comes from the app's own Web Audio graph, so narration, sound effects and ambience are mixed exactly as a reader hears them, in sync to within about 10 ms.
- **Post-production.** Speech is laid at the moments the beat noted, with the app ducked under it (never muted). Subtitles, for the shorts, show only while words are spoken. Beats join with 0.35 s crossfades, loudness is set once over the whole cut (−16 LUFS), and the result is encoded H.264 High / AAC 48 kHz.
- **Checks, enforced.** Exact size, codecs, the slot's length limit, at least 1.5 s between the last word and the end, a full decode, and loudness. A line that runs past its beat, or starts over another line, fails the build. Each cut also gets a poster, its literal last frame and a contact sheet.

Options for `promo/video.mjs`: `--only tour` (or `short`, `short-bedtime`…), `--beat <name>` to retake one beat and re-mix the rest, `--post` to re-mix recorded beats without filming or paying anything (a reworded line keeps its place and takes its new length), `--skip-build`.

## Writing a production

A production (`productions/*.mjs`) names its speaker (`presenter` or `reader`, see `lib/voice.mjs`), its lines, and its beats. A beat has a `start` URL, an optional `before` (not filmed), and a `run` that gets `page`, `tap`, `wait`, `say(id)`, `mark`, `readAhead`, `tale(key)` and `endCard`. `endAtPause` ends a beat at the narrator's first pause after a mark.

House rules these follow, from the other projects' promo work:

- **Every shot is the real app.** The only thing laid over it is the closing card on the tour.
- **Shorts are not ads.** One plain reader's voice, no presenter, no logo card, no music added; subtitles only while it speaks, and a "sample voice: synthetic" note while a synthetic voice stands in for a real reader.
- **Lines stay true whatever the storyteller writes.** They describe what the app does, never what a particular page says.
- **Nobody talks over the narrator.** Say a line before the page turns, not after.
- **End on a pause.**

## Before the real run

With a Gemini key in the environment, `npm run promo` writes real tales (a few cents), and the app narrates them itself. Then:

1. Read the tales and look at every frame: a line, a post or a headline must match what the page actually shows.
2. `npm run promo:approve` and commit `promo/gallery/`, `promo/voice/` and `promo/data/gemini/`.

## Known app bug found while building this

In headless Chromium, the narrator's pause ribbon does not hold: it shows *Play* for about 300 ms, then the reading carries on. It also happens without the harness's audio hook. The bedtime short avoids it by switching narration on from the settings and ending at a pause in the reading.

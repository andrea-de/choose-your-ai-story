// The tales the promo media show, made by the app itself: each one begun,
// read along its path and read aloud through the same API a reader's browser uses.
//
//   node promo/content.mjs          make whatever is missing
//   node promo/content.mjs status   exit 0 when nothing is missing (spends nothing)
//
// With GEMINI_API_KEY set these are real tales and real voices, and their cost
// is written to promo/data/gemini/ledger.json. Without it the mock storyteller
// writes a dry run into promo/data/mock/.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { api, buildApp, DATA, log, PROMO, PROVIDER, startApp } from './lib/app.mjs'
import { heard, kokoro, listen } from './lib/voice.mjs'

const spec = JSON.parse(readFileSync(path.join(PROMO, 'tales.json'), 'utf8')).tales
const INDEX = path.join(DATA, 'tales.index.json')

export function readIndex() {
  return existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { provider: PROVIDER, tales: {} }
}

/** What is missing: tales never begun, pages along a path not yet written or recorded. */
function missing(index) {
  const out = []
  for (const tale of spec) {
    const made = index.tales[tale.key]
    if (!made) {
      out.push(`${tale.key}: not begun`)
      continue
    }
    if (made.pages.length < tale.path.length + 1 && !made.ended) out.push(`${tale.key}: ${made.pages.length}/${tale.path.length + 1} pages`)
    if ((made.narrated ?? 0) < tale.narrate) out.push(`${tale.key}: ${made.narrated ?? 0}/${tale.narrate} pages recorded`)
    if (PROVIDER === 'mock' && (made.voiced ?? 0) < (made.narrated ?? 0)) out.push(`${tale.key}: mock narration not yet read by a voice`)
  }
  return out
}

async function readPage(base, id, number) {
  // Pages behind a choice are written in the background; wait for one if need be.
  for (let i = 0; i < 120; i++) {
    const { page } = await (await api(base, `/api/stories/${id}/pages/${number}`)).json()
    if (page.status === 'ready') return page
    if (page.status === 'failed') throw new Error(`page ${number} of ${id} failed`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`page ${number} of ${id} never finished`)
}

async function make(index) {
  buildApp()
  const app = await startApp({ mockDelayMs: 200 })
  try {
    for (const tale of spec) {
      let made = index.tales[tale.key]
      if (!made) {
        log(`beginning “${tale.key}” (${tale.theme})`)
        const res = await (await api(app.url, '/api/stories', { method: 'POST', body: JSON.stringify({ theme: tale.theme, hero: tale.hero, setting: tale.setting, tone: tale.tone }) })).json()
        // The book's own narrator, fixed the way the cover's Begin button fixes it.
        await api(app.url, `/api/stories/${res.id}/voice`, { method: 'POST', body: JSON.stringify({ action: 'confirm' }) })
        made = { id: res.id, title: res.title, theme: tale.theme, pages: [res.firstPage], narrated: 0 }
        index.tales[tale.key] = made
      }
      // Along the path: each page's chosen choice names the next page.
      while (made.pages.length < tale.path.length + 1 && !made.ended) {
        const at = made.pages[made.pages.length - 1]
        const page = await readPage(app.url, made.id, at)
        if (page.isEnding) {
          made.ended = true
          break
        }
        const choice = page.choices[tale.path[made.pages.length - 1] % page.choices.length]
        await readPage(app.url, made.id, choice.page)
        made.pages.push(choice.page)
        log(`${tale.key}: page ${at} → ${choice.page}`)
      }
      // Recorded once, so the videos hear the narrator start at once.
      while ((made.narrated ?? 0) < Math.min(tale.narrate, made.pages.length)) {
        const number = made.pages[made.narrated]
        const res = await api(app.url, `/api/stories/${made.id}/pages/${number}/narration`)
        const bytes = (await res.arrayBuffer()).byteLength
        log(`${tale.key}: page ${number} read aloud (${(bytes / 48000).toFixed(1)} s)`)
        made.narrated = (made.narrated ?? 0) + 1
      }
      writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n')
    }
  } finally {
    await app.stop()
  }
  if (PROVIDER === 'mock') voiceMockNarration(index)
  writeLedger(index)
}

/**
 * The mock storyteller narrates with a hum. For the dry run, each recorded page
 * is read aloud instead by Kokoro, locally, in a voice for its kind of book,
 * and stored where the app keeps its narration, so the app plays it like any
 * other. A real (Gemini) run never comes here: its narration is the app's own.
 */
const MOCK_NARRATORS = {
  'historic-fantasy': { voice: 'bm_fable', speed: 0.95 },
  future: { voice: 'af_bella', speed: 1.0 },
  noir: { voice: 'am_fenrir', speed: 0.95 },
  pirate: { voice: 'am_puck', speed: 0.95 },
  dream: { voice: 'bf_emma', speed: 0.92 },
  ancient: { voice: 'bm_george', speed: 0.95 },
}

function voiceMockNarration(index) {
  const jobs = []
  for (const made of Object.values(index.tales)) {
    const saved = JSON.parse(readFileSync(path.join(DATA, 'stories', `${made.id}.json`), 'utf8'))
    for (let n = made.voiced ?? 0; n < (made.narrated ?? 0); n++) {
      const number = made.pages[n]
      const page = saved.pages.find((p) => p.number === number)
      jobs.push({ made, number, text: page.text, ...MOCK_NARRATORS[made.theme], out: path.join(DATA, 'narrations', `${made.id}-${number}.kokoro.wav`) })
    }
  }
  if (!jobs.length) return
  log(`reading ${jobs.length} mock page(s) aloud with Kokoro`)
  kokoro(jobs.map(({ text, voice, speed, out }) => ({ text, voice, speed, out })))
  const checks = listen(jobs.map((j) => j.out))
  for (const job of jobs) {
    const r = checks.find((c) => c.file === job.out)
    const share = heard(job.text, r?.text ?? '')
    if (share < 0.85) throw new Error(`${job.made.id} page ${job.number}: the reading does not say the page (${Math.round(share * 100)}% heard)`)
    // The app's own format: 16-bit mono WAV at 24 kHz, a plain header, in place of the hum.
    const bin = path.join(DATA, 'narrations', `${job.made.id}-${job.number}.bin`)
    const r2 = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', job.out, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', '-bitexact', '-map_metadata', '-1', '-f', 'wav', `${bin}.tmp`])
    if (r2.status !== 0) throw new Error(`ffmpeg: ${r2.stderr}`)
    renameSync(`${bin}.tmp`, bin)
    spawnSync('rm', ['-f', job.out])
    job.made.voiced = Math.max(job.made.voiced ?? 0, job.made.pages.indexOf(job.number) + 1)
    log(`${job.made.id} page ${job.number}: read by ${job.voice} (${Math.round(share * 100)}% heard, ${r.f0} Hz)`)
  }
  writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n')
}

/** What the tales cost to make, read from the stories' own running costs. */
function writeLedger(index) {
  const rows = []
  for (const [key, made] of Object.entries(index.tales)) {
    const file = path.join(DATA, 'stories', `${made.id}.json`)
    if (!existsSync(file)) continue
    const cost = JSON.parse(readFileSync(file, 'utf8')).story.cost
    const usd = cost ? cost.text.usd + cost.speech.usd + cost.image.usd : 0
    rows.push({ key, id: made.id, text: cost?.text.usd ?? 0, speech: cost?.speech.usd ?? 0, image: cost?.image.usd ?? 0, usd })
  }
  const total = rows.reduce((s, r) => s + r.usd, 0)
  writeFileSync(path.join(DATA, 'ledger.json'), JSON.stringify({ provider: PROVIDER, total, tales: rows }, null, 2) + '\n')
  log(`tales cost $${total.toFixed(4)} (${PROVIDER})`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  const index = readIndex()
  if (process.argv[2] === 'status') {
    const gaps = missing(index)
    console.log(gaps.length ? gaps.join('\n') : `all ${spec.length} tales made (${PROVIDER})`)
    process.exit(gaps.length ? 1 : 0)
  }
  await make(index)
  const gaps = missing(index)
  if (gaps.length) {
    console.error(gaps.join('\n'))
    process.exit(1)
  }
}

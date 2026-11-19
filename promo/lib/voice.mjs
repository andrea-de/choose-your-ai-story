// Spoken lines for the videos: the presenter of the tour and the reader who
// talks through the social shorts. Each take is made once and kept in
// promo/voice/ (committed), keyed by everything that shapes it (engine, voice,
// speed or direction, words), so only an edited line is ever made again.
//
// The voice is Kokoro-82M, run locally (Apache-2.0; see lib/kokoro_tts.py for
// where the model lives): free, deterministic, and good enough to publish.
// PROMO_VOICE=gemini uses Gemini speech instead (paid; spend in promo/voice/ledger.json).
//
// Every take is checked by ear: Whisper transcribes it (lib/listen.py) and a
// take that does not say its words fails, and its pitch is measured.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PROMO, log } from './app.mjs'

export const ENGINE = process.env.PROMO_VOICE ?? 'kokoro'
export const SPEECH_MODEL = process.env.GEMINI_SPEECH_MODEL ?? 'gemini-3.8-flash-tts'
const KOKORO_PY = process.env.KOKORO_PYTHON ?? '/opt/kokoro/venv/bin/python'
const LIB = path.join(PROMO, 'lib')
const DIR = path.join(PROMO, 'voice')
const LEDGER = path.join(DIR, 'ledger.json')
const RATE = 24000

/**
 * Who speaks. Kept apart from each other and from the app's narrators by
 * pitch and accent (measured: presenter ~118 Hz, reader ~207 Hz).
 */
export const SPEAKERS = {
  presenter: {
    kokoro: { voice: 'am_michael', speed: 1.0 },
    gemini: { voice: 'Iapetus', style: 'a calm, friendly guide, plainly spoken, unhurried, no announcer voice' },
  },
  reader: {
    kokoro: { voice: 'af_heart', speed: 1.0 },
    gemini: { voice: 'Sulafat', style: 'her ordinary speaking voice, telling a friend about something, plain, no performance' },
  },
}

function keyOf(speaker, text) {
  const s = SPEAKERS[speaker][ENGINE]
  const parts = ENGINE === 'gemini' ? ['gemini', SPEECH_MODEL, s.voice, s.style, text] : ['kokoro-v1.0', s.voice, String(s.speed), text]
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16)
}

export function probeSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return Number(r.stdout.trim())
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg ${argv.join(' ')}\n${r.stderr}`)
}

/** Mono 16-bit at 24 kHz with a plain header, without the silence a take comes back with. */
function normalise(file) {
  const tmp = file.replace(/\.wav$/, '.tmp.wav')
  // Only near-silence counts, so a word's soft last sound ("shoes") is kept.
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse'
  ffmpeg(['-i', file, '-af', trim, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', '-bitexact', '-map_metadata', '-1', tmp])
  renameSync(tmp, file)
}

/** Runs Kokoro once for any number of lines: [{ text, voice, speed, out }]. */
export function kokoro(jobs) {
  if (!jobs.length) return
  if (!existsSync(KOKORO_PY)) throw new Error(`no Kokoro at ${KOKORO_PY}: see promo/README.md, “Voices”`)
  const list = path.join(DIR, `.jobs-${process.pid}.json`)
  mkdirSync(DIR, { recursive: true })
  writeFileSync(list, JSON.stringify(jobs))
  const r = spawnSync(KOKORO_PY, [path.join(LIB, 'kokoro_tts.py'), list], { encoding: 'utf8', maxBuffer: 1 << 24 })
  spawnSync('rm', ['-f', list])
  if (r.status !== 0) throw new Error(`Kokoro failed:\n${r.stderr.slice(-1500)}`)
}

/** Transcript and median pitch of each file, from Whisper and an autocorrelation. */
export function listen(files) {
  if (!files.length) return []
  const r = spawnSync(KOKORO_PY, [path.join(LIB, 'listen.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 24 })
  if (r.status !== 0) throw new Error(`listening failed:\n${r.stderr.slice(-1500)}`)
  return r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
}

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/** Words to compare: a transcriber writes "Page 1" for "Page one", so small numerals become words. */
const words = (s) => (s.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? []).map((w) => (/^\d+$/.test(w) && Number(w) < NUMBERS.length ? NUMBERS[Number(w)] : w))

/** Share of the script's words heard, in order (a longest common subsequence). */
export function heard(script, transcript) {
  const a = words(script)
  const b = words(transcript)
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return a.length ? dp[a.length][b.length] / a.length : 1
}

async function geminiTake(speaker, text, file) {
  if (!process.env.GEMINI_API_KEY) throw new Error('PROMO_VOICE=gemini needs GEMINI_API_KEY')
  const s = SPEAKERS[speaker].gemini
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      stream: true,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: s.style }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: s.voice.toLowerCase() }] },
    }),
  })
  if (!res.ok || !res.body) throw new Error(`speech failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const chunks = []
  let usage
  let buffer = ''
  const decoder = new TextDecoder()
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true })
    let at
    while ((at = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, at)
      buffer = buffer.slice(at + 2)
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
      if (!data || data === '[DONE]') continue
      const event = JSON.parse(data)
      if (event.event_type === 'step.delta' && event.delta?.data) chunks.push(Buffer.from(event.delta.data, 'base64'))
      else if (event.event_type === 'interaction.completed') usage = event.interaction?.usage
      else if (event.event_type === 'error' || event.error) throw new Error(`speech failed: ${JSON.stringify(event).slice(0, 300)}`)
    }
  }
  const pcm = Buffer.concat(chunks)
  if (!pcm.length) throw new Error(`no audio for “${text}”`)
  const raw = file.replace(/\.wav$/, '.pcm')
  writeFileSync(raw, pcm)
  ffmpeg(['-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', raw, file])
  spawnSync('rm', ['-f', raw])
  // The prices the app charges itself (src/lib/ai/pricing.ts): $0.5/M in, $9/M out.
  const usd = ((usage?.total_input_tokens ?? 0) * 0.5 + (usage?.total_output_tokens ?? 0) * 9) / 1e6
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { total: 0, takes: [] }
  ledger.takes.push({ at: new Date().toISOString(), model: SPEECH_MODEL, voice: s.voice, text, usd })
  ledger.total = ledger.takes.reduce((sum, t) => sum + t.usd, 0)
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n')
}

/**
 * Takes for every line of a speaker, made if missing (never with `post`, which
 * may not create anything) and checked. Returns { id: { file, seconds, text, f0 } }.
 */
export async function takes(speaker, lines, { post = false } = {}) {
  mkdirSync(DIR, { recursive: true })
  const out = {}
  const missing = []
  for (const [id, text] of Object.entries(lines)) {
    const file = path.join(DIR, `${speaker}-${keyOf(speaker, text)}.wav`)
    out[id] = { file, text, speaker }
    if (!existsSync(file)) missing.push(out[id])
  }
  if (missing.length && post) throw new Error(`--post: no take yet for ${missing.map((m) => `“${m.text}”`).join(', ')}`)
  if (missing.length) {
    log(`voicing ${missing.length} ${speaker} line(s) with ${ENGINE}`)
    if (ENGINE === 'gemini') for (const m of missing) await geminiTake(speaker, m.text, m.file)
    else kokoro(missing.map((m) => ({ text: m.text, ...SPEAKERS[speaker].kokoro, out: m.file })))
    for (const m of missing) normalise(m.file)
    // New takes are listened to before they are kept: one that does not say its words is thrown away.
    for (const r of listen(missing.map((m) => m.file))) {
      const m = missing.find((x) => x.file === r.file)
      const share = heard(m.text, r.text)
      writeFileSync(m.file.replace(/\.wav$/, '.json'), JSON.stringify({ engine: ENGINE, ...SPEAKERS[speaker][ENGINE], text: m.text, heard: r.text, match: +share.toFixed(3), f0: r.f0 }, null, 2) + '\n')
      if (share < 0.9) {
        spawnSync('rm', ['-f', m.file])
        throw new Error(`take does not say its line (${Math.round(share * 100)}% heard): “${m.text}” → “${r.text}”`)
      }
    }
  }
  for (const t of Object.values(out)) {
    t.seconds = probeSeconds(t.file)
    const meta = t.file.replace(/\.wav$/, '.json')
    if (existsSync(meta)) Object.assign(t, { f0: JSON.parse(readFileSync(meta, 'utf8')).f0 })
  }
  return out
}

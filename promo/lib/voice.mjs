// Spoken lines for the videos: the presenter of the promo cuts and the reader
// who talks through the social shorts. Each take is recorded once and kept,
// keyed by everything that shapes it (model, voice, direction, words), so a
// rebuild never pays twice and an edited line is the only one recorded again.
//
// With GEMINI_API_KEY: Gemini speech, kept in promo/voice/ (committed), its cost
// in promo/voice/ledger.json. Without: an espeak-ng draft with the same words,
// kept in promo/work/voice-draft/ (ignored) and labelled a draft everywhere it shows.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PROMO, log } from './app.mjs'

export const SPEECH_MODEL = process.env.GEMINI_SPEECH_MODEL ?? 'gemini-3.8-flash-tts'
const RATE = 24000
const LEDGER = path.join(PROMO, 'voice', 'ledger.json')

/**
 * Who speaks. Neither may sound like an in-app narrator (Gacrux, Kore, Algenib,
 * Fenrir, Achernar, Charon, plus the cast in src/lib/voiceCast.ts): measure the
 * pitch once real takes exist, and audition before settling.
 */
export const SPEAKERS = {
  presenter: {
    voice: 'Iapetus',
    style: 'a calm, friendly guide, plainly spoken, unhurried, no announcer voice',
    draft: { voice: 'en-us+m3', speed: 150, pitch: 38 },
  },
  reader: {
    voice: 'Sulafat',
    style: 'her ordinary speaking voice, telling a friend about something, plain, no performance',
    draft: { voice: 'en-us+f3', speed: 160, pitch: 52 },
  },
}

export const live = () => Boolean(process.env.GEMINI_API_KEY)

function keyOf(speaker, text) {
  const s = SPEAKERS[speaker]
  const parts = live() ? ['gemini', SPEECH_MODEL, s.voice, s.style, text] : ['draft', JSON.stringify(s.draft), text]
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16)
}

function dirFor() {
  return live() ? path.join(PROMO, 'voice') : path.join(PROMO, 'work', 'voice-draft')
}

function wavHeader(bytes, rate, channels = 1) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + bytes, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * channels * 2, 28)
  h.writeUInt16LE(channels * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(bytes, 40)
  return h
}

export function probeSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return Number(r.stdout.trim())
}

/** Seconds of speech, without the leading and trailing silence a take comes back with. */
function trimSilence(file) {
  const tmp = file.replace(/\.wav$/, '.trim.wav')
  // Only near-silence counts, so a word's soft last sound ("shoes") is kept.
  const f = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse'
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-af', f, tmp])
  if (r.status === 0) spawnSync('mv', [tmp, file])
}

async function geminiTake(speaker, text, file) {
  const s = SPEAKERS[speaker]
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
  writeFileSync(file, Buffer.concat([wavHeader(pcm.length, RATE), pcm]))
  // The same prices the app charges itself (src/lib/ai/pricing.ts): $0.5/M in, $9/M out.
  const usd = ((usage?.total_input_tokens ?? 0) * 0.5 + (usage?.total_output_tokens ?? 0) * 9) / 1e6
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { total: 0, takes: [] }
  ledger.takes.push({ at: new Date().toISOString(), model: SPEECH_MODEL, voice: s.voice, text, usd })
  ledger.total = ledger.takes.reduce((sum, t) => sum + t.usd, 0)
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n')
}

function draftTake(speaker, text, file) {
  const d = SPEAKERS[speaker].draft
  const raw = file.replace(/\.wav$/, '.raw.wav')
  const r = spawnSync('espeak-ng', ['-v', d.voice, '-s', String(d.speed), '-p', String(d.pitch), '-w', raw, text])
  if (r.status !== 0) throw new Error(`espeak-ng failed: ${r.stderr}`)
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-ar', String(RATE), '-ac', '1', file])
  spawnSync('rm', ['-f', raw])
}

/**
 * The take for a line, recording it if need be (unless `post`, which may never
 * pay). Returns { file, seconds, draft }.
 */
export async function take(speaker, text, { post = false } = {}) {
  const dir = dirFor()
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${speaker}-${keyOf(speaker, text)}.wav`)
  if (!existsSync(file)) {
    if (live()) {
      if (post) throw new Error(`--post: no take yet for ${speaker} “${text}”`)
      log(`recording ${speaker}: “${text}”`)
      await geminiTake(speaker, text, file)
    } else {
      draftTake(speaker, text, file)
    }
    trimSilence(file)
  }
  const seconds = probeSeconds(file)
  const words = text.split(/\s+/).length
  // A truncated take: Gemini sometimes stops early. Record it again by deleting the file.
  if (live() && seconds < words / 4.5) throw new Error(`take looks cut short (${seconds.toFixed(2)} s for ${words} words): ${file}`)
  return { file, seconds, draft: !live(), speaker, text }
}

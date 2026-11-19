// Records the running app as a clip: sharp frames from Chromium's screencast,
// and the app's own sound, taken from its Web Audio graph, so narration, sound
// effects and ambience arrive mixed exactly as a reader hears them.
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

/**
 * Runs inside every page before the app does. Every node the app connects to
 * the speakers is also connected to a recorder; a 2 px element changes every
 * 100 ms so the screencast keeps sending frames through the end of a CSS fade
 * (it sends only on repaint, and a dropped last frame holds a half-faded one).
 */
const INIT = ({ settings }) => {
  try {
    localStorage.setItem('tales:settings', JSON.stringify(settings))
  } catch {}
  const tapped = new WeakMap()
  const state = { chunks: [], startedAt: null, mime: null }
  window.__promoAudio = state
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = connect.call(this, destination, ...rest)
    if (destination instanceof AudioDestinationNode) {
      const ctx = destination.context
      let tap = tapped.get(ctx)
      if (!tap) {
        tap = ctx.createMediaStreamDestination()
        tapped.set(ctx, tap)
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
        const recorder = new MediaRecorder(tap.stream, { mimeType: mime, audioBitsPerSecond: 256000 })
        recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data)
        recorder.onstart = () => (state.startedAt = Date.now())
        state.recorder = recorder
        state.mime = mime
        recorder.start(250)
      }
      connect.call(this, tap)
    }
    return result
  }
  addEventListener('DOMContentLoaded', () => {
    const tick = document.createElement('div')
    tick.id = 'promo-tick'
    tick.setAttribute('aria-hidden', 'true')
    tick.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;z-index:2147483647;pointer-events:none;opacity:0.01'
    document.documentElement.appendChild(tick)
    let n = 0
    setInterval(() => (tick.style.background = n++ % 2 ? '#000' : '#fff'), 100)
  })
}

export const DEFAULT_SETTINGS = { sfx: true, ambience: true, narration: false, voiceSpeed: 1, textSize: 'medium', pace: 'normal', motion: 'full' }

/** Delivery profiles: the CSS viewport times the scale is the delivered pixel size. */
export const PROFILES = {
  portrait: { viewport: { width: 405, height: 720 }, scale: 8 / 3, size: [1080, 1920], mobile: true },
  landscape: { viewport: { width: 960, height: 540 }, scale: 2, size: [1920, 1080], mobile: false },
}

let browser = null

export async function launch() {
  browser ??= await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=MediaSessionService'],
  })
  return browser
}

export async function closeBrowser() {
  await browser?.close()
  browser = null
}

/**
 * A fresh page in its own context (a new browser per clip would be safer on a
 * crowded machine; one is enough here). `settings` are the reader's saved preferences.
 */
export async function newPage({ profile = 'portrait', settings = {} } = {}) {
  const p = PROFILES[profile]
  const b = await launch()
  const context = await b.newContext({
    viewport: p.viewport,
    deviceScaleFactor: p.scale,
    isMobile: p.mobile,
    hasTouch: p.mobile,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
    locale: 'en-US',
  })
  await context.addInitScript(INIT, { settings: { ...DEFAULT_SETTINGS, ...settings } })
  const page = await context.newPage()
  return { page, context, profile: p }
}

/**
 * Starts recording. Returns `mark(name)` to note a moment (seconds since the
 * clip began) and `stop()` to finish and assemble `out` (an MP4 with the app's sound).
 */
export async function record(page, { profile, out, workDir }) {
  out = path.resolve(out)
  workDir = path.resolve(workDir)
  const frames = path.join(workDir, 'frames')
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const list = []
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(frames, `${String(list.length).padStart(6, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    list.push({ file, t: metadata.timestamp * 1000 })
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId })
    } catch {}
  })
  const [w, h] = profile.size
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: w, maxHeight: h, everyNthFrame: 1 })
  // The clock starts with the first frame, so a clip never opens on nothing.
  for (let i = 0; i < 100 && !list.length; i++) await page.waitForTimeout(20)
  const start = list[0]?.t ?? Date.now()
  const marks = {}
  const mark = (name) => {
    marks[name] = (Date.now() - start) / 1000
    return marks[name]
  }
  const stop = async ({ tail = 0.3 } = {}) => {
    await page.waitForTimeout(tail * 1000)
    const end = Date.now()
    await cdp.send('Page.stopScreencast')
    const audio = await page.evaluate(async () => {
      const s = window.__promoAudio
      if (!s?.recorder) return null
      await new Promise((resolve) => {
        s.recorder.onstop = resolve
        s.recorder.stop()
      })
      const blob = new Blob(s.chunks, { type: s.mime })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return { data: btoa(bin), startedAt: s.startedAt }
    })
    await cdp.detach().catch(() => {})
    const duration = (end - start) / 1000
    assemble({ list, start, end, size: profile.size, audio, out, workDir })
    return { file: out, duration, marks }
  }
  return { mark, stop, marks }
}

function run(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`)
}

/** Frames at their own times → constant 30 fps; the app's sound laid at its own offset. */
function assemble({ list, start, end, size, audio, out, workDir }) {
  const lines = ['ffconcat version 1.0']
  list.forEach((f, i) => {
    const next = i + 1 < list.length ? list[i + 1].t : end
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, (next - Math.max(f.t, start)) / 1000).toFixed(4)}`)
  })
  lines.push(`file '${list[list.length - 1].file}'`)
  const concat = path.join(workDir, 'frames.ffconcat')
  writeFileSync(concat, lines.join('\n') + '\n')
  const duration = ((end - start) / 1000).toFixed(3)
  const [w, h] = size
  const video = ['-f', 'concat', '-safe', '0', '-i', concat]
  const vf = `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`
  if (audio?.data) {
    const webm = path.join(workDir, 'audio.webm')
    writeFileSync(webm, Buffer.from(audio.data, 'base64'))
    // Positive: the app's sound began after the first frame. Negative: before it.
    const offset = (audio.startedAt - start) / 1000
    const af = offset >= 0 ? `adelay=${Math.round(offset * 1000)}:all=1,apad` : `atrim=start=${(-offset).toFixed(3)},asetpts=PTS-STARTPTS,apad`
    run([...video, '-i', webm, '-filter_complex', `[0:v]${vf}[v];[1:a]aresample=48000,${af}[a]`, '-map', '[v]', '-map', '[a]', '-t', duration, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', out])
  } else {
    // A silent stereo bed, so every clip joins with every other.
    run([...video, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a', '-t', duration, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'pcm_s16le', out])
  }
}

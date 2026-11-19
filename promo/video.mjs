// Records and cuts the promo videos and social shorts.
//
//   node promo/video.mjs                    every production, every profile
//   node promo/video.mjs --only tour        one production (or short-…)
//   node promo/video.mjs --profile portrait one delivery shape
//   node promo/video.mjs --beat begin     retake one beat, re-mix the rest
//   node promo/video.mjs --post             re-mix recorded beats; records nothing, pays nothing
//   node promo/video.mjs --skip-build       reuse the current app build
//
// Order of work: every spoken line is taken (and measured) first, then each
// beat is recorded as its own clip, waiting on the speech it carries, so
// timing comes from the real takes rather than guesses. Post-production mixes
// each beat (the app's own sound ducked under the voice), joins the beats with
// short crossfades, normalises loudness once over the whole cut, and checks
// the result. A cut that breaks a rule fails the build.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildApp, DATA, log, OUT, PROMO, PROVIDER, startApp } from './lib/app.mjs'
import { closeBrowser, launch, newPage, PROFILES, record } from './lib/capture.mjs'
import { ENGINE, probeSeconds, SPEAKERS, takes as voiceTakes } from './lib/voice.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const POST = flag('--post')
const WORK = path.join(PROMO, 'work', 'clips')
const XFADE = 0.35
/** The last word must end this long before the video does. */
const END_PAUSE = 1.5

async function loadProductions() {
  const dir = path.join(PROMO, 'productions')
  const list = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href)
    list.push(...[mod.default].flat())
  }
  return list
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${argv.join(' ')}\n${r.stderr}`)
  return r
}

// ---------------------------------------------------------------- capture

function takes(production) {
  return voiceTakes(production.speaker, production.lines, { post: POST })
}

/** Reads a page to its choices: taps the words, turning sheets, as a reader does. */
async function readAhead(page) {
  for (let i = 0; i < 10; i++) {
    const current = page.getByTestId('current-page')
    await current.getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
    await current.getByTestId('page-text').click({ position: { x: 8, y: 8 } })
    const next = current.locator('.sheet-next')
    if ((await next.count()) && (await next.isEnabled())) {
      await next.click()
      await page.waitForTimeout(900)
      continue
    }
    await current.getByRole('navigation', { name: 'Choices' }).or(current.getByText('Finis')).waitFor()
    await page.waitForTimeout(500)
    return
  }
}

/** The closing card: laid over the running app, in the app's own type. */
async function endCard(page, { title, line }) {
  await page.evaluate(
    ({ title, line }) => {
      const font = getComputedStyle(document.querySelector('.cover-title, .book-title, h1') ?? document.body).fontFamily
      const card = document.createElement('div')
      card.style.cssText = `position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;padding:2rem;text-align:center;background:radial-gradient(ellipse at 50% 45%, rgba(37,24,12,0.9), rgba(16,10,5,0.97));color:#f3e6c8;opacity:0;transition:opacity 0.9s ease;font-family:${font}`
      card.innerHTML = `<div style="font-size:clamp(2.2rem,9vmin,4.2rem);letter-spacing:0.02em;line-height:1.05">${title}</div><div style="width:4rem;height:1px;background:#c9a96a"></div><div style="font-size:clamp(1rem,3.6vmin,1.5rem);font-style:italic;opacity:0.9;max-width:22ch">${line}</div>`
      document.body.appendChild(card)
      requestAnimationFrame(() => requestAnimationFrame(() => (card.style.opacity = '1')))
    },
    { title, line },
  )
}

/**
 * Where the narrator first pauses after `from` seconds: speech below -34 dB for
 * at least 0.18 s (only near-silence, so a soft "s" is not a pause). The beat
 * ends a quarter-second into that pause.
 */
function endAtPause(file, from, duration) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', `atrim=start=${from.toFixed(3)},asetpts=PTS-STARTPTS,silencedetect=noise=-34dB:d=0.18`, '-f', 'null', '-'], { encoding: 'utf8' })
  const m = r.stderr.match(/silence_start: ([\d.]+)/)
  if (!m) throw new Error(`no pause in the narration after ${from.toFixed(1)} s of ${path.basename(file)}`)
  return Math.min(duration, from + Number(m[1]) + 0.25)
}

async function captureBeat({ production, beat, profileName, takesById, app, index, state }) {
  const dir = path.join(WORK, production.name, profileName)
  mkdirSync(dir, { recursive: true })
  const tale = (key) => {
    const t = index.tales[key]
    if (!t) throw new Error(`no promo tale “${key}”: run npm run promo:content`)
    return t
  }
  const settings = { ...(production.settings ?? {}), ...(beat.settings ?? {}) }
  for (let attempt = 1; ; attempt++) {
    const { page, context, profile } = await newPage({ profile: profileName, settings })
    try {
      const start = typeof beat.start === 'function' ? beat.start({ tale, state }) : beat.start
      await page.goto(app.url + start, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const helpers = {
        page,
        tale,
        /** Shared by the beats of one production: what one beat began, a later one can open. */
        state,
        /** Waits until these pages of a tale are written, so a tap on a choice never waits on the storyteller. */
        async written(storyId, numbers) {
          for (const n of numbers) {
            for (let i = 0; ; i++) {
              const res = await fetch(`${app.url}/api/stories/${storyId}/pages/${n}?visit=0`)
              // Each run serves a fresh copy of the tales: one begun in an earlier run is not here.
              if (res.status === 404) throw new Error(`no tale ${storyId} in this run: retake the beat that begins it too`)
              const { page: p } = await res.json()
              if (p?.status === 'ready') break
              if (i > 90) throw new Error(`page ${n} of ${storyId} was never written`)
              await new Promise((r) => setTimeout(r, 1000))
            }
          }
        },
        readAhead: () => readAhead(page),
        wait: (s) => page.waitForTimeout(s * 1000),
        async tap(locator, after = 0.6) {
          await locator.click()
          await page.waitForTimeout(after * 1000)
        },
        async go(key, n) {
          await page.goto(`${app.url}/s/${tale(key).id}/${tale(key).pages[n]}`, { waitUntil: 'networkidle' })
        },
      }
      if (beat.before) await beat.before(helpers)
      const workDir = path.join(dir, `${beat.name}.work`)
      const rec = await record(page, { profile, out: path.join(dir, `${beat.name}.mkv`), workDir })
      // From here on, taps are noted with their times in the clip.
      let taps = 0
      helpers.tap = async (locator, after = 0.6) => {
        await locator.click()
        rec.mark(`tap:${++taps}`)
        await page.waitForTimeout(after * 1000)
      }
      const spoken = []
      const run = beat.run({
        ...helpers,
        mark: rec.mark,
        endCard: (o) => endCard(page, o),
        /** Speaks a line: noted now, laid in at post-production. Waits for it unless `wait: false`. */
        say(id, { wait = true } = {}) {
          const t = takesById[id]
          if (!t) throw new Error(`${production.name}/${beat.name}: no line “${id}”`)
          spoken.push({ id, at: rec.mark(`say:${id}`), seconds: t.seconds })
          const done = page.waitForTimeout(t.seconds * 1000 + 250)
          // A line not waited for must not outlive a failed beat as an unhandled rejection.
          done.catch(() => {})
          return wait ? done : done.catch(() => {})
        },
      })
      await run
      const clip = await rec.stop()
      rmSync(workDir, { recursive: true, force: true })
      const meta = { beat: beat.name, duration: clip.duration, marks: clip.marks, spoken, state: { ...state } }
      // Cut a moment after a mark: what follows (the storyteller at work) is not worth watching.
      if (beat.endAt) meta.duration = Math.min(clip.duration, clip.marks[beat.endAt.after] + beat.endAt.plus)
      if (beat.endAtPause) meta.duration = endAtPause(clip.file, clip.marks[beat.endAtPause.after] + beat.endAtPause.min, clip.duration)
      writeFileSync(path.join(dir, `${beat.name}.json`), JSON.stringify(meta, null, 2))
      log(`${production.name}/${profileName}/${beat.name}: ${clip.duration.toFixed(1)} s`)
      return meta
    } catch (error) {
      // A crowded machine can kill the renderer mid-take: one retake, then give up.
      if (attempt >= 2 || !/crash|closed/i.test(String(error))) throw error
      log(`retaking ${beat.name}: ${error.message}`)
    } finally {
      await context.close().catch(() => {})
    }
  }
}

// ---------------------------------------------------------------- post-production

/** Subtitle images, rendered as the page would set them; one per line. */
async function subtitleImages(production, takesById, profileName, dir) {
  const [w, h] = PROFILES[profileName].size
  const b = await launch()
  const page = await b.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 1 })
  const images = {}
  for (const [id, t] of Object.entries(takesById)) {
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><div id=s style="display:inline-block;max-width:${Math.round(w * 0.82)}px;padding:${Math.round(h * 0.008)}px ${Math.round(w * 0.03)}px;border-radius:${Math.round(w * 0.02)}px;background:rgba(12,10,8,0.78);color:#fff;font:600 ${Math.round(w * 0.045)}px/1.28 'DejaVu Sans',system-ui,sans-serif;text-align:center">${t.text}</div></body></html>`,
    )
    const file = path.join(dir, `sub-${id}.png`)
    await page.locator('#s').screenshot({ path: file, omitBackground: true })
    images[id] = file
  }
  if (production.disclosure) {
    await page.setContent(`<html><body style="margin:0;background:transparent"><div id=s style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(12,10,8,0.6);color:#eee;font:500 ${Math.round(w * 0.026)}px 'DejaVu Sans',sans-serif">${production.disclosure}</div></body></html>`)
    images['@disclosure'] = path.join(dir, 'disclosure.png')
    await page.locator('#s').screenshot({ path: images['@disclosure'], omitBackground: true })
  }
  await page.close()
  return images
}

function imageSize(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  const [w, h] = r.stdout.trim().split(',').map(Number)
  return { w, h }
}

/** One beat, mixed: its clip, the speech laid at its marks, the app ducked under it, subtitles over it. */
function mixBeat({ production, profileName, meta, takesById, subs, dir }) {
  const [W, H] = PROFILES[profileName].size
  const clip = path.join(WORK, production.name, profileName, `${meta.beat}.mkv`)
  const out = path.join(dir, `${meta.beat}.seg.mkv`)
  const inputs = ['-i', clip]
  const filters = []
  let v = '[0:v]'
  let n = 1
  const lines = meta.spoken
  for (const s of lines) {
    if (s.at + s.seconds > meta.duration - 0.05) throw new Error(`${production.name}/${meta.beat}: “${s.id}” runs past the end of its beat (${(s.at + s.seconds).toFixed(2)} > ${meta.duration.toFixed(2)} s)`)
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].at < lines[i - 1].at + lines[i - 1].seconds) throw new Error(`${production.name}/${meta.beat}: “${lines[i].id}” starts over “${lines[i - 1].id}”`)
  }
  const voices = []
  for (const s of lines) {
    inputs.push('-i', takesById[s.id].file)
    voices.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(s.at * 1000)}:all=1[s${n}]`)
    s.input = n++
  }
  if (production.subtitles) {
    for (const s of lines) {
      const file = subs[s.id]
      const { w, h } = imageSize(file)
      inputs.push('-i', file)
      const y = Math.round(H * 0.74 - h / 2)
      filters.push(`${v}[${n}:v]overlay=${Math.round((W - w) / 2)}:${y}:enable='between(t,${s.at.toFixed(3)},${(s.at + s.seconds + 0.15).toFixed(3)})'[v${n}]`)
      v = `[v${n}]`
      n++
      if (subs['@disclosure']) {
        const d = imageSize(subs['@disclosure'])
        inputs.push('-i', subs['@disclosure'])
        // Just above the subtitle, where it reads as a note on the voice and covers nothing of the page's head.
        filters.push(`${v}[${n}:v]overlay=${Math.round((W - d.w) / 2)}:${y - d.h - Math.round(H * 0.008)}:enable='between(t,${s.at.toFixed(3)},${(s.at + s.seconds + 0.15).toFixed(3)})'[v${n}]`)
        v = `[v${n}]`
        n++
      }
    }
  }
  filters.push(`${v}null[v]`)
  const dur = meta.duration.toFixed(3)
  filters.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${dur},apad,atrim=0:${dur}[app]`)
  if (lines.length) {
    filters.push(...voices)
    filters.push(`${lines.map((s) => `[s${s.input}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad,atrim=0:${dur}[voice]`)
    filters.push('[voice]asplit[vk][vm]')
    // About 11 dB under the voice, back up in a third of a second: ducked, never muted.
    filters.push('[app][vk]sidechaincompress=threshold=0.008:ratio=5:attack=20:release=350[duck]')
    filters.push('[duck][vm]amix=inputs=2:normalize=0[a]')
  } else {
    filters.push('[app]anull[a]')
  }
  ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-t', dur, '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', out])
  return out
}

/** The beats joined with matching video and audio crossfades, loudness set once, encoded for delivery. */
function joinBeats({ production, segments, metas, out }) {
  const inputs = segments.flatMap((s) => ['-i', s])
  const f = []
  let offset = 0
  let v = '[0:v]'
  let a = '[0:a]'
  const starts = [0]
  for (let i = 1; i < segments.length; i++) {
    offset += metas[i - 1].duration - XFADE
    starts.push(offset)
    f.push(`${v}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[v${i}]`)
    f.push(`${a}[${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri[a${i}]`)
    v = `[v${i}]`
    a = `[a${i}]`
  }
  const total = offset + metas[metas.length - 1].duration
  const fade = production.fadeOut ? (total - production.fadeOut).toFixed(3) : null
  f.push(`${a}loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000${fade ? `,afade=t=out:st=${fade}:d=${production.fadeOut}` : ''}[a]`)
  f.push(`${v}${fade ? `fade=t=out:st=${fade}:d=${production.fadeOut}` : 'null'}[v]`)
  ffmpeg([...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out])
  return starts
}

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,profile,channels,sample_rate,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' })
  return JSON.parse(r.stdout)
}

function levels(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const get = (k) => Number((r.stderr.match(new RegExp(`${k}: (-?[\\d.]+) dB`)) ?? [])[1])
  return { mean: get('mean_volume'), peak: get('max_volume') }
}

async function finish({ production, profileName, metas, takesById, out }) {
  const dir = path.dirname(out)
  const segments = []
  const subs = production.subtitles ? await subtitleImages(production, takesById, profileName, path.join(WORK, production.name, profileName)) : {}
  for (const meta of metas) segments.push(mixBeat({ production, profileName, meta, takesById, subs, dir: path.join(WORK, production.name, profileName) }))
  const starts = joinBeats({ production, segments, metas, out })
  const base = out.replace(/\.mp4$/, '')
  // What is said, when, in the finished cut: the gallery prints this as the script.
  const script = metas.flatMap((m, i) => m.spoken.map((s) => ({ beat: m.beat, id: s.id, text: takesById[s.id].text, at: +(starts[i] + s.at).toFixed(2), seconds: +s.seconds.toFixed(2) })))
  const info = probe(out)
  const duration = Number(info.format.duration)
  const lastWord = Math.max(0, ...script.map((s) => s.at + s.seconds))
  // Decoding the whole file proves it plays to the end.
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' })
  const lv = levels(out)
  const video = info.streams.find((s) => s.codec_type === 'video')
  const audio = info.streams.find((s) => s.codec_type === 'audio')
  const [W, H] = PROFILES[profileName].size
  const limit = production.limit?.[profileName]
  const checks = [
    { name: 'size', ok: video.width === W && video.height === H, detail: `${video.width}×${video.height}` },
    { name: 'codec', ok: video.codec_name === 'h264' && audio?.codec_name === 'aac', detail: `${video.codec_name} ${video.profile} / ${audio?.codec_name} ${audio?.channels}ch` },
    { name: 'length', ok: !limit || duration <= limit, detail: `${duration.toFixed(1)} s${limit ? ` (≤ ${limit} s)` : ''}` },
    { name: 'ends on a pause', ok: duration - lastWord >= END_PAUSE, detail: `${(duration - lastWord).toFixed(1)} s after the last word` },
    { name: 'decodes', ok: decode.status === 0 && !decode.stderr.trim(), detail: decode.stderr.trim().slice(0, 120) || 'whole file' },
    { name: 'loudness', ok: lv.peak <= -0.5 && lv.mean > -35, detail: `mean ${lv.mean} dB, peak ${lv.peak} dB` },
  ]
  // Poster, the literal last frame, and a contact sheet to look at before anyone watches.
  ffmpeg(['-ss', String(Math.min(duration * 0.3, duration - 0.1)), '-i', out, '-frames:v', '1', '-q:v', '3', `${base}.poster.jpg`])
  // The literal last frame: decode the final half-second and keep whichever frame comes last.
  ffmpeg(['-sseof', '-0.5', '-i', out, '-update', '1', '-q:v', '3', `${base}.last.jpg`])
  if (!existsSync(`${base}.last.jpg`)) throw new Error(`no last frame from ${out}`)
  const cols = profileName === 'portrait' ? 6 : 4
  ffmpeg(['-i', out, '-vf', `fps=${(12 / duration).toFixed(4)},scale=${profileName === 'portrait' ? 220 : 400}:-1,tile=${cols}x${12 / cols}`, '-frames:v', '1', '-q:v', '4', `${base}.sheet.jpg`])
  const result = {
    production: production.name,
    title: production.title,
    profile: profileName,
    slot: production.slots?.[profileName],
    file: path.basename(out),
    duration: +duration.toFixed(2),
    size: Number(info.format.size),
    provider: PROVIDER,
    voice: { engine: ENGINE, ...SPEAKERS[production.speaker][ENGINE] },
    about: production.about,
    beats: metas.map((m, i) => ({ name: m.beat, at: +starts[i].toFixed(2), seconds: +m.duration.toFixed(2) })),
    script,
    checks,
    builtAt: new Date().toISOString(),
  }
  writeFileSync(`${base}.json`, JSON.stringify(result, null, 2) + '\n')
  const failed = checks.filter((c) => !c.ok)
  log(`${path.relative(PROMO, out)}: ${duration.toFixed(1)} s, ${failed.length ? `FAILED ${failed.map((c) => `${c.name} (${c.detail})`).join(', ')}` : 'all checks pass'}`)
  return result
}

// ---------------------------------------------------------------- main

const productions = (await loadProductions()).filter((p) => !option('--only') || p.name === option('--only') || p.name.startsWith(option('--only')))
if (!productions.length) throw new Error(`no production matches ${option('--only')}`)
const indexFile = path.join(DATA, 'tales.index.json')
if (!existsSync(indexFile)) throw new Error('no promo tales yet: npm run promo:content')
const index = JSON.parse(readFileSync(indexFile, 'utf8'))
mkdirSync(path.join(OUT, 'video'), { recursive: true })

let app = null
const results = []
try {
  if (!POST) {
    if (!flag('--skip-build')) buildApp()
    app = await startApp({ scratch: true })
  }
  const used = new Set()
  for (const production of productions) {
    const takesById = await takes(production)
    for (const t of Object.values(takesById)) used.add(path.basename(t.file, '.wav'))
    for (const profileName of production.profiles.filter((p) => !option('--profile') || p === option('--profile'))) {
      const metas = []
      const state = {}
      for (const beat of production.beats) {
        const file = path.join(WORK, production.name, profileName, `${beat.name}.json`)
        if (POST || (option('--beat') && option('--beat') !== beat.name)) {
          if (!existsSync(file)) throw new Error(`--post: ${production.name}/${profileName}/${beat.name} was never recorded`)
          const meta = JSON.parse(readFileSync(file, 'utf8'))
          Object.assign(state, meta.state ?? {})
          // A reworded line keeps its place but takes its new length.
          for (const s of meta.spoken) s.seconds = probeSeconds(takesById[s.id].file)
          metas.push(meta)
        } else {
          metas.push(await captureBeat({ production, beat, profileName, takesById, app, index, state }))
        }
      }
      const out = path.join(OUT, 'video', `${production.name}-${profileName}.mp4`)
      results.push(await finish({ production, profileName, metas, takesById, out }))
    }
  }
  // A full run knows every line there is: takes no line uses any more are deleted, so they leave git too.
  if (!option('--only') && !option('--beat')) {
    const dir = path.join(PROMO, 'voice')
    for (const f of readdirSync(dir).filter((f) => /\.(wav|json)$/.test(f) && f !== 'ledger.json')) {
      if (!used.has(f.replace(/\.(wav|json)$/, ''))) rmSync(path.join(dir, f))
    }
  }
} finally {
  await closeBrowser()
  await app?.stop()
}
const failed = results.filter((r) => r.checks.some((c) => !c.ok))
if (failed.length) {
  console.error(`${failed.length} cut(s) failed their checks`)
  process.exit(1)
}

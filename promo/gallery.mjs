// The review gallery: every promo asset on one page, each checked against the
// slot it is for. Built into promo/out/gallery/ as a folder (index.html with
// its media beside it on relative paths), so it can be opened locally,
// published as an artifact, or copied to the site's /press/ once there is one.
//
//   node promo/gallery.mjs            build it from whatever promo/out holds
//   node promo/gallery.mjs --approve  copy the built gallery to promo/gallery/ (tracked)
//
// Media on the page are review copies (videos re-encoded lighter, stills as
// width-limited previews); every caption reports the master's true pixels and weight.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DATA, log, OUT, PROMO, PROVIDER, ROOT } from './lib/app.mjs'

const GALLERY = path.join(OUT, 'gallery')
const MB = (n) => `${(n / 1048576).toFixed(n < 1048576 * 10 ? 2 : 1)} MB`
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function ff(argv) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg ${argv.join(' ')}\n${r.stderr}`)
}

function pixels(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  const [w, h] = r.stdout.trim().split(',').map(Number)
  return { w, h }
}

/** A preview at most `width` px wide, re-made only when the source changed. */
function preview(src, dest, width, quality = 4) {
  if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) return dest
  mkdirSync(path.dirname(dest), { recursive: true })
  ff(['-i', src, '-vf', `scale='min(${width},iw)':-2:flags=lanczos`, '-q:v', String(quality), dest])
  return dest
}

/** A lighter copy of a video for review: same picture size, heavier compression. */
function reviewVideo(src, dest) {
  if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) return dest
  mkdirSync(path.dirname(dest), { recursive: true })
  ff(['-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-maxrate', '2400k', '-bufsize', '4800k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', dest])
  return dest
}

const rel = (file) => path.relative(GALLERY, file).split(path.sep).join('/')

function check(name, ok, detail) {
  return { name, ok, detail }
}

// ---------------------------------------------------------------- collect

function collectVideos() {
  const dir = path.join(OUT, 'video')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
    .map((v) => {
      const master = path.join(dir, v.file)
      const base = master.replace(/\.mp4$/, '')
      return {
        ...v,
        kind: v.production.startsWith('short-') ? 'short' : 'video',
        src: rel(reviewVideo(master, path.join(GALLERY, 'media', 'video', v.file))),
        poster: rel(preview(`${base}.poster.jpg`, path.join(GALLERY, 'media', 'video', `${path.basename(base)}.poster.jpg`), 720)),
        thumb: rel(preview(`${base}.poster.jpg`, path.join(GALLERY, 'thumbs', `${path.basename(base)}.jpg`), 240, 6)),
        sheet: existsSync(`${base}.sheet.jpg`) ? rel(preview(`${base}.sheet.jpg`, path.join(GALLERY, 'media', 'video', `${path.basename(base)}.sheet.jpg`), 1320)) : null,
        last: existsSync(`${base}.last.jpg`) ? rel(preview(`${base}.last.jpg`, path.join(GALLERY, 'media', 'video', `${path.basename(base)}.last.jpg`), 720)) : null,
        masterSize: statSync(master).size,
      }
    })
    .sort((a, b) => (a.production === b.production ? a.profile.localeCompare(b.profile) : a.production.localeCompare(b.production)))
}

/** Stills: what each is for, and the size that slot needs. */
const STILL_SLOTS = [
  { group: 'posts', title: 'Feed posts', where: 'Instagram and Facebook feed (4:5), and a square for anywhere', match: /^posts\/post-/, size: [1080, 1350], cap: 8 << 20 },
  { group: 'posts', match: /^posts\/square-/, size: [1080, 1080], cap: 8 << 20 },
  { group: 'stories', title: 'Stories', where: 'Instagram, Facebook, TikTok and Snapchat stories (9:16); words kept inside the safe zone', match: /^stories\/story-/, size: [1080, 1920], cap: 8 << 20 },
  { group: 'screens-portrait', title: 'App screens', where: 'Phone screenshots at 1080×1920 (9:16), for posts, stories and a future listing', match: /^screens\/portrait-/, size: [1080, 1920], cap: 8 << 20 },
]

function collectStills() {
  const dir = path.join(OUT, 'stills')
  if (!existsSync(dir)) return []
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'work') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(png|jpg)$/.test(e.name)) files.push(p)
    }
  }
  walk(dir)
  return files
    .map((file) => {
      const name = path.relative(dir, file).split(path.sep).join('/')
      const slot = STILL_SLOTS.find((s) => s.match.test(name))
      if (!slot) return null
      const { w, h } = pixels(file)
      const size = statSync(file).size
      const stem = name.replace(/[/.]/g, '-')
      return {
        name,
        group: slot.group,
        w,
        h,
        size,
        format: path.extname(file).slice(1).toUpperCase(),
        src: rel(preview(file, path.join(GALLERY, 'media', 'stills', `${stem}.jpg`), w > h ? 1280 : 720, 3)),
        thumb: rel(preview(file, path.join(GALLERY, 'thumbs', `${stem}.jpg`), 240, 6)),
        checks: [check('exact size', w === slot.size[0] && h === slot.size[1], `${w}×${h} (needs ${slot.size.join('×')})`), check('weight', size <= slot.cap, `${MB(size)} (≤ ${MB(slot.cap)})`)],
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function spend() {
  const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).total ?? 0 : 0)
  return { tales: read(path.join(DATA, 'ledger.json')), voices: read(path.join(PROMO, 'voice', 'ledger.json')) }
}

function folderSize(dir) {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    n += e.isDirectory() ? folderSize(p) : statSync(p).size
  }
  return n
}

// ---------------------------------------------------------------- page

const badge = (c) => `<li class="badge ${c.ok ? 'pass' : 'fail'}" title="${esc(c.detail)}"><span class="mark" aria-hidden="true">${c.ok ? '✓' : '✕'}</span>${esc(c.name)}<span class="detail">${esc(c.detail)}</span></li>`

function videoCard(v, i, group) {
  const failed = v.checks.filter((c) => !c.ok).length
  const script = v.script.length
    ? `<ol class="script">${v.script.map((s) => `<li><span class="t">${s.at.toFixed(1)} s</span><span class="line">${esc(s.text)}</span><span class="beat">${esc(s.beat)}</span></li>`).join('')}</ol>`
    : '<p class="muted">Nothing is said.</p>'
  return `
<article class="video" id="${esc(v.production)}-${esc(v.profile)}">
  <button class="open poster ${v.profile}" type="button" data-group="${group}" data-index="${i}" aria-label="Watch ${esc(v.title)}, ${esc(v.profile)}">
    <img data-src="${v.poster}" alt="" width="${v.profile === 'portrait' ? 360 : 640}" height="${v.profile === 'portrait' ? 640 : 360}">
    <span class="play" aria-hidden="true"></span>
  </button>
  <div class="about">
    <h3>${esc(v.title)} <span class="shape">${v.profile === 'portrait' ? '9:16' : '16:9'}</span></h3>
    <p class="slot">${esc(v.slot ?? '')}</p>
    ${v.about ? `<p>${esc(v.about)}</p>` : ''}
    <p class="facts">${v.duration.toFixed(1)} s · master ${MB(v.masterSize)} · <span class="mono">${esc(v.file)}</span>${v.voice ? ` · voice <span class="mono">${esc(v.voice.voice)}</span> (${esc(v.voice.engine)})` : ''}</p>
    <ul class="badges">${v.checks.map(badge).join('')}</ul>
    <details class="inner"><summary>What is said, and when</summary>${script}</details>
    ${v.sheet ? `<details class="inner"><summary>Contact sheet and last frame</summary><div class="frames"><img data-src="${v.sheet}" alt="Twelve frames across the cut" class="sheet">${v.last ? `<img data-src="${v.last}" alt="The cut's last frame" class="last">` : ''}</div></details>` : ''}
  </div>
  ${failed ? `<p class="fails">${failed} check${failed > 1 ? 's' : ''} failed</p>` : ''}
</article>`
}

function stillTile(s, i, group) {
  const ok = s.checks.every((c) => c.ok)
  return `
<figure class="still">
  <button class="open" type="button" data-group="${group}" data-index="${i}" aria-label="View ${esc(s.name)}">
    <img data-src="${s.src}" alt="${esc(s.name)}" width="${s.w}" height="${s.h}">
  </button>
  <figcaption>
    <span class="mono name">${esc(s.name.replace(/^.*\//, ''))}</span>
    <span class="facts">${s.w}×${s.h} · ${esc(s.format)} · ${MB(s.size)}</span>
    <span class="state ${ok ? 'pass' : 'fail'}">${ok ? 'fits its slot' : s.checks.filter((c) => !c.ok).map((c) => esc(c.detail)).join('; ')}</span>
  </figcaption>
</figure>`
}

function section({ id, title, where, count, flagged, thumb, body }) {
  return `
<details class="section" id="${id}">
  <summary>
    ${thumb ? `<img class="thumb" src="${thumb}" alt="" loading="lazy" width="72" height="72">` : '<span class="thumb"></span>'}
    <span class="head"><span class="title">${esc(title)}</span><span class="where">${esc(where)}</span></span>
    <span class="count">${count}</span>
    <span class="state ${flagged ? 'fail' : 'pass'}">${flagged ? `${flagged} flagged` : 'all pass'}</span>
  </summary>
  <div class="body">${body}</div>
</details>`
}

function page({ videos, stills, commit, money, dry }) {
  const items = { video: videos.filter((v) => v.kind === 'video'), short: videos.filter((v) => v.kind === 'short') }
  const groups = {}
  const sections = []
  const assetCount = videos.length + stills.length
  const flaggedVideos = (list) => list.filter((v) => v.checks.some((c) => !c.ok)).length
  const allChecks = [...videos.flatMap((v) => v.checks), ...stills.flatMap((s) => s.checks)]
  const passed = allChecks.filter((c) => c.ok).length

  for (const [kind, id, title, where] of [
    ['video', 'videos', 'Promo video', 'The tour, with a presenter: 9:16 for Reels, Shorts and TikTok'],
    ['short', 'shorts', 'Social shorts', 'A reader’s point of view, not ads: 9:16 for Reels, Shorts and TikTok'],
  ]) {
    const list = items[kind]
    if (!list.length) continue
    groups[id] = list.map((v) => ({ type: 'video', src: v.src, poster: v.poster, name: v.file, facts: `${v.duration.toFixed(1)} s · ${v.profile === 'portrait' ? '1080×1920' : '1920×1080'} · master ${MB(v.masterSize)}`, checks: v.checks }))
    sections.push(section({ id, title, where, count: `${list.length} cut${list.length > 1 ? 's' : ''}`, flagged: flaggedVideos(list), thumb: list[0].thumb, body: `<div class="videos">${list.map((v, i) => videoCard(v, i, id)).join('')}</div>` }))
  }
  for (const slot of STILL_SLOTS.filter((s) => s.title)) {
    const list = stills.filter((s) => s.group === slot.group)
    if (!list.length) continue
    groups[slot.group] = list.map((s) => ({ type: 'image', src: s.src, name: s.name, facts: `${s.w}×${s.h} · ${s.format} · ${MB(s.size)}`, checks: s.checks }))
    const flagged = list.filter((s) => s.checks.some((c) => !c.ok)).length
    sections.push(section({ id: slot.group, title: slot.title, where: slot.where, count: `${list.length} image${list.length > 1 ? 's' : ''}`, flagged, thumb: list[0].thumb, body: `<div class="stills ${slot.group}">${list.map((s, i) => stillTile(s, i, slot.group)).join('')}</div>` }))
  }

  const contents = sections.map((s) => s.match(/id="([^"]+)"/)[1])
  const names = { videos: 'Promo video', shorts: 'Social shorts', stories: 'Stories', posts: 'Feed posts', 'screens-portrait': 'App screens' }
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Tales Unwritten Press Kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: a press kit read top to bottom; every slot a collapsed drawer that loads nothing until opened. */
:root {
  --ground: #f1f0ec; --surface: #fbfaf7; --ink: #1f1b16; --muted: #6b6359; --rule: #dcd8d0;
  --accent: #9b2a1c; --pass: #2f6b3d; --pass-bg: #e3efe3; --fail: #a3281a; --fail-bg: #f6e1dc; --flag-bg: #f3e6c6; --flag: #7a5310;
  --display: 'Cormorant Garamond', 'Iowan Old Style', Georgia, serif;
  --body: 'Public Sans', 'Segoe UI', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --ground: #15130f; --surface: #1d1a15; --ink: #ece6da; --muted: #a49a8b; --rule: #353028;
  --accent: #e2735f; --pass: #8fca9a; --pass-bg: #1f2e22; --fail: #f09a8a; --fail-bg: #3a201b; --flag-bg: #3a2f17; --flag: #e8c57a; color-scheme: dark } }
:root[data-theme="dark"] {
  --ground: #15130f; --surface: #1d1a15; --ink: #ece6da; --muted: #a49a8b; --rule: #353028;
  --accent: #e2735f; --pass: #8fca9a; --pass-bg: #1f2e22; --fail: #f09a8a; --fail-bg: #3a201b; --flag-bg: #3a2f17; --flag: #e8c57a; color-scheme: dark }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 15px/1.55 var(--body); }
.wrap { max-width: 1120px; margin: 0 auto; padding-inline: max(16px, 4vw); padding-block: 40px 80px; display: grid; gap: 28px; }
h1, h2, h3 { font-family: var(--display); font-weight: 700; text-wrap: balance; margin: 0; line-height: 1.05; }
h1 { font-size: clamp(2.4rem, 6vw, 3.6rem); }
h3 { font-size: 1.45rem; }
p { margin: 0; }
.mono { font-family: var(--mono); font-size: 0.82em; }
.muted { color: var(--muted); }
header { display: grid; gap: 14px; }
.eyebrow { font: 600 0.74rem/1 var(--body); letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
.summary { display: flex; flex-wrap: wrap; gap: 10px 28px; color: var(--muted); font-variant-numeric: tabular-nums; }
.summary b { color: var(--ink); font-weight: 600; }
.dry { background: var(--flag-bg); color: var(--flag); border-radius: 10px; padding: 14px 16px; max-width: 70ch; }
.dry b { font-weight: 600; }
nav.contents { display: flex; flex-wrap: wrap; gap: 8px; }
nav.contents a { color: var(--ink); text-decoration: none; border: 1px solid var(--rule); border-radius: 999px; padding: 4px 12px; font-size: 0.86rem; }
nav.contents a:hover, nav.contents a:focus-visible { border-color: var(--accent); color: var(--accent); }
.section { background: var(--surface); border: 1px solid var(--rule); border-radius: 14px; }
.section > summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 72px 1fr auto auto; align-items: center; gap: 16px; padding: 14px 18px; }
.section > summary::-webkit-details-marker { display: none; }
.section > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 14px; }
.thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; background: var(--rule); display: block; }
.head { display: grid; gap: 2px; min-width: 0; }
.head .title { font: 700 1.35rem/1.1 var(--display); }
.head .where { color: var(--muted); font-size: 0.88rem; }
.count { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.state { font-size: 0.8rem; font-weight: 600; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
.state.pass { background: var(--pass-bg); color: var(--pass); }
.state.fail { background: var(--fail-bg); color: var(--fail); }
.section .body { padding: 4px 18px 22px; border-top: 1px solid var(--rule); }
.videos { display: grid; gap: 26px; padding-top: 18px; }
.video { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 22px; align-items: start; }
.video .about { display: grid; gap: 8px; min-width: 0; }
.shape { font: 500 0.74rem var(--mono); color: var(--muted); vertical-align: middle; margin-left: 6px; }
.slot { color: var(--accent); font-size: 0.88rem; }
.facts { color: var(--muted); font-size: 0.86rem; font-variant-numeric: tabular-nums; }
.flag { background: var(--flag-bg); color: var(--flag); border-radius: 6px; padding: 1px 6px; }
.fails { grid-column: 1 / -1; color: var(--fail); font-weight: 600; }
button.open { all: unset; cursor: pointer; display: block; position: relative; border-radius: 10px; overflow: hidden; background: var(--rule); }
button.open:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
button.open img { display: block; width: 100%; height: auto; }
.poster.portrait { aspect-ratio: 9 / 16; max-width: 100%; }
.poster img { width: 100%; height: 100%; object-fit: cover; }
.play { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(15, 12, 8, 0.72); }
.play::after { content: ''; position: absolute; left: 22px; top: 17px; border-style: solid; border-width: 11px 0 11px 17px; border-color: transparent transparent transparent #fff; }
ul.badges { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.badge { font-size: 0.78rem; border-radius: 6px; padding: 3px 8px; display: inline-flex; gap: 6px; align-items: baseline; }
.badge.pass { background: var(--pass-bg); color: var(--pass); }
.badge.fail { background: var(--fail-bg); color: var(--fail); }
.badge .detail { opacity: 0.8; font-variant-numeric: tabular-nums; }
details.inner > summary { cursor: pointer; color: var(--muted); font-size: 0.88rem; }
details.inner > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
ol.script { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
ol.script li { display: grid; grid-template-columns: 4.2em minmax(0, 1fr) auto; gap: 12px; align-items: baseline; }
ol.script .t { font: 500 0.8rem var(--mono); color: var(--muted); text-align: right; }
ol.script .line { font-family: var(--display); font-size: 1.15rem; line-height: 1.3; }
ol.script .beat { font: 0.74rem var(--mono); color: var(--muted); }
.frames { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.frames img { border-radius: 8px; max-width: 100%; height: auto; }
.frames .sheet { flex: 1 1 420px; min-width: 0; }
.frames .last { width: 160px; }
.stills { display: grid; gap: 18px; padding-top: 18px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
.still { margin: 0; display: grid; gap: 8px; align-content: start; }
.still figcaption { display: grid; gap: 2px; font-size: 0.8rem; }
.still .name { color: var(--ink); overflow-wrap: anywhere; }
.still .state { justify-self: start; margin-top: 4px; }
footer { color: var(--muted); font-size: 0.84rem; }
dialog.viewer { width: min(1100px, 94vw); max-height: 92vh; border: 0; border-radius: 14px; padding: 0; background: var(--surface); color: var(--ink); }
dialog.viewer::backdrop { background: rgba(10, 8, 6, 0.8); }
.viewer .frame { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: 92vh; }
.viewer .bar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
.viewer .bar .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer button { font: 500 0.88rem var(--body); color: var(--ink); background: transparent; border: 1px solid var(--rule); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.viewer button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.viewer .stage { display: grid; place-items: center; background: #0d0b09; min-height: 0; overflow: hidden; }
.viewer .stage img, .viewer .stage video { max-width: 100%; max-height: calc(92vh - 130px); display: block; }
.viewer .meta { padding: 10px 14px; display: grid; gap: 6px; }
@media (max-width: 760px) {
  dialog.viewer { width: 100vw; max-width: 100vw; height: 100%; max-height: 100%; border-radius: 0; margin: 0; }
  .viewer .frame { max-height: 100%; height: 100%; }
  .video { grid-template-columns: minmax(0, 1fr); }
  .video .poster.portrait { max-width: 240px; }
  .section > summary { grid-template-columns: 56px 1fr; }
  .thumb { width: 56px; height: 56px; }
  .count, .section > summary .state { grid-column: 2; justify-self: start; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
<div class="wrap">
  <header>
    <p class="eyebrow">Press kit</p>
    <h1>Tales Unwritten</h1>
    <p class="summary">
      <span><b>${assetCount}</b> assets</span>
      <span><b>${passed}</b> of ${allChecks.length} checks pass</span>
      <span>commit <b class="mono">${esc(commit)}</b></span>
      <span>review copies <b>${MB(0)}</b></span>
      <span>production spend <b>$${(money.tales + money.voices).toFixed(2)}</b></span>
    </p>
    ${dry ? `<p class="dry"><b>Placeholder tales.</b> The stories on screen were written by the app’s built-in mock storyteller, because this build had no Gemini key. The voices, shots, cuts, timings and checks are final; run again with a key for real tales.</p>` : ''}
    <nav class="contents" aria-label="Sections">${contents.map((id) => `<a href="#${id}">${names[id] ?? id}</a>`).join('')}</nav>
  </header>
  ${sections.join('')}
  <footer>Generated by <span class="mono">npm run promo:gallery</span> on ${new Date().toISOString().slice(0, 10)}. Media here are review copies; each caption gives the master’s true size and weight.</footer>
</div>
<dialog class="viewer" aria-label="Viewer">
  <div class="frame">
    <div class="bar">
      <span class="name mono"></span>
      <button type="button" data-step="-1" aria-label="Previous">←</button>
      <button type="button" data-step="1" aria-label="Next">→</button>
      <button type="button" class="close">Close</button>
    </div>
    <div class="stage"></div>
    <div class="meta"><span class="facts"></span><ul class="badges"></ul></div>
  </div>
</dialog>
<script>
const GROUPS = ${JSON.stringify(groups)};
// Media load only when their own drawer opens.
for (const d of document.querySelectorAll('details')) {
  d.addEventListener('toggle', () => {
    if (!d.open) return
    for (const el of d.querySelectorAll('[data-src]')) if (el.closest('details') === d) { el.src = el.dataset.src; el.removeAttribute('data-src') }
  })
}
// A contents link opens the drawer it points to.
for (const a of document.querySelectorAll('nav.contents a')) a.addEventListener('click', () => { const d = document.getElementById(a.getAttribute('href').slice(1)); if (d && !d.open) d.open = true })
const dialog = document.querySelector('dialog.viewer')
const stage = dialog.querySelector('.stage')
let at = null, opener = null, viaHistory = false
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) }
function show(group, index) {
  const list = GROUPS[group]
  index = (index + list.length) % list.length
  at = { group, index }
  const item = list[index]
  stage.innerHTML = item.type === 'video'
    ? '<video controls playsinline preload="metadata" poster="' + item.poster + '" src="' + item.src + '"></video>'
    : '<img alt="' + esc(item.name) + '" src="' + item.src + '">'
  dialog.querySelector('.name').textContent = item.name
  dialog.querySelector('.facts').textContent = item.facts
  dialog.querySelector('.badges').innerHTML = item.checks.map((c) => '<li class="badge ' + (c.ok ? 'pass' : 'fail') + '">' + (c.ok ? '✓ ' : '✕ ') + esc(c.name) + ' <span class="detail">' + esc(c.detail) + '</span></li>').join('')
  for (const b of dialog.querySelectorAll('[data-step]')) b.hidden = list.length < 2
}
function open(group, index, from) {
  opener = from
  show(group, index)
  if (!dialog.open) { dialog.showModal(); try { history.pushState({ viewer: 1 }, '', location.href); viaHistory = true } catch { viaHistory = false } }
  dialog.querySelector('.close').focus()
}
function shut() {
  stage.innerHTML = ''
  if (dialog.open) dialog.close()
  opener?.focus()
}
function close() { if (viaHistory) { viaHistory = false; history.back() } else shut() }
addEventListener('popstate', () => { viaHistory = false; if (dialog.open) shut() })
for (const b of document.querySelectorAll('button.open')) b.addEventListener('click', () => open(b.dataset.group, Number(b.dataset.index), b))
dialog.querySelector('.close').addEventListener('click', close)
dialog.addEventListener('cancel', (e) => { e.preventDefault(); close() })
dialog.addEventListener('click', (e) => { if (e.target === dialog) close() })
for (const b of dialog.querySelectorAll('[data-step]')) b.addEventListener('click', () => show(at.group, at.index + Number(b.dataset.step)))
dialog.addEventListener('keydown', (e) => {
  // Arrows belong to a focused video (seeking); Tab never leaves the viewer.
  const inVideo = document.activeElement?.tagName === 'VIDEO'
  if (e.key === 'ArrowRight' && !inVideo) show(at.group, at.index + 1)
  else if (e.key === 'ArrowLeft' && !inVideo) show(at.group, at.index - 1)
  else if (e.key === 'Tab') {
    // Keep focus inside the viewer.
    const f = [...dialog.querySelectorAll('button:not([hidden]), video')]
    const i = f.indexOf(document.activeElement)
    e.preventDefault()
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus()
  }
})
</script>
`
}

// ---------------------------------------------------------------- main

if (process.argv.includes('--approve')) {
  if (!existsSync(path.join(GALLERY, 'index.html'))) throw new Error('nothing built yet: npm run promo:gallery')
  const html = readFileSync(path.join(GALLERY, 'index.html'), 'utf8')
  if (html.includes('class="dry"') && !process.argv.includes('--force')) throw new Error('this gallery shows the mock storyteller’s placeholder tales; approve a real run, or pass --force')
  const dest = path.join(PROMO, 'gallery')
  rmSync(dest, { recursive: true, force: true })
  cpSync(GALLERY, dest, { recursive: true })
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
  writeFileSync(path.join(dest, 'APPROVED'), `${new Date().toISOString()} from ${commit}\n`)
  log(`approved into ${path.relative(ROOT, dest)}: commit it`)
  process.exit(0)
}

rmSync(path.join(GALLERY, 'index.html'), { force: true })
mkdirSync(GALLERY, { recursive: true })
const videos = collectVideos()
const stills = collectStills()
const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
const dry = PROVIDER !== 'gemini'
let html = page({ videos, stills, commit, money: spend(), dry })
writeFileSync(path.join(GALLERY, 'index.html'), html)
// The folder's size is only known once the page is in it.
html = html.replace('review copies <b>0.00 MB</b>', `review copies <b>${MB(folderSize(GALLERY))}</b>`)
writeFileSync(path.join(GALLERY, 'index.html'), html)
const flagged = [...videos.flatMap((v) => v.checks), ...stills.flatMap((s) => s.checks)].filter((c) => !c.ok).length
log(`gallery: ${videos.length + stills.length} assets, ${flagged} flagged, ${MB(folderSize(GALLERY))} → ${path.relative(ROOT, path.join(GALLERY, 'index.html'))}`)

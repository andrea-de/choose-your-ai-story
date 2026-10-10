// Stills: the real app's screens at exact pixels, and compositions made from
// them as code (social posts, a square, the link-preview card).
//
//   node promo/stills.mjs               screens, then compositions
//   node promo/stills.mjs --compose     compositions only, from the screens already taken
//   node promo/stills.mjs --skip-build  reuse the current app build
//
// Compositions are laid out in HTML in the app's own type and checked after
// layout: copy that overflows its box, or a device over the copy, fails the build.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildApp, DATA, log, OUT, PROMO, ROOT, startApp } from './lib/app.mjs'
import { closeBrowser, launch, newPage } from './lib/capture.mjs'

const args = process.argv.slice(2)
const STILLS = path.join(OUT, 'stills')
const SCREENS = path.join(STILLS, 'screens')
const copy = JSON.parse(readFileSync(path.join(PROMO, 'copy.json'), 'utf8'))

/** Which promo tale stands for each kind of book. */
export const TALE_FOR = { 'historic-fantasy': 'lamplighter', future: 'engineer', noir: 'pharmacist', pirate: 'cartographer', dream: 'painter', ancient: 'shepherd' }
const THEMES = Object.keys(TALE_FOR)

/** Each book's colours, read off its own pages: ground, ink, accent. */
const PALETTE = {
  'historic-fantasy': { ground: '#efe3c6', ink: '#3a2414', accent: '#9b2a1c', dark: false },
  future: { ground: '#08111d', ink: '#d7f6ff', accent: '#4fd8e6', dark: true },
  noir: { ground: '#dcd7cb', ink: '#1d1c1a', accent: '#b3322b', dark: false },
  pirate: { ground: '#e6d8b8', ink: '#1f3346', accent: '#8a3b1d', dark: false },
  dream: { ground: '#1d1636', ink: '#f6ecff', accent: '#f2b8da', dark: true },
  ancient: { ground: '#ead6a6', ink: '#24170d', accent: '#b0502a', dark: false },
}

// ---------------------------------------------------------------- screens

/** The screens worth showing, in both shapes. `go` puts the page in that state. */
function screenList(tale) {
  const list = [
    { name: 'title', start: '/', async go() {} },
    {
      name: 'books',
      start: '/',
      async go(page) {
        await page.getByRole('button', { name: 'Begin a new tale' }).click()
        await page.getByRole('heading', { name: 'Choose your book' }).waitFor()
      },
    },
    {
      name: 'new-tale',
      start: '/',
      async go(page) {
        await page.getByRole('button', { name: 'Begin a new tale' }).click()
        await page.getByRole('radio', { name: /Historic Fantasy/ }).click()
        await page.getByRole('button', { name: /^Open/ }).click()
        await page.getByRole('heading', { name: 'Begin a new tale' }).waitFor()
      },
    },
    {
      name: 'cover',
      start: `/s/${tale('lamplighter').id}`,
      async go(page) {
        await page.locator('[data-leaf=cover] .cover-map').waitFor()
      },
    },
    {
      name: 'settings',
      start: `/s/${tale('shepherd').id}/${tale('shepherd').pages[0]}`,
      async go(page) {
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached' })
        await page.getByRole('button', { name: 'Settings' }).click()
        await page.getByRole('radiogroup', { name: 'Narration' }).waitFor()
      },
    },
  ]
  for (const theme of THEMES) {
    const t = tale(TALE_FOR[theme])
    // The page's opening sheet, its words and sketch all shown.
    list.push({
      name: `page-${theme}`,
      theme,
      start: `/s/${t.id}/${t.pages[1]}`,
      async go(page) {
        // One tap shows the whole first sheet, as a reader's tap does.
        const current = page.getByTestId('current-page')
        await current.getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
        await current.getByTestId('page-text').click({ position: { x: 8, y: 8 } })
      },
    })
    // And the sheet the page ends on: its choices, each naming a page.
    list.push({
      name: `choices-${theme}`,
      theme,
      start: `/s/${t.id}/${t.pages[1]}`,
      async go(page, { readAhead }) {
        await readAhead()
      },
    })
  }
  return list
}

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
    return
  }
}

async function takeScreens() {
  const index = JSON.parse(readFileSync(path.join(DATA, 'tales.index.json'), 'utf8'))
  const tale = (key) => index.tales[key]
  if (!args.includes('--skip-build')) buildApp()
  // Its own port, so stills and videos can be made at the same time.
  const app = await startApp({ scratch: true, port: 3318 })
  rmSync(SCREENS, { recursive: true, force: true })
  mkdirSync(SCREENS, { recursive: true })
  const shots = []
  try {
    for (const profile of ['portrait', 'landscape']) {
      for (const screen of screenList(tale)) {
        const { page, context } = await newPage({ profile, settings: { sfx: false, ambience: false } })
        try {
          await page.goto(app.url + screen.start, { waitUntil: 'networkidle' })
          await page.evaluate(() => document.fonts.ready)
          await screen.go(page, { readAhead: () => readAhead(page) })
          // Let page turns, fades and drawn sketches finish.
          await page.waitForTimeout(2200)
          await page.evaluate(() => document.getElementById('promo-tick')?.remove())
          const file = path.join(SCREENS, `${profile}-${screen.name}.png`)
          await page.screenshot({ path: file, animations: 'disabled' })
          shots.push({ file, profile, name: screen.name, theme: screen.theme })
          log(`screen ${profile}/${screen.name}`)
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    await app.stop()
  }
  writeFileSync(path.join(SCREENS, 'screens.json'), JSON.stringify(shots.map((s) => ({ ...s, file: path.basename(s.file) })), null, 2))
}

// ---------------------------------------------------------------- compositions

const font = (pkg, file) => pathToFileURL(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file)).href
const FONTS = `
@font-face { font-family: 'Cormorant Garamond'; font-weight: 500; src: url(${font('cormorant-garamond', 'cormorant-garamond-latin-500-normal.woff2')}); }
@font-face { font-family: 'Cormorant Garamond'; font-weight: 500; font-style: italic; src: url(${font('cormorant-garamond', 'cormorant-garamond-latin-500-italic.woff2')}); }
@font-face { font-family: 'Cormorant Garamond'; font-weight: 700; src: url(${font('cormorant-garamond', 'cormorant-garamond-latin-700-normal.woff2')}); }
@font-face { font-family: 'IM Fell English SC'; src: url(${font('im-fell-english-sc', 'im-fell-english-sc-latin-400-normal.woff2')}); }
`

const BASE_CSS = `${FONTS}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { font-family: 'Cormorant Garamond', serif; -webkit-font-smoothing: antialiased; }
.phone { position: absolute; border-radius: 6.2% / 3.2%; background: #0d0b0a; padding: 1.6%; box-shadow: 0 30px 70px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.08) inset; }
.phone img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 5.2% / 2.7%; }
[data-fit] { text-wrap: balance; }
.kicker { font-family: 'IM Fell English SC', serif; letter-spacing: 0.14em; text-transform: lowercase; }
`

/** Fits each [data-fit] element's text to its box: shrink until it fits `data-lines` lines, no smaller than `data-min` px. */
const FIT = `
for (const el of document.querySelectorAll('[data-fit]')) {
  const min = Number(el.dataset.min), lines = Number(el.dataset.lines)
  let size = parseFloat(getComputedStyle(el).fontSize)
  const fits = () => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * lines + 2
  while (!fits() && size > min) { size -= 2; el.style.fontSize = size + 'px' }
  el.dataset.fitted = fits() ? 'yes' : 'no'
}
`

/** After layout: every [data-copy] box fits, and no [data-device] overlaps any [data-copy]. */
async function checkLayout(page, name) {
  const problems = await page.evaluate(() => {
    const out = []
    const rect = (el) => el.getBoundingClientRect()
    const copyEls = [...document.querySelectorAll('[data-copy]')]
    for (const el of document.querySelectorAll('[data-fit]')) if (el.dataset.fitted !== 'yes') out.push(`“${el.textContent.trim().slice(0, 40)}” does not fit`)
    for (const el of copyEls) {
      const r = rect(el)
      if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push(`“${el.textContent.trim().slice(0, 40)}” runs off the canvas`)
    }
    for (const d of document.querySelectorAll('[data-device]')) {
      const a = rect(d)
      for (const el of copyEls) {
        const b = rect(el)
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`a device covers “${el.textContent.trim().slice(0, 40)}”`)
      }
    }
    return out
  })
  if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`)
}

async function render(html, { width, height, file, name }) {
  const b = await launch()
  const page = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const htmlFile = path.join(STILLS, 'work', `${name}.html`)
  mkdirSync(path.dirname(htmlFile), { recursive: true })
  writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}</style>${html}<script>document.fonts.ready.then(() => { ${FIT}; document.body.dataset.ready = 1 })</script>`)
  await page.goto(pathToFileURL(htmlFile).href)
  await page.waitForSelector('body[data-ready]')
  await page.waitForLoadState('networkidle')
  await checkLayout(page, name)
  await page.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 92 : undefined })
  await page.close()
  log(`composed ${path.relative(STILLS, file)}`)
}

const img = (name) => pathToFileURL(path.join(SCREENS, name)).href

/** 1080×1350: the copy above, the book's own page below in a phone, cropped by the edge. */
function postHtml(theme) {
  const p = PALETTE[theme]
  const c = copy.posts[theme]
  return `
<body style="background:${p.ground};color:${p.ink}">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, ${p.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'}, transparent 60%)"></div>
  <div data-copy style="position:absolute;left:84px;right:84px;top:76px;text-align:center">
    <div class="kicker" style="font-size:30px;color:${p.accent}">${c.kicker}</div>
  </div>
  <div data-copy data-fit data-lines="2" data-min="54" style="position:absolute;left:84px;right:84px;top:128px;text-align:center;font-weight:700;font-size:78px;line-height:1.04">${c.headline}</div>
  <div data-copy data-fit data-lines="2" data-min="30" style="position:absolute;left:120px;right:120px;top:312px;text-align:center;font-style:italic;font-size:38px;line-height:1.2;opacity:0.85">${c.sub}</div>
  <div class="phone" data-device style="left:270px;top:452px;width:540px;height:960px"><img src="${img(`portrait-${c.screen ?? 'page'}-${theme}.png`)}"></div>
</body>`
}

/** 1080×1080: the six books side by side, and what they have in common. */
function squareHtml() {
  const tiles = THEMES.map((t) => `<div data-device style="position:relative;border-radius:18px;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,0.35)"><img src="${img(`portrait-page-${t}.png`)}" style="width:100%;height:100%;object-fit:cover;object-position:top"></div>`).join('')
  return `
<body style="background:#1b130c;color:#f3e6c8">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%, rgba(201,169,106,0.18), transparent 65%)"></div>
  <div data-copy data-fit data-lines="1" data-min="60" style="position:absolute;left:60px;right:60px;top:52px;text-align:center;font-weight:700;font-size:84px;line-height:1.05">${copy.brand.title}</div>
  <div data-copy data-fit data-lines="2" data-min="26" style="position:absolute;left:110px;right:110px;top:156px;text-align:center;font-style:italic;font-size:34px;line-height:1.22;opacity:0.9">${copy.brand.six}</div>
  <div style="position:absolute;left:70px;right:70px;top:270px;bottom:56px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:22px">${tiles}</div>
</body>`
}

/** 1200×630: the link-preview card. Title and line on the left, three books fanned on the right. */
function ogHtml() {
  const fan = [
    ['dream', -8, 676, 78],
    ['noir', 5, 948, 46],
    ['historic-fantasy', -1, 812, 26],
  ]
    .map(([t, deg, left, top]) => `<div class="phone" data-device style="left:${left}px;top:${top}px;width:250px;height:444px;transform:rotate(${deg}deg)"><img src="${img(`portrait-page-${t}.png`)}"></div>`)
    .join('')
  return `
<body style="background:#efe3c6;color:#3a2414">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 20% 40%, rgba(255,255,255,0.6), transparent 60%)"></div>
  <div data-copy class="kicker" style="position:absolute;left:72px;top:150px;font-size:26px;color:#9b2a1c">a gamebook</div>
  <div data-copy data-fit data-lines="2" data-min="56" style="position:absolute;left:68px;width:520px;top:190px;font-weight:700;font-size:92px;line-height:1">${copy.brand.title}</div>
  <div data-copy data-fit data-lines="2" data-min="26" style="position:absolute;left:72px;width:500px;top:392px;font-style:italic;font-size:36px;line-height:1.2;opacity:0.85">${copy.brand.tagline}</div>
  ${fan}
</body>`
}

async function compose() {
  if (!existsSync(path.join(SCREENS, 'screens.json'))) throw new Error('no screens yet: run without --compose first')
  const posts = path.join(STILLS, 'posts')
  mkdirSync(posts, { recursive: true })
  for (const theme of THEMES) await render(postHtml(theme), { width: 1080, height: 1350, file: path.join(posts, `post-${theme}.jpg`), name: `post-${theme}` })
  await render(squareHtml(), { width: 1080, height: 1080, file: path.join(posts, 'square-six-books.jpg'), name: 'square' })
  await render(ogHtml(), { width: 1200, height: 630, file: path.join(STILLS, 'og-card.png'), name: 'og-card' })
}

try {
  if (!args.includes('--compose')) await takeScreens()
  await compose()
} finally {
  await closeBrowser()
}

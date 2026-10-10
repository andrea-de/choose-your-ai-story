// Social shorts from a reader's point of view: not ads. No presenter, no logo
// card, no music laid over the top; one plain voice for the reader across the
// series, saying only what is happening, with subtitles only while it speaks.
// Each is one continuous take, as a screen recording would be, and ends inside
// the app. While a synthetic voice stands in for a real reader's, a small
// disclosure shows as it speaks.
//
// Lines must stay true whatever the storyteller writes: they describe what the
// app does, never what a particular page says.
const common = {
  speaker: 'reader',
  profiles: ['portrait'],
  limit: { portrait: 45 },
  subtitles: true,
  disclosure: 'sample voice: synthetic',
  slots: { portrait: 'Social short (Reels, Shorts, TikTok), 9:16' },
}

/** From the title page to a kind of book's new-tale form. */
async function toForm(page, name) {
  await page.getByRole('button', { name: 'Begin a new tale' }).click()
  await page.getByRole('radio', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await page.locator('#hero').waitFor()
  await page.waitForTimeout(1200)
}

async function typeInto(page, selector, text) {
  const field = page.locator(selector)
  await field.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text, { delay: 38 })
}

const shorts = [
  {
    ...common,
    name: 'short-case-file',
    title: 'Short: my own case file',
    about: 'A reader makes a noir tale starring themself: types who they are and where, opens the case, and turns to the page their first choice names.',
    lines: {
      want: 'I wanted a detective story, starring me.',
      where: 'On the night shift, at the drugstore where I work.',
      wrote: 'It wrote me a whole case file.',
      choice: 'And every choice sends you to another page.',
    },
    beats: [
      {
        name: 'case',
        start: '/',
        async before({ page }) {
          await toForm(page, 'Noir')
        },
        async run({ page, say, tap, wait, readAhead }) {
          await wait(0.6)
          const want = say('want', { wait: false })
          await typeInto(page, '#hero', 'a night-shift pharmacist who notices everything')
          await want
          const where = say('where', { wait: false })
          await typeInto(page, '#setting', 'an all-night drugstore on Sunset')
          await where
          await tap(page.getByRole('button', { name: 'Open the Case' }))
          await page.locator('[data-leaf=cover] .cover-begin').waitFor({ timeout: 60_000 })
          await wait(1.0)
          await say('wrote')
          await tap(page.locator('[data-leaf=cover] .cover-begin'))
          await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
          await wait(2.4)
          await readAhead()
          await wait(0.6)
          await say('choice')
          await tap(page.getByTestId('current-page').locator('.choice').first(), 0.3)
          await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
          await wait(2.6)
        },
      },
    ],
  },
  {
    ...common,
    name: 'short-shared-book',
    title: 'Short: a book everyone shares',
    about: 'A reader opens a tale others have read, sees on its map which pages are already written, then takes a choice nobody has taken, and the page is written for them.',
    lines: {
      shared: 'This book is shared with everyone who reads it.',
      dots: 'Every filled dot is a page that has already been written.',
      untaken: 'So I took a choice nobody had taken yet.',
      kept: 'And now that page is there for the next reader.',
    },
    beats: [
      {
        name: 'shared',
        start: ({ tale }) => `/s/${tale('lamplighter').id}`,
        async before({ page }) {
          await page.locator('[data-leaf=cover] .cover-map').waitFor()
          await page.waitForTimeout(1000)
        },
        async run({ page, say, tap, wait, readAhead, tale }) {
          await wait(0.6)
          await say('shared')
          await wait(0.3)
          await say('dots')
          await tap(page.locator('[data-leaf=cover] .cover-begin'))
          const current = page.getByTestId('current-page')
          await current.getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
          await wait(1.2)
          await readAhead()
          await wait(0.6)
          // Off the path the tales were read along: a page written, but never read.
          const taken = tale('lamplighter').pages[1]
          await tap(current.locator(`.choice:not([data-target="${taken}"])`).first(), 0.3)
          await current.getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
          await wait(1.0)
          await readAhead()
          await wait(0.5)
          await say('untaken')
          const untaken = current.locator('.choice:has(.choice-unwritten)')
          await tap((await untaken.count()) ? untaken.first() : current.locator('.choice').first(), 0.3)
          await current.getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
          await wait(2.0)
          await say('kept')
          await wait(1.8)
        },
      },
    ],
  },
  {
    ...common,
    name: 'short-bedtime',
    title: 'Short: read aloud at bedtime',
    about: 'A parent at bedtime: their child picks what happens, the page turns, and the book’s own narrator reads it aloud.',
    // Ends where the narrator first pauses after six seconds, the picture and sound fading together.
    fadeOut: 1.0,
    lines: {
      picks: 'At bedtime, my daughter picks what happens next.',
      reads: 'And then the book reads it to her.',
    },
    beats: [
      {
        name: 'bedtime',
        start: ({ tale }) => `/s/${tale('painter').id}/${tale('painter').pages[1]}`,
        endAtPause: { after: 'narrator', min: 6 },
        async before({ page, readAhead }) {
          // Read this page first, then switch the narrator on in the settings: a page
          // already read is not read aloud again, so it waits for the next one.
          await readAhead()
          await page.getByRole('button', { name: 'Settings' }).click()
          await page.getByRole('radiogroup', { name: 'Narration' }).getByRole('radio', { name: 'active', exact: true }).click()
          await page.getByRole('button', { name: 'Close settings' }).click()
          await page.waitForTimeout(1500)
        },
        async run({ page, say, tap, wait, mark }) {
          await wait(0.8)
          await say('picks')
          await wait(0.2)
          // Said before the page turns, so nobody talks over the narrator.
          await say('reads')
          await tap(page.getByTestId('current-page').locator('.choice').first(), 0.1)
          mark('narrator')
          await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
          await wait(12)
        },
      },
    ],
  },
]

export default shorts

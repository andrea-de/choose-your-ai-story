// The promo tour: what Tales Unwritten is, shown in the running app, with a
// presenter who speaks in a voice unlike any of the app's narrators. Recorded
// as separate beats so one can be retaken or reworded alone (`--post` re-mixes
// without recording again). Every shot is the real app; the only thing laid
// over it is the closing card.
const tour = {
  name: 'tour',
  title: 'Promo tour',
  speaker: 'presenter',
  profiles: ['portrait', 'landscape'],
  // Shorts/Reels/TikTok take 60 s comfortably; YouTube and a site hero have no limit worth meeting.
  limit: { portrait: 60, landscape: 75 },
  subtitles: false,
  slots: {
    portrait: 'Social video (Reels, Shorts, TikTok), 9:16',
    landscape: 'YouTube and the site’s hero video, 16:9',
  },
  lines: {
    hello: 'This is a gamebook that writes itself as you read.',
    books: 'Pick a kind of book. Each has its own paper, its own voice, and its own way of turning the page.',
    begin: 'Say who you are and where it begins, or roll the dice.',
    first: 'Page one is written for you, as you watch.',
    choice: 'Every choice sends you to a page. If nobody has been there yet, it is written on the spot.',
    turns: 'And each kind of book turns its pages its own way.',
    narrator: 'Switch on the narrator, and every page is read aloud.',
    kept: 'Every page is kept. The next reader can follow your path, or find a new one.',
  },
  beats: [
    {
      name: 'title',
      start: '/',
      async run({ page, say, tap, wait }) {
        await wait(0.8)
        await say('hello')
        await tap(page.getByRole('button', { name: 'Begin a new tale' }))
        await wait(0.9)
      },
    },
    {
      name: 'books',
      start: '/',
      async before({ page }) {
        await page.getByRole('button', { name: 'Begin a new tale' }).click()
        await page.getByRole('heading', { name: 'Choose your book' }).waitFor()
        await page.waitForTimeout(1200)
      },
      async run({ page, say, tap, wait }) {
        const spoken = say('books', { wait: false })
        for (const theme of ['Future', 'Noir', 'Pirate', 'Dreamscape', 'Ancient', 'Historic Fantasy']) {
          await tap(page.getByRole('radio', { name: new RegExp(theme) }), 0.6)
        }
        await spoken
        await wait(0.4)
      },
    },
    {
      name: 'begin',
      start: '/',
      async before({ page }) {
        await page.getByRole('button', { name: 'Begin a new tale' }).click()
        await page.getByRole('radio', { name: /Historic Fantasy/ }).click()
        await page.getByRole('button', { name: /^Open/ }).click()
        await page.getByRole('heading', { name: 'Begin a new tale' }).waitFor()
        await page.waitForTimeout(1200)
      },
      async run({ page, say, tap, wait, mark }) {
        const spoken = say('begin', { wait: false })
        await wait(0.6)
        await tap(page.getByRole('button', { name: 'Roll the dice' }), 0.9)
        await tap(page.getByRole('button', { name: 'Roll the dice' }), 0.9)
        await spoken
        await tap(page.getByRole('button', { name: 'Begin', exact: true }))
        // The tale is begun for real: its cover comes when the storyteller has its title.
        await page.locator('[data-leaf=cover] .cover-begin').waitFor({ timeout: 60_000 })
        mark('cover')
        await wait(1.4)
        const first = say('first', { wait: false })
        await tap(page.locator('[data-leaf=cover] .cover-begin'))
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
        await first
        await wait(2.0)
      },
    },
    {
      name: 'choice',
      start: ({ tale }) => `/s/${tale('lamplighter').id}/${tale('lamplighter').pages[1]}`,
      async before({ readAhead }) {
        await readAhead()
      },
      async run({ page, say, tap, wait }) {
        await wait(0.5)
        const spoken = say('choice', { wait: false })
        await wait(1.8)
        await tap(page.getByTestId('current-page').locator('.choice').first(), 0.2)
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
        await spoken
        await wait(0.9)
      },
    },
    {
      name: 'turns',
      start: ({ tale }) => `/s/${tale('pharmacist').id}/${tale('pharmacist').pages[1]}`,
      async before({ readAhead }) {
        await readAhead()
      },
      async run({ page, say, tap, wait }) {
        await wait(0.3)
        const spoken = say('turns', { wait: false })
        await wait(0.5)
        await tap(page.getByTestId('current-page').locator('.choice').first(), 0.2)
        await spoken
        await wait(0.6)
      },
    },
    ...['engineer', 'painter'].map((key) => ({
      name: `turns-${key}`,
      start: ({ tale }) => `/s/${tale(key).id}/${tale(key).pages[1]}`,
      async before({ readAhead }) {
        await readAhead()
      },
      async run({ page, tap, wait }) {
        await wait(0.4)
        await tap(page.getByTestId('current-page').locator('.choice').first(), 1.9)
      },
    })),
    {
      name: 'narrator',
      start: ({ tale }) => `/s/${tale('shepherd').id}/${tale('shepherd').pages[0]}`,
      async before({ page }) {
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached' })
        await page.waitForTimeout(800)
      },
      async run({ page, say, tap, wait }) {
        const spoken = say('narrator', { wait: false })
        await tap(page.getByRole('button', { name: 'Settings' }), 1.0)
        await tap(page.getByRole('radiogroup', { name: 'Narration' }).getByRole('radio', { name: 'active', exact: true }), 0.9)
        await spoken
        await tap(page.getByRole('button', { name: 'Close settings' }), 0.8)
        // Nothing said over the narrator: let it read.
        // Switching it on may start the reading by itself; if not, the ribbon does.
        const play = page.getByRole('button', { name: 'Play the narrator' })
        if (await play.isVisible()) await tap(play, 0.2)
        await wait(5.0)
      },
    },
    {
      name: 'kept',
      start: ({ tale }) => `/s/${tale('lamplighter').id}`,
      async before({ page }) {
        await page.locator('[data-leaf=cover] .cover-map').waitFor()
        await page.waitForTimeout(1000)
      },
      async run({ say, wait, endCard }) {
        await wait(0.6)
        await say('kept')
        await wait(1.0)
        await endCard({ title: 'Tales Unwritten', line: 'A gamebook that writes itself as you read.' })
        await wait(2.4)
      },
    },
  ],
}

export default tour

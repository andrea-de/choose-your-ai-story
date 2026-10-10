// The promo tour: what Tales Unwritten is, shown in the running app, with a
// presenter who speaks in a voice unlike any of the app's narrators. Recorded
// as separate beats so one can be retaken or reworded alone (`--post` re-mixes
// without recording again). Every shot is the real app; the only thing laid
// over it is the closing card.
const tour = {
  name: 'tour',
  title: 'Promo tour',
  speaker: 'presenter',
  // Mobile only: 9:16, for Reels, Shorts and TikTok.
  profiles: ['portrait'],
  // Reels, Shorts and TikTok all take 60 s.
  limit: { portrait: 60 },
  subtitles: false,
  slots: {
    portrait: 'Social video (Reels, Shorts, TikTok), 9:16',
  },
  // The story it tells: a book that is blank until you turn to the page; worlds
  // that are each a whole different book; you choose, it writes, it reads to you,
  // and what you wrote stays for the next reader.
  lines: {
    hello: 'Every page in this book is blank, until you turn to it.',
    books: 'Pick your world. Deep space, noir, pirates, dreams, ancient myth, or old-world fantasy.',
    begin: 'Tell it who you are, or roll the dice.',
    first: 'Seconds later, there is your first page.',
    choice: 'Every choice sends you to a new page. If no one has been there, it is written just for you.',
    noir: 'In noir, it is a typed case file.',
    future: 'In deep space, the ship’s own log.',
    dream: 'In a dream, every page floats under a night sky.',
    narrator: 'Turn on the narrator, and it reads to you.',
    kept: 'Every page is kept, so the next reader can follow your path, or write a new one.',
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
          // In step with the line, which names them in this order.
          await tap(page.getByRole('radio', { name: new RegExp(theme) }), 0.78)
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
      async run({ page, say, tap, wait, mark, state }) {
        const spoken = say('begin', { wait: false })
        await wait(0.6)
        await tap(page.getByRole('button', { name: 'Roll the dice' }), 0.9)
        await tap(page.getByRole('button', { name: 'Roll the dice' }), 0.9)
        await spoken
        await tap(page.getByRole('button', { name: 'Begin', exact: true }))
        mark('begun')
        // The tale is begun for real; the beat is cut just after the tap, and the
        // next opens on its cover, so nobody watches the storyteller at work.
        await page.waitForURL(/\/s\/[a-z0-9]+$/, { timeout: 120_000 })
        state.tourTale = page.url().split('/').pop()
      },
      endAt: { after: 'begun', plus: 0.9 },
    },
    {
      name: 'first',
      start: ({ state }) => `/s/${state.tourTale}`,
      async before({ page, written, state }) {
        // Page one is written the first time anyone opens it: before filming, not on camera.
        await written(state.tourTale, [1])
        await page.locator('[data-leaf=cover] .cover-begin').waitFor({ timeout: 60_000 })
        await page.waitForTimeout(800)
      },
      async run({ page, say, tap, wait }) {
        await wait(0.4)
        const first = say('first', { wait: false })
        await tap(page.locator('[data-leaf=cover] .cover-begin'))
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
        await first
        await wait(1.5)
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
        await wait(1.5)
        await tap(page.getByTestId('current-page').locator('.choice').first(), 0.2)
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached', timeout: 60_000 })
        await spoken
        await wait(0.9)
      },
    },
    // Each world is its own book: the paper, type, sketches and the way its pages turn.
    ...[
      ['noir', 'pharmacist'],
      ['future', 'engineer'],
      ['dream', 'painter'],
    ].map(([line, key]) => ({
      name: `world-${line}`,
      start: ({ tale }) => `/s/${tale(key).id}/${tale(key).pages[1]}`,
      async before({ readAhead }) {
        await readAhead()
      },
      async run({ page, say, tap, wait }) {
        await wait(0.3)
        const spoken = say(line, { wait: false })
        await wait(0.6)
        await tap(page.getByTestId('current-page').locator('.choice').first(), 0.2)
        await spoken
        await wait(0.5)
      },
    })),
    {
      name: 'narrator',
      endAtPause: { after: 'narrator', min: 3 },
      start: ({ tale }) => `/s/${tale('shepherd').id}/${tale('shepherd').pages[0]}`,
      async before({ page }) {
        await page.getByTestId('current-page').getByTestId('prose').waitFor({ state: 'attached' })
        await page.waitForTimeout(800)
      },
      async run({ page, say, tap, wait, mark }) {
        // Said in full first: switching narration on starts the reading at once, and nobody talks over the narrator.
        await tap(page.getByRole('button', { name: 'Settings' }), 0.4)
        await say('narrator')
        await tap(page.getByRole('radiogroup', { name: 'Narration' }).getByRole('radio', { name: 'active', exact: true }), 0.9)
        await tap(page.getByRole('button', { name: 'Close settings' }), 0.8)
        // Nothing said over the narrator: let it read.
        // Switching it on may start the reading by itself; if not, the ribbon does.
        const play = page.getByRole('button', { name: 'Play the narrator' })
        if (await play.isVisible()) await tap(play, 0.2)
        mark('narrator')
        // Recorded long enough to reach a pause; the beat is cut there (endAtPause).
        await wait(9)
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

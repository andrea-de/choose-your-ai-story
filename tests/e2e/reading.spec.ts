import { expect, test, type Page } from '@playwright/test'

/** From the title page to the form for a new tale, in the chosen kind of book. */
async function openBook(page: Page, theme = 'Historic Fantasy') {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tales Unwritten' })).toBeVisible()
  await page.getByRole('button', { name: 'Begin a new tale' }).click()
  await page.getByRole('radio', { name: new RegExp(theme) }).click()
  await page.getByRole('button', { name: `Open ${theme}` }).click()
  await expect(page.getByRole('heading', { name: 'Begin a new tale' })).toBeVisible()
}

/** From a story's cover to its first page. */
async function openFirstPage(page: Page) {
  await page.waitForURL(/\/s\/[a-z0-9]+$/)
  await page.locator('[data-leaf=cover] .cover-begin').click()
  await page.waitForURL(/\/s\/[a-z0-9]+\/1$/)
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeAttached({ timeout: 20_000 })
}

async function beginTale(page: Page) {
  await openBook(page)
  await page.getByRole('button', { name: 'Begin', exact: true }).click()
  await openFirstPage(page)
}

/** Reads the current page to its end, turning sheets as needed. Returns what the page ends with. */
async function readToEnd(page: Page): Promise<'choices' | 'finis'> {
  for (let i = 0; i < 10; i++) {
    const current = page.getByTestId('current-page')
    await expect(current.getByTestId('prose')).toBeAttached({ timeout: 20_000 })
    // Tap the text near its top corner, clear of any choices lower down.
    await current.getByTestId('page-text').click({ position: { x: 8, y: 8 } })
    const next = current.locator('.sheet-next')
    if (await next.isEnabled()) {
      await next.click()
      await expect(page.locator('.leaf')).toHaveCount(1)
      continue
    }
    // The last sheet: what is on it now is in view (off-sheet content is only clipped, which Playwright ignores).
    const choices = current.getByRole('navigation', { name: 'Choices' })
    const finis = current.getByText('Finis')
    await expect(choices.or(finis)).toBeVisible()
    return (await finis.isVisible()) ? 'finis' : 'choices'
  }
  throw new Error('The page never ended')
}

async function readAhead(page: Page) {
  expect(await readToEnd(page)).toBe('choices')
}

/** Nothing on the page scrolls: not the document, not any element. */
async function expectNoScrolling(page: Page) {
  const report = await page.evaluate(() => {
    const doc = document.documentElement
    const scrollers = [...document.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el)
        const scrollsY = ['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1
        const scrollsX = ['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1
        return scrollsY || scrollsX
      })
      .map((el) => el.className)
    return { down: doc.scrollHeight - innerHeight, across: doc.scrollWidth - innerWidth, scrollers }
  })
  expect(report).toEqual({ down: 0, across: 0, scrollers: [] })
}

test('rolling the dice changes the tale’s settings', async ({ page }) => {
  await openBook(page)
  const hero = page.getByLabel('You are')
  const before = await hero.inputValue()
  await page.getByRole('button', { name: 'Roll the dice' }).click()
  await expect(hero).not.toHaveValue(before)
})

test('the Begin seal is disabled when a field is blank', async ({ page }) => {
  await openBook(page)
  await page.getByLabel('You are').fill('')
  await expect(page.getByRole('button', { name: 'Begin', exact: true })).toBeDisabled()
})

test('the title pages turn, and nothing on them scrolls', async ({ page }) => {
  await page.goto('/')
  await expectNoScrolling(page)
  await page.getByRole('button', { name: 'Begin a new tale' }).click()
  await expect(page.locator('.leaf.turning')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Choose your book' })).toBeVisible()
  await expect(page.locator('.leaf')).toHaveCount(1)
  await expectNoScrolling(page)
  await page.getByRole('button', { name: 'Open Historic Fantasy' }).click()
  await expect(page.locator('.leaf')).toHaveCount(1)
  await expectNoScrolling(page)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('.leaf.turning.backward')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Choose your book' })).toBeVisible()
})

test('begin a tale, read page 1, and turn to the page a choice names', async ({ page }) => {
  await beginTale(page)
  await expect(page.getByLabel('Page 1')).toBeVisible()
  await expectNoScrolling(page)
  await readAhead(page)

  const choice = page.getByTestId('current-page').locator('.choice').first()
  const target = (await choice.getAttribute('data-target'))!
  await choice.click()

  await expect(page).toHaveURL(new RegExp(`/s/[a-z0-9]+/${target}$`))
  await expect(page.getByTestId('current-page')).toHaveAttribute('data-page', target)
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeAttached({ timeout: 20_000 })
  await expect(page.locator('.leaf')).toHaveCount(1)
  await expectNoScrolling(page)
})

test('a page too long for a small screen runs on over sheets that turn', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await openBook(page, 'Noir')
  await page.getByRole('button', { name: 'Open the Case' }).click()
  await openFirstPage(page)
  const current = page.getByTestId('current-page')
  await expectNoScrolling(page)

  // The words keep their places as they appear: nothing on the sheet moves.
  const firstWord = current.locator('[data-w="0"]')
  const before = await firstWord.boundingBox()
  await current.getByTestId('page-text').click({ position: { x: 8, y: 8 } })
  expect(await firstWord.boundingBox()).toEqual(before)
  // Once read, the foot of the sheet shows where you are in the page.
  expect(await current.locator('.sheet-dots span').count()).toBeGreaterThan(1)

  await current.locator('.sheet-next').click()
  await expect(page.locator('.leaf.turning.forward')).toHaveCount(1)
  await expect(page.locator('.leaf')).toHaveCount(1)
  await expect(page.getByTestId('current-page').locator('.sheet-dots span.on')).toHaveCount(1)
  expect(await page.getByTestId('current-page').locator('.sheet-dots span').nth(1).getAttribute('class')).toBe('on')
  await page.getByTestId('current-page').getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('.leaf.turning.backward')).toHaveCount(1)
})

test('the back button returns to the earlier page, open at its choices', async ({ page }) => {
  await beginTale(page)
  await readAhead(page)
  await page.getByTestId('current-page').locator('.choice').first().click()
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeAttached({ timeout: 20_000 })
  await page.goBack()
  await expect(page).toHaveURL(/\/1$/)
  await expect(page.getByTestId('current-page')).toHaveAttribute('data-page', '1')
  // Already read, so it opens where the choices are, without tapping.
  await expect(page.getByTestId('current-page').getByRole('navigation', { name: 'Choices' })).toBeVisible()
})

test('a second reader sees the same page and that the path was explored', async ({ page, browser }) => {
  await beginTale(page)
  await readAhead(page)
  const firstText = await page.getByTestId('current-page').getByTestId('prose').textContent()
  const choice = page.getByTestId('current-page').locator('.choice').first()
  const target = (await choice.getAttribute('data-target'))!
  await choice.click()
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeAttached({ timeout: 20_000 })

  const other = await browser.newContext()
  const reader = await other.newPage()
  await reader.goto(page.url().replace(/\/\d+$/, '/1'))
  await readAhead(reader)
  expect(await reader.getByTestId('current-page').getByTestId('prose').textContent()).toBe(firstText)
  const same = reader.getByTestId('current-page').locator(`.choice[data-target="${target}"]`)
  await expect(same).not.toContainText('no one has gone this way')
  await other.close()
})

test('reading on reaches an ending', async ({ page }) => {
  test.setTimeout(120_000)
  await beginTale(page)
  for (let i = 0; i < 12; i++) {
    const ends = await readToEnd(page)
    const current = page.getByTestId('current-page')
    if (ends === 'finis') {
      await expect(current.getByText('Begin the tale again')).toBeVisible()
      return
    }
    const number = await current.getAttribute('data-page')
    await current.locator('.choice').first().click()
    await expect(page.getByTestId('current-page')).not.toHaveAttribute('data-page', number!)
  }
  throw new Error('No ending within 12 pages')
})

test('an unknown story shows the torn page', async ({ page }) => {
  await page.goto('/s/doesnotexist/1')
  await expect(page.getByText('torn from the book')).toBeVisible()
})

test('narration: once active, the next page is read aloud within moments; the ribbon pauses and resumes', async ({ page }) => {
  await beginTale(page)
  await expect(page.getByRole('button', { name: /the narrator/ })).toHaveCount(0)
  // Read page 1 first: with narration on, tapping the text would have it read aloud.
  await readAhead(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radiogroup', { name: 'Narration' }).getByRole('radio', { name: 'active', exact: true }).click()
  await page.getByText('Back to the story').click()
  await page.getByTestId('current-page').locator('.choice').first().click()
  const current = page.getByTestId('current-page')
  await expect(current.getByTestId('prose')).toBeAttached({ timeout: 20_000 })
  // Streamed: speaking long before a whole page could have been recorded.
  const pause = page.getByRole('button', { name: 'Pause the narrator' })
  await expect(pause).toHaveAttribute('data-speaking', 'true', { timeout: 5_000 })
  await expect(current.locator('.prose.hold')).toHaveCount(0)
  // force: the ribbon sways while the narrator speaks, and Playwright would wait for it to stop moving.
  await pause.click({ force: true })
  const play = page.getByRole('button', { name: 'Play the narrator' })
  await expect(play).not.toHaveAttribute('data-speaking')
  // Paused mid-page: the rest of the sheet shows at once.
  await expect(current.getByTestId('prose')).toHaveClass(/revealed/)
  await play.click({ force: true })
  await expect(page.getByRole('button', { name: 'Pause the narrator' })).toHaveAttribute('data-speaking', 'true')
})

const themes = [
  { name: 'Future', id: 'future', begin: 'Launch', folio: 'LOG 001', choiceLabel: /jump to LOG \d{3}/ },
  { name: 'Noir', id: 'noir', begin: 'Open the Case', folio: 'No. 1', choiceLabel: /see file No\. \d+/ },
  { name: 'Pirate', id: 'pirate', begin: 'Set Sail', folio: '1', choiceLabel: /turn to \d+/ },
  { name: 'Ancient Myth', id: 'ancient', begin: 'Begin', folio: 'I', choiceLabel: /go to [IVXLCDM]+/ },
  { name: 'Dreamscape', id: 'dream', begin: 'Dream', folio: '1', choiceLabel: /drift to \d+/ },
]

for (const t of themes) {
  test(`${t.name}: the title pages restyle, and the book opens in that theme`, async ({ page }) => {
    await openBook(page, t.name)
    await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', t.id)
    await page.getByRole('button', { name: t.begin, exact: true }).click()
    await page.waitForURL(/\/s\/[a-z0-9]+$/)
    await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', t.id)
    await openFirstPage(page)
    await expect(page.getByLabel('Page 1')).toHaveText(t.folio)
    await expect(page.getByTestId('current-page').locator('.sketch img')).toBeAttached()
    await readAhead(page)
    await expect(page.getByTestId('current-page').locator('.choice').first()).toContainText(t.choiceLabel)
    await expectNoScrolling(page)
    // Clicking a choice must never scroll the book itself sideways.
    await page.getByTestId('current-page').locator('.choice').first().focus()
    await expect(page.locator('.book')).toHaveJSProperty('scrollLeft', 0)
  })
}

test('a sketch shows when opening an already-written page directly', async ({ page, browser }) => {
  await beginTale(page)
  await readAhead(page)
  const url = page.url()
  const fresh = await (await browser.newContext()).newPage()
  await fresh.goto(url)
  await fresh.getByTestId('page-text').click({ position: { x: 8, y: 8 } })
  await expect(fresh.locator('.sketch img')).toBeAttached()
  await expect(fresh.locator('.sketch img')).not.toHaveAttribute('style', /hidden/)
})

test('a story opens on its cover, whose map shows the paths you have read', async ({ page }) => {
  await beginTale(page)
  await readAhead(page)
  await page.getByTestId('current-page').locator('.choice').first().click()
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeAttached({ timeout: 20_000 })
  // Back to page 1, then back again to the cover.
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/s\/[a-z0-9]+$/)
  const cover = page.locator('[data-leaf=cover]')
  await expect(cover.locator('.tree-node.yours')).toHaveCount(1)
  await expect(cover.locator('.tree-node')).not.toHaveCount(1)
  await expect(cover.getByRole('img')).toHaveAttribute('aria-label', /1 read by you/)
  await expectNoScrolling(page)
  // A page you have read can be opened from the map.
  await cover.locator('.tree-node.yours').click()
  await expect(page).toHaveURL(/\/1$/)
})

test('the menu ribbon opens the settings, which change the book', async ({ page }) => {
  await beginTale(page)
  const dotsBefore = await page.getByTestId('current-page').locator('.sheet-dots span').count()
  await page.getByRole('button', { name: 'Settings' }).click()
  const settings = page.locator('[data-leaf=settings]')
  await expect(settings.getByRole('radiogroup', { name: 'Sound effects' })).toBeVisible()
  await expectNoScrolling(page)
  await settings.getByRole('radio', { name: 'larger' }).click()
  await settings.getByRole('radio', { name: 'all at once' }).click()
  await expect(page.locator('html')).toHaveAttribute('style', /font-size: 115%/)
  await settings.getByText('Back to the story').click()
  const current = page.getByTestId('current-page')
  // All at once: the page is already revealed; larger text runs over at least as many sheets.
  await expect(current.getByTestId('prose')).toHaveClass(/revealed/)
  expect(await current.locator('.sheet-dots span').count()).toBeGreaterThanOrEqual(dotsBefore)
  await expectNoScrolling(page)
  // Remembered on the next visit.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('style', /font-size: 115%/)
})

test('back steps through the title pages, closes the settings, and goes from a page’s first screen to the page before', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Begin a new tale' }).click()
  await page.getByRole('button', { name: 'Open Historic Fantasy' }).click()
  await expect(page.getByRole('heading', { name: 'Begin a new tale' })).toBeVisible()
  // The phone's back button: the book picker, then the title page, still in the app.
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Choose your book' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Tales Unwritten' })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Choose your book' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Historic Fantasy' }).click()
  await page.getByRole('button', { name: 'Begin', exact: true }).click()
  await openFirstPage(page)

  // Settings close with back, leaving you where you were.
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('[data-leaf=settings]')).toHaveCount(1)
  await page.goBack()
  await expect(page.locator('[data-leaf=settings]')).toHaveCount(0)
  await expect(page.getByTestId('current-page')).toHaveAttribute('data-page', '1')

  // From the first screen of a page, the back arrow goes to the page before, open at its choices.
  await readAhead(page)
  await page.getByTestId('current-page').locator('.choice').first().click()
  const current = page.getByTestId('current-page')
  await expect(current.getByTestId('prose')).toBeAttached({ timeout: 20_000 })
  await expect(page.locator('.leaf')).toHaveCount(1)
  await current.locator('.sheet-prev').click()
  await expect(page).toHaveURL(/\/1$/)
  await expect(page.getByTestId('current-page').getByRole('navigation', { name: 'Choices' })).toBeVisible()
})

test('the library pages are neutral; a new tale picks up to two moods and who reads it', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', 'library')
  await page.getByRole('button', { name: 'Begin a new tale' }).click()
  await page.getByRole('radio', { name: /Pirate/ }).click()
  // Still the library while choosing; the tale's own sheet is in its book's style.
  await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', 'library')
  await page.getByRole('button', { name: 'Open Pirate' }).click()
  await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', 'pirate')

  const moods = page.getByRole('group', { name: /And the tale be/ })
  await moods.getByRole('button', { name: 'funny' }).click()
  await moods.getByRole('button', { name: 'spooky' }).click()
  // Two at most: the newest pick replaces the oldest.
  await expect(moods.locator('[aria-pressed=true]')).toHaveCount(2)
  await expect(moods.getByRole('button', { name: 'funny' })).toHaveAttribute('aria-pressed', 'true')
  await expect(moods.getByRole('button', { name: 'spooky' })).toHaveAttribute('aria-pressed', 'true')

  const created = page.waitForResponse((r) => r.url().endsWith('/api/stories') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Set Sail', exact: true }).click()
  const body = (await created).request().postDataJSON() as { tone: string }
  expect(body.tone).toBe('funny and spooky')

  // Who reads it aloud is chosen on the cover, trying each voice on the summary.
  await page.waitForURL(/\/s\/[a-z0-9]+$/)
  const cover = page.locator('[data-leaf=cover]')
  await expect(cover.getByRole('radio', { name: 'Old sea dog' })).toHaveAttribute('aria-checked', 'true')
  const preview = page.waitForResponse((r) => r.url().includes('/voice/preview?which=standard'))
  await cover.getByRole('button', { name: 'Hear Standard narrator' }).click()
  expect((await preview).status()).toBe(200)
  await cover.getByRole('radio', { name: 'Standard narrator' }).click()
  await expect(cover.getByRole('radio', { name: 'Standard narrator' })).toHaveAttribute('aria-checked', 'true')
  await cover.getByRole('button', { name: 'another idea' }).click()
  await expect(cover.getByRole('radio', { name: 'Old sea dog' })).toHaveCount(0)
  // The summary reads itself aloud when tapped, in the chosen voice: the new idea.
  const summary = page.waitForResponse((r) => r.url().includes('/voice/preview?which=suggested'))
  await cover.getByRole('button', { name: 'Read the summary aloud' }).click()
  expect((await summary).status()).toBe(200)
  // A swipe does not leave the cover while the voice is still open; only Begin does, fixing it.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(900)
  await expect(page.locator('[data-leaf=cover][data-testid=current-page]')).toHaveCount(1)
  const confirmed = page.waitForResponse((r) => r.url().endsWith('/voice') && r.request().method() === 'POST')
  await cover.locator('.cover-begin').click()
  expect((await confirmed).request().postDataJSON()).toEqual({ action: 'confirm' })
  await expectNoScrolling(page)
})

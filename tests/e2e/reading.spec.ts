import { expect, test, type Page } from '@playwright/test'

async function beginTale(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tales Unwritten' })).toBeVisible()
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.waitForURL(/\/s\/[a-z0-9]+\/1$/)
  await expect(page.getByTestId('prose')).toBeVisible({ timeout: 20_000 })
}

async function readAhead(page: Page) {
  await page.getByTestId('current-page').getByTestId('page-text').click()
  await expect(page.getByTestId('current-page').getByRole('navigation', { name: 'Choices' })).toBeVisible()
}

test('rolling the dice changes the tale’s settings', async ({ page }) => {
  await page.goto('/')
  const hero = page.getByLabel('You are')
  const before = await hero.inputValue()
  await page.getByRole('button', { name: 'Roll the dice' }).click()
  await expect(hero).not.toHaveValue(before)
})

test('the Begin seal is disabled when a field is blank', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('You are').fill('')
  await expect(page.getByRole('button', { name: 'Begin' })).toBeDisabled()
})

test('begin a tale, read page 1, and turn to the page a choice names', async ({ page }) => {
  await beginTale(page)
  await expect(page.getByLabel('Page 1')).toBeVisible()
  await readAhead(page)

  const choice = page.getByTestId('current-page').locator('.choice').first()
  const target = (await choice.getAttribute('data-target'))!
  await choice.click()

  await expect(page).toHaveURL(new RegExp(`/s/[a-z0-9]+/${target}$`))
  await expect(page.getByTestId('current-page')).toHaveAttribute('data-page', target)
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.leaf')).toHaveCount(1)
})

test('the back button returns to the earlier page, already read', async ({ page }) => {
  await beginTale(page)
  await readAhead(page)
  await page.getByTestId('current-page').locator('.choice').first().click()
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeVisible({ timeout: 20_000 })
  await page.goBack()
  await expect(page).toHaveURL(/\/1$/)
  await expect(page.getByTestId('current-page')).toHaveAttribute('data-page', '1')
  // Already read, so the choices are there without tapping.
  await expect(page.getByTestId('current-page').getByRole('navigation', { name: 'Choices' })).toBeVisible()
})

test('a second reader sees the same page and that the path was explored', async ({ page, browser }) => {
  await beginTale(page)
  await readAhead(page)
  const firstText = await page.getByTestId('current-page').getByTestId('prose').textContent()
  const choice = page.getByTestId('current-page').locator('.choice').first()
  const target = (await choice.getAttribute('data-target'))!
  await choice.click()
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeVisible({ timeout: 20_000 })

  const other = await browser.newContext()
  const reader = await other.newPage()
  await reader.goto(page.url().replace(/\/\d+$/, '/1'))
  await reader.getByTestId('page-text').click()
  expect(await reader.getByTestId('prose').textContent()).toBe(firstText)
  const same = reader.locator(`.choice[data-target="${target}"]`)
  await expect(same).not.toContainText('no one has gone this way')
  await other.close()
})

test('reading on reaches an ending', async ({ page }) => {
  test.setTimeout(120_000)
  await beginTale(page)
  for (let i = 0; i < 12; i++) {
    const current = page.getByTestId('current-page')
    await current.getByTestId('page-text').click()
    const finis = current.getByText('Finis')
    const choices = current.getByRole('navigation', { name: 'Choices' })
    await expect(finis.or(choices)).toBeVisible({ timeout: 20_000 })
    if (await finis.isVisible()) {
      await expect(current.getByText('Begin the tale again')).toBeVisible()
      return
    }
    const number = await current.getAttribute('data-page')
    await current.locator('.choice').first().click()
    await expect(page.getByTestId('current-page')).not.toHaveAttribute('data-page', number!)
    await expect(page.getByTestId('current-page').getByTestId('prose')).toBeVisible({ timeout: 20_000 })
  }
  throw new Error('No ending within 12 pages')
})

test('an unknown story shows the torn page', async ({ page }) => {
  await page.goto('/s/doesnotexist/1')
  await expect(page.getByText('torn from the book')).toBeVisible()
})

test('the book fits the screen with no sideways scroll', async ({ page }) => {
  await beginTale(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

const themes = [
  { name: 'Future', id: 'future', begin: 'Launch', folio: 'LOG 001', choiceLabel: /jump to LOG \d{3}/ },
  { name: 'Noir', id: 'noir', begin: 'Open the Case', folio: 'No. 1', choiceLabel: /see file No\. \d+/ },
  { name: 'Pirate', id: 'pirate', begin: 'Set Sail', folio: '1', choiceLabel: /turn to \d+/ },
  { name: 'Ancient Myth', id: 'ancient', begin: 'Begin', folio: 'I', choiceLabel: /go to [IVXLCDM]+/ },
  { name: 'Dreamscape', id: 'dream', begin: 'Dream', folio: '1', choiceLabel: /drift to \d+/ },
]

for (const t of themes) {
  test(`${t.name}: the title page restyles, and the book opens in that theme`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: new RegExp(t.name) }).click()
    await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', t.id)
    await page.getByRole('button', { name: t.begin }).click()
    await page.waitForURL(/\/s\/[a-z0-9]+\/1$/)
    await expect(page.locator('.desk').first()).toHaveAttribute('data-theme', t.id)
    await expect(page.getByLabel('Page 1')).toHaveText(t.folio)
    await readAhead(page)
    await expect(page.getByTestId('current-page').locator('.choice').first()).toContainText(t.choiceLabel)
    await expect(page.getByTestId('current-page').locator('.sketch img')).toBeVisible()
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
  await fresh.getByTestId('page-text').click()
  await expect(fresh.locator('.sketch img')).toBeVisible()
  await expect(fresh.locator('.sketch img')).not.toHaveAttribute('style', /hidden/)
})

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
  const target = await choice.locator('.page-no').innerText()
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
  const target = await choice.locator('.page-no').innerText()
  await choice.click()
  await expect(page.getByTestId('current-page').getByTestId('prose')).toBeVisible({ timeout: 20_000 })

  const other = await browser.newContext()
  const reader = await other.newPage()
  await reader.goto(page.url().replace(/\/\d+$/, '/1'))
  await reader.getByTestId('page-text').click()
  expect(await reader.getByTestId('prose').textContent()).toBe(firstText)
  const same = reader.locator('.choice', { has: reader.locator('.page-no', { hasText: new RegExp(`^${target}$`) }) })
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

import { expect, test } from '@playwright/test'

const openStory = async (page: import('@playwright/test').Page, id: string, dark = false) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story${dark ? '&globals=theme:dark' : ''}`)
  await expect(page.getByTestId('review-frame')).not.toBeEmpty({ timeout: 20000 })
}

// Full export inventory and every-story runtime coverage are enforced by catalogue.spec.ts.

for (const width of [320, 768, 769, 1440]) {
  test(`current calendar navigation and layout at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      await openStory(page, 'review-calendar--current', dark)
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^$/)
      await expect(page.getByRole('button', { name: '2026年10月', exact: true })).toBeVisible()
      const date = page.getByRole('button', { name: '2026年10月2日(イベント2件)', exact: true })
      if (width <= 768) {
        await expect(date).toHaveCount(0)
        await expect(page.getByText('15周年', { exact: true })).toBeVisible()
      } else {
        await expect(date).toBeVisible()
        await date.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByRole('heading', { name: '2026年10月2日', exact: true })).toBeVisible()
        await expect(page.getByRole('dialog')).toContainText('15周年')
        await page.getByRole('button', { name: '閉じる', exact: true }).click()
        await expect(page.getByRole('dialog')).not.toBeVisible()
      }
      await page.screenshot({ path: test.info().outputPath(`calendar-${dark ? 'dark' : 'light'}.png`) })
      await page.getByRole('button', { name: '1月に移動', exact: true }).click()
      await expect(page.getByRole('button', { name: '2026年1月', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '前の月', exact: true }).click()
      await expect(page.getByRole('button', { name: '2025年12月', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '次の月', exact: true }).click()
      await expect(page.getByRole('button', { name: '2026年1月', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '12月に移動', exact: true }).click()
      await page.getByRole('button', { name: '次の月', exact: true }).click()
      await expect(page.getByRole('button', { name: '2027年1月', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '2027年1月', exact: true }).click()
      await expect(page.getByRole('button', { name: '2026年10月', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
  })
  test(`current character cards at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      await openStory(page, 'review-characters--current-cards', dark)
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^$/)
      await expect(page.getByRole('heading', { name: 'たかつきたん', exact: true })).toBeVisible()
      await expect(page.getByText('関西・大阪府', { exact: true })).toHaveCount(2)
      await expect(page.getByRole('link', { name: 'たかつきたんの詳細を見る', exact: true })).toHaveAttribute(
        'href',
        '/characters/takatsuki'
      )
      const grid = page.getByTestId('review-frame').locator('.grid')
      expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(
        width < 640 ? 1 : width < 1024 ? 2 : width < 1280 ? 3 : 4
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: test.info().outputPath(`characters-${dark ? 'dark' : 'light'}.png`) })
    }
  })
}

test('filter count follows conditions and closes to show empty results', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openStory(page, 'review-events--proposed-filter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
  await expect(dialog).toBeVisible()
  const boxes = dialog.getByRole('checkbox')
  for (const box of await boxes.all()) {
    if ((await box.getAttribute('data-state')) === 'checked') await box.click()
  }
  await dialog.getByRole('button', { name: '適用' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('条件に一致するイベントはありません', { exact: true })).toBeVisible()
})

test('route preview enables calculation after selecting a second store', async ({ page }) => {
  await openStory(page, 'review-route--one-store')
  const button = page.getByRole('button', { name: '訪問順を計算（モック）' })
  await expect(button).toBeDisabled()
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'なんば店', exact: true }).click()
  await expect(button).toBeEnabled()
  await button.click()
  await expect(page.getByText('モックの確認が完了しました。経路生成・AI通信は行いません。')).toBeVisible()
})

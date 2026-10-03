import { expect, test } from '@playwright/test'

const openStory = async (page: import('@playwright/test').Page, id: string, dark = false) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story${dark ? '&globals=theme:dark' : ''}`)
  await expect(page.getByTestId('review-frame')).not.toBeEmpty()
}

// Full export inventory and every-story runtime coverage are enforced by catalogue.spec.ts.

for (const width of [320, 768, 1440]) {
  test(`proposed month labels are reachable at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      await openStory(page, 'review-calendar--proposed-month-labels', dark)
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^$/)
      await page.getByRole('button', { name: '1月', exact: true }).click()
      await expect(page.getByRole('button', { name: '2026年1月' })).toBeVisible()
      await page.getByRole('button', { name: '12月', exact: true }).click()
      await expect(page.getByRole('button', { name: '2026年12月' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
  })
}

test('filter count follows conditions and closes to show empty results', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openStory(page, 'review-events--proposed-filter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const boxes = dialog.getByRole('checkbox')
  for (const box of await boxes.all()) {
    if ((await box.getAttribute('data-state')) === 'checked') await box.click()
  }
  await dialog.getByRole('button', { name: '0件を表示' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('status')).toContainText('該当するイベントはありません')
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

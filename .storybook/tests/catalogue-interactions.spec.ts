import { expect, type Page, test } from '@playwright/test'

const open = async (page: Page, id: string, width = 375) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:16006' ? route.continue() : route.abort()
  )
  await page.goto(`/iframe.html?id=${id}&viewMode=story`)
  await expect(page.getByTestId('review-frame')).toBeVisible()
}
test('interaction: mobile month dots and desktop tabs update the actual selection', async ({ page }) => {
  for (const [id, width] of [
    ['calendar-month-dots', 375],
    ['calendar-month-tabs', 1024]
  ] as const) {
    await open(page, `components-calendar-calendar-controls--${id}`, width)
    const first = page.getByRole('button', { name: id === 'calendar-month-dots' ? '1月に移動' : '1月', exact: true })
    await first.click()
    if (id === 'calendar-month-dots') await expect(first).toHaveAttribute('aria-pressed', 'true')
    else await expect(first).toHaveClass(/bg-brand/)
    await expect(
      page.getByRole('button', { name: id === 'calendar-month-dots' ? '10月に移動' : '10月', exact: true })
    ).not.toHaveClass(/bg-brand/)
  }
})
test('interaction: favorite mutation invalidates the real query and a fresh story restores fixture state', async ({
  page
}) => {
  const id = 'components-characters-character-favorite-button--character-favorite-button'
  await open(page, id)
  await page.getByRole('button', { name: 'お気に入り解除', exact: true }).click()
  await expect(page.getByRole('button', { name: 'お気に入り登録', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__storybookFixture').calls.includes('removeFavoriteCharacter'))
    )
    .toBe(true)
  await open(page, id)
  await expect(page.getByRole('button', { name: 'お気に入り解除', exact: true })).toBeVisible()
})
test('interaction: real field array adds and removes a purchase condition', async ({ page }) => {
  await open(page, 'components-admin-form-conditions-section--conditions-section')
  const purchase = page.getByRole('button', { name: '購入金額', exact: true })
  await purchase.click()
  await expect(page.locator('input[type=number]')).toHaveValue('3000')
  await purchase.click()
  await expect(page.locator('input[type=number]')).toHaveCount(0)
})
test('interaction: date field clears through react-hook-form', async ({ page }) => {
  await open(page, 'components-admin-form-date-field--date-field')
  const date = page.locator('input[type=date]')
  await expect(date).not.toHaveValue('')
  await page.getByRole('button', { name: '開始日をクリア' }).click()
  await expect(date).toHaveValue('')
  await date.fill('2026-10-03')
  await expect(date).toHaveValue('2026-10-03')
})
test('interaction: Gantt month navigation changes actual dates and bars', async ({ page }) => {
  await open(page, 'components-events-event-gantt-chart--event-gantt-chart', 1280)
  await page.getByRole('button', { name: '26/11', exact: true }).click()
  await expect(page.getByRole('button', { name: '26/11', exact: true })).toHaveClass(/bg-brand/)
  await page.getByRole('button', { name: '26/10', exact: true }).click()
  await expect(page.getByTestId('production-component')).toContainText(
    'ビッカメ娘のお誕生日と店舗周年を記念した限定名刺プレゼント'
  )
})
test('interaction: calendar drawer closes through its real compound context', async ({ page }) => {
  await open(page, 'components-calendar-calendar-event-drawer-content--calendar-event-drawer-content')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('きょうとたん')
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(dialog).not.toBeVisible()
})
test('interaction: UI primitives filter commands and switch tabs', async ({ page }) => {
  await open(page, 'ui-primitives--command')
  await page.getByRole('combobox').fill('京都')
  await expect(page.getByRole('option', { name: '京都店' })).toBeVisible()
  await expect(page.getByRole('option', { name: /あべの/ })).not.toBeVisible()
  await open(page, 'ui-primitives--tabs')
  await page.getByRole('tab', { name: 'イベント', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'イベント', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('秋のお誕生日イベント')
})
test('interaction: PWA notification executes actual prompt rendering with no cache mutation', async ({ page }) => {
  await open(page, 'components-pwa-update-prompt--update-prompt')
  await page.getByRole('button', { name: '更新通知を表示' }).click()
  await expect(page.getByText('新しいバージョンが利用可能です', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => Reflect.get(window, '__storybookFixture').calls.includes('syntheticClearCaches'))
  ).toBe(false)
})
test('interaction: social authentication uses the Firebase adapter without leaving the story', async ({ page }) => {
  await open(page, 'components-auth-login-button--login-button')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.getByRole('button', { name: 'Google', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__storybookFixture').authenticated)).toBe(true)
  expect(new URL(page.url()).pathname).toBe('/iframe.html')
})
test('interaction: production route computes two selected stores through only the directions boundary', async ({
  page
}) => {
  await open(page, 'pages-production--route', 1280)
  const add = page.getByRole('combobox').first()
  await add.click()
  await page.getByRole('option', { name: 'あべのたん', exact: true }).click()
  await add.click()
  await page.getByRole('option', { name: 'たかつきたん（高槻阪急スクエア店）', exact: true }).click()
  const calculate = page.getByRole('button', { name: /ルート.*計算|訪問.*計算|最短ルート/ })
  await calculate.click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__storybookFixture').calls.includes('directions')))
    .toBe(true)
  await expect(page.getByTestId('production-page')).toContainText('25分')
})
test('interaction: transient vote effect creates and then removes actual heart particles', async ({ page }) => {
  await open(page, 'components-characters-vote-burst--vote-burst')
  await page.getByRole('button', { name: 'アニメーションを再生' }).click()
  await expect(page.getByTestId('production-component').locator('svg')).toHaveCount(5)
  await expect(page.getByTestId('production-component').locator('svg')).toHaveCount(0)
})

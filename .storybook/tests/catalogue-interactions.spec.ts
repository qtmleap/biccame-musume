import { expect, type Page, test } from '@playwright/test'

const open = async (page: Page, id: string, width = 375) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:16006' ? route.continue() : route.abort()
  )
  await page.goto(`/iframe.html?id=${id}&viewMode=story`)
  await expect(page.getByTestId('review-frame')).toBeVisible()
}
test('interaction: Bot page load is passive and connection click invokes exactly one POST boundary', async ({
  page
}) => {
  await open(page, 'pages-admin-bot-and-webhooks--bot-settings', 1280)
  await expect(page.getByText('未確認（接続確認を押してください）', { exact: true })).toBeVisible()
  await expect(page.getByText('常時有効', { exact: true })).toBeVisible()
  const connectionCalls = () =>
    page.evaluate(
      () =>
        Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'checkAdminBotConnection')
          .length
    )
  expect(await connectionCalls()).toBe(0)
  await page.getByRole('button', { name: '接続確認', exact: true }).click()
  await expect(page.getByText('認証・チャンネルアクセス成功', { exact: true })).toBeVisible()
  expect(await connectionCalls()).toBe(1)
  expect(
    await page.evaluate(() => Reflect.get(window, '__storybookFixture').calls.includes('testAdminBotNotification'))
  ).toBe(false)
})

test('interaction: full reload retains last Discord check without an automatic connection probe', async ({ page }) => {
  await open(page, 'pages-admin-bot-and-webhooks--bot-settings', 1280)
  await page.getByRole('button', { name: '接続確認', exact: true }).click()
  await expect(page.getByText('認証・チャンネルアクセス成功', { exact: true })).toBeVisible()
  const previousCheck = page.getByText('前回の確認', { exact: true }).locator('xpath=following-sibling::dd')
  const checkedAt = await previousCheck.innerText()
  expect(checkedAt).not.toBe('未確認')
  await page.reload()
  await expect(page.getByText('認証・チャンネルアクセス成功', { exact: true })).toBeVisible()
  await expect(previousCheck).toHaveText(checkedAt)
  await expect(page.getByText('synthetic-bot (10001)', { exact: true })).toBeVisible()
  await expect(page.getByText('synthetic-notifications (10002)', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'checkAdminBotConnection')
          .length
    )
  ).toBe(0)
  expect(
    await page.evaluate(() => Reflect.get(window, '__storybookFixture').calls.includes('testAdminBotNotification'))
  ).toBe(false)
})

test('interaction: mobile month dots and desktop tabs update the actual selection', async ({ page }) => {
  for (const [id, width] of [
    ['calendar-month-dots', 375],
    ['calendar-month-tabs', 1024]
  ] as const) {
    await open(page, `components-calendar-calendar-controls--${id}`, width)
    const first = page.getByRole('button', { name: '1月に移動', exact: true })
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '10月に移動', exact: true })).not.toHaveClass(/bg-brand/)
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
  await page.getByRole('option', { name: 'たかつきたん', exact: true }).click()
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
test('interaction: controlled category and activity fixtures retain checkbox changes', async ({ page }) => {
  for (const [id, label] of [
    ['event-category-filter', 'アクキー'],
    ['event-user-activity-filter', '興味あり']
  ] as const) {
    await open(page, `components-events-${id}--${id}`)
    const checkbox = page.getByRole('checkbox', { name: label, exact: true })
    const before = await checkbox.isChecked()
    await checkbox.click()
    if (before) await expect(checkbox).not.toBeChecked()
    else await expect(checkbox).toBeChecked()
    await checkbox.click()
    if (before) await expect(checkbox).toBeChecked()
    else await expect(checkbox).not.toBeChecked()
  }
})
test('interaction: isolated Gantt header Today restores the real month layout', async ({ page }) => {
  await open(page, 'components-events-gantt-gantt-header--gantt-header', 1280)
  await page.getByRole('button', { name: '26/11', exact: true }).click()
  await expect(page.getByRole('button', { name: '26/11', exact: true })).toHaveClass(/bg-brand/)
  await page.getByRole('button', { name: '今日の位置へ', exact: true }).click()
  await expect(page.getByRole('button', { name: '26/10', exact: true })).toHaveClass(/bg-brand/)
})
test('interaction: production map markers update the synthetic camera without remount loops', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page, 'pages-production--location', 1280)
  const map = page.getByTestId('maps-adapter')
  const camera = map.locator('p').first()
  const before = await camera.textContent()
  await map.getByRole('button').first().click()
  await expect(camera).not.toHaveText(before ?? '')
  await expect(map).toBeVisible()
  expect(errors).toEqual([])
})

test('interaction: Bot model save changes model and does not immediately reread stale KV', async ({ page }) => {
  await open(page, 'pages-admin-bot-and-webhooks--bot-settings', 1280)
  const model = page.getByRole('combobox', { name: '判定モデル', exact: true })
  const save = page.getByRole('button', { name: '保存', exact: true })
  await expect(model).toContainText('clef')
  await expect(save).toBeDisabled()
  const modelAlignment = await model.evaluate((trigger) => {
    const label = trigger.closest('dd')?.previousElementSibling
    if (!label) throw new Error('Model label unavailable')
    const labelRect = label.getBoundingClientRect()
    const selectRect = trigger.getBoundingClientRect()
    return Math.abs(labelRect.top + labelRect.height / 2 - selectRect.top - selectRect.height / 2)
  })
  expect(modelAlignment).toBeLessThan(1)
  await expect(page.locator('footer').getByRole('button', { name: '保存', exact: true })).toBeVisible()
  await expect(model.locator('xpath=ancestor::dd').getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
  await model.click()
  await page.getByRole('option', { name: 'clef-flash', exact: true }).click()
  const reads = await page.evaluate(
    () => Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'getAdminBotStatus').length
  )
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'saveAdminBotConfiguration')
          .length
    )
  ).toBe(0)
  await expect(save).toBeEnabled()
  await save.click()
  const successToast = page.locator('[data-sonner-toast]').filter({ hasText: '保存しました' })
  await expect(successToast).toHaveCount(1)
  await expect(successToast).toBeVisible()
  await expect(save).toBeDisabled()
  await expect(page.getByText('保存しました。', { exact: true })).toHaveCount(0)
  await expect(model).toContainText('clef-flash')
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'saveAdminBotConfiguration')
          .length
    )
  ).toBe(1)
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'getAdminBotStatus').length
    )
  ).toBe(reads)
  await model.click()
  await page.getByRole('option', { name: 'clef', exact: true }).click()
  await page.evaluate(() => {
    Reflect.get(window, '__storybookFixture').state = 'error'
  })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: '保存できませんでした' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, '__storybookFixture').calls.filter((call: string) => call === 'saveAdminBotConfiguration')
          .length
    )
  ).toBe(2)
})

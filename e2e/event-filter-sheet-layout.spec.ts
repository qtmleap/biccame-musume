import { expect, type Page, test } from '@playwright/test'
import dayjs from 'dayjs'

const events = ['limited_card', 'regular_card', 'ackey', 'other'].flatMap((category, c) =>
  Array.from({ length: 4 }, (_, i) => ({
    uuid: `550e8400-e29b-41d4-a716-${String(c * 4 + i).padStart(12, '0')}`,
    category,
    title: `${category} 秋の記念プレゼント ${i}`,
    stores: ['sapporo'],
    startDate: '2026-10-01',
    endDate: '2026-11-06',
    status: 'ongoing',
    daysUntil: 0,
    isVerified: true,
    isPreliminary: false,
    conditions: [],
    interestedCount: 0,
    completedCount: 0,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01'
  }))
)
const install = async (page: Page) => {
  await page.clock.setFixedTime(dayjs('2026-10-19T16:00:00Z').toDate())
  await page.addInitScript(() => {
    Math.random = () => 0.5
    localStorage.setItem('event-view-mode', JSON.stringify('grid'))
  })
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15328') return route.abort()
    if (url.pathname === '/api/events') return route.fulfill({ json: events })
    if (url.pathname === '/characters.json')
      return route.fulfill({
        json: [
          {
            id: 'sapporo',
            prefecture: '北海道',
            character: { name: '札幌娘', description: 'fixture', images: ['fixture.png'], is_biccame_musume: true },
            store: { name: '札幌店', access: [] }
          }
        ]
      })
    if (url.pathname === '/api/event-groups') return route.fulfill({ json: [] })
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/')) return route.abort()
    return route.continue()
  })
}

const expectThemeAndLabels = async (page: Page, theme: string) => {
  const evidence = await page.evaluate(async () => {
    for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code']) {
      for (const weight of [400, 500, 700]) {
        await document.fonts.load(`${weight} 14px "${family}"`, 'イベント一覧123')
        if (!document.fonts.check(`${weight} 14px "${family}"`, 'イベント一覧123'))
          throw new Error('Font is not loaded')
      }
    }
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) throw new Error('Canvas is not available')
    const rgb = (color: string) => {
      canvas.fillStyle = color
      canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (color: number[]) =>
      color
        .map((value) => value / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) throw new Error('Filter dialog is not visible')
    const background = luminance(rgb(getComputedStyle(dialog).backgroundColor))
    return {
      body: rgb(getComputedStyle(document.body).backgroundColor),
      font: getComputedStyle(document.body).fontFamily,
      labels: [...dialog.querySelectorAll('label, [data-slot="filter-header"]')].map((label) => {
        const foreground = luminance(rgb(getComputedStyle(label).color))
        return {
          text: label.textContent,
          contrast: (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
        }
      })
    }
  })
  expect(evidence.body).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
  expect(evidence.font).toContain('Zen Maru Gothic')
  for (const label of evidence.labels)
    expect(label.contrast, label.text === null ? 'Filter label' : label.text).toBeGreaterThanOrEqual(4.5)
}

test.beforeEach(async ({ page }) => install(page))
for (const theme of ['light', 'dark']) {
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
    test(`dialog layout ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 600 })
      await page.goto(`/events/?theme=${theme}&category=ackey,other&region=hokkaido&status=ongoing`)
      const trigger = page.getByRole('button', { name: 'イベントを絞り込む' })
      await expect(trigger).toHaveText('条件を変更')
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      await page.evaluate(() => document.fonts.ready)
      const initial = page.url()
      const viewModes = page.getByRole('radiogroup', { name: 'イベントの表示方法', exact: true })
      const triggerBox = await trigger.boundingBox()
      const viewModesBox = await viewModes.boundingBox()
      if (!triggerBox || !viewModesBox) throw new Error('Event header controls are not visible')
      expect(triggerBox.height).toBe(36)
      expect(viewModesBox.height).toBe(triggerBox.height)
      expect(viewModesBox.y).toBe(triggerBox.y)
      const segments = await viewModes.getByRole('radio').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            x: rect.x,
            right: rect.right,
            y: rect.y,
            height: rect.height,
            leftRadius: style.borderTopLeftRadius,
            rightRadius: style.borderTopRightRadius
          }
        })
      )
      expect(segments).toHaveLength(2)
      expect(segments[0].x).toBe(viewModesBox.x)
      expect(segments[0].right).toBe(segments[1].x)
      expect(segments[1].right).toBe(viewModesBox.x + viewModesBox.width)
      for (const segment of segments) {
        expect(segment.height).toBe(36)
        expect(segment.y).toBe(viewModesBox.y)
      }
      expect(segments[0].rightRadius).toBe('0px')
      expect(segments[1].leftRadius).toBe('0px')
      const radius = await viewModes.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)
      expect(segments[0].leftRadius).toBe(radius)
      expect(segments[1].rightRadius).toBe(radius)
      const outline = await trigger.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          color: style.outlineColor,
          width: style.outlineWidth,
          style: style.outlineStyle,
          offset: style.outlineOffset
        }
      })
      // DPR 1 の Chromium は指定 1.5px を computed style では 1px に量子化する。
      expect(await viewModes.evaluate((element) => element.style.outline)).toBe('1.5px solid var(--card-border)')
      expect(Number.parseFloat(outline.width)).toBeGreaterThan(0)
      expect(outline.style).toBe('solid')
      expect(await viewModes.evaluate((element) => element.style.outlineOffset)).toBe('-1.5px')
      expect(Number.parseFloat(outline.offset)).toBeLessThan(0)
      expect(
        await viewModes.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            color: style.outlineColor,
            width: style.outlineWidth,
            style: style.outlineStyle,
            offset: style.outlineOffset
          }
        })
      ).toEqual(outline)
      const weights = await viewModes
        .getByRole('radio')
        .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).fontWeight))
      expect(weights[0]).toBe(weights[1])
      await expect(page.getByRole('status')).toHaveCount(0)
      await expect(page.getByText('全 8 件中 1–8 件を表示', { exact: true })).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('checkbox')).toHaveCount(0)
      await expect(page.getByRole('radiogroup', { name: '地域で絞り込み', exact: true })).toHaveCount(0)
      await expect(page.getByRole('combobox')).toHaveCount(1)
      await expect(page.getByTestId('event-store-toolbar').getByRole('combobox')).toBeVisible()
      expect(
        await trigger.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.outlineColor = 'var(--card-border)'
          document.body.appendChild(probe)
          const matches = getComputedStyle(element).outlineColor === getComputedStyle(probe).outlineColor
          probe.remove()
          return matches
        })
      ).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`header-${theme}-${width}.png`) })
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('combobox')).toHaveCount(0)
      await expect(page.locator('[role="combobox"]')).toHaveCount(1)
      await expectThemeAndLabels(page, theme)
      expect(page.url()).toBe(initial)
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/)
      await expect(dialog).toHaveCSS('display', 'flex')
      await expect(dialog).toHaveCSS('position', 'fixed')
      await expect
        .poll(async () => {
          const box = await dialog.boundingBox()
          return (
            box !== null && box.x >= 15 && box.y >= 15 && box.x + box.width <= width - 15 && box.y + box.height <= 585
          )
        })
        .toBe(true)
      const conditions = dialog.getByTestId('event-filter-conditions')
      const footer = dialog.getByTestId('event-filter-actions')
      const action = dialog.getByRole('button', { name: '適用', exact: true })
      await expect(page.locator('[role="status"]')).toHaveCount(0)
      await expect(footer.getByRole('button')).toHaveCount(2)
      await expect(footer.locator('p')).toHaveCount(0)
      await expect(action).toBeVisible()
      const applyBox = await action.boundingBox()
      const clearBox = await footer.getByRole('button', { name: 'クリア', exact: true }).boundingBox()
      if (!applyBox || !clearBox) throw new Error('Filter footer actions are not visible')
      expect(applyBox.height).toBe(36)
      expect(clearBox.height).toBe(applyBox.height)
      expect(clearBox.y).toBe(applyBox.y)
      expect(clearBox.width).toBe(applyBox.width)
      expect(clearBox.x).toBeGreaterThan(applyBox.x + applyBox.width)
      const before = await footer.boundingBox()
      await conditions.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await expect(
        dialog.getByRole('checkbox', { name: '開始から1か月以上経ったイベントを非表示', exact: true })
      ).toBeInViewport()
      expect(await footer.boundingBox()).toEqual(before)
      await expect(action).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: test.info().outputPath(`filter-${theme}-${width}.png`) })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(trigger).toBeFocused()
      expect(page.url()).toBe(initial)
    })
  }
}

test('filter edits reset display page and apply without changing the entry URL', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(
    '/events/?page=2&hideInterested=true&hideCompleted=true&region=hokkaido&status=ongoing&store=sapporo&tracking=fixture'
  )
  await expect(page.locator('a[href^="/events/"]')).toHaveCount(4)
  const incoming = page.url()
  await page.getByRole('button', { name: 'イベントを絞り込む' }).click()
  const dialog = page.getByRole('dialog')
  await expect(page.getByText('全 16 件中 13–16 件を表示', { exact: true })).toBeVisible()
  await dialog.getByRole('checkbox', { name: 'アクキー', exact: true }).click()
  await expect(page.getByText('全 12 件中 1–12 件を表示', { exact: true })).toBeVisible()
  const params = new URL(page.url()).searchParams
  expect(page.url()).toBe(incoming)
  expect(params.get('page')).toBe('2')
  expect(params.get('category')).toBeNull()
  for (const [key, value] of [
    ['hideInterested', 'true'],
    ['hideCompleted', 'true'],
    ['region', 'hokkaido'],
    ['status', 'ongoing'],
    ['store', 'sapporo'],
    ['tracking', 'fixture']
  ])
    expect(params.get(key)).toBe(value)
  const applied = page.url()
  await dialog.getByRole('button', { name: '適用', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  expect(page.url()).toBe(applied)
  await expect(page.getByRole('button', { name: 'イベントを絞り込む' })).toBeFocused()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByText('全 12 件中 1–12 件を表示', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'イベントを絞り込む' }).click()
  await expect(dialog.getByRole('checkbox', { name: 'アクキー', exact: true })).not.toBeChecked()
  await expect(page.locator('[role="status"]')).toHaveCount(0)
})
for (const width of [320, 375, 430]) {
  test(`last condition scroll, zero change and reset ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 })
    await page.goto('/events/?category=&region=all&status=ongoing&hideCompleted=true')
    const trigger = page.getByRole('button', { name: 'イベントを絞り込む' })
    await trigger.click()
    const incoming = page.url()
    const dialog = page.getByRole('dialog')
    const action = dialog.getByRole('button', { name: '適用', exact: true })
    await expect(page.getByText('条件に一致するイベントはありません', { exact: true })).toBeVisible()
    await expect(page.locator('[role="status"]')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'クリア', exact: true }).locator('svg')).toHaveCount(0)
    await expect(action).toBeEnabled()
    await action.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
    const store = page.getByTestId('event-store-toolbar').getByRole('combobox')
    await store.focus()
    await expect(store).toBeInViewport()
    await store.press('Space')
    await expect(page.getByRole('option', { name: '札幌店', exact: true })).toBeVisible()
    await page.keyboard.press('End')
    await expect(page.getByRole('option', { name: '札幌店', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(page.url()).toBe(incoming)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('event-list-filters')))
      .toContain('"store":"sapporo"')
    await trigger.click()
    await expect(dialog.getByRole('combobox')).toHaveCount(0)
    const lastCondition = dialog.getByRole('checkbox', { name: '開始から1か月以上経ったイベントを非表示', exact: true })
    await lastCondition.focus()
    await expect(lastCondition).toBeInViewport()
    const lastConditionBox = await lastCondition.boundingBox()
    const actionBox = await action.boundingBox()
    if (!lastConditionBox || !actionBox) throw new Error('Filter controls are not visible')
    expect(lastConditionBox.y + lastConditionBox.height).toBeLessThanOrEqual(actionBox.y)
    expect(
      await lastCondition.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      })
    ).toBe(true)
    await dialog.getByRole('checkbox', { name: 'アクキー', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByText('全 4 件中 1–4 件を表示', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'クリア' }).click()
    await expect(page.getByText('全 16 件中 1–12 件を表示', { exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('store')).toBeNull()
    expect(page.url()).toBe(incoming)
    expect(new URL(page.url()).searchParams.get('hideCompleted')).toBe('true')
    await dialog.getByRole('button', { name: '適用', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByText('全 16 件中 1–12 件を表示', { exact: true })).toBeVisible()
    await trigger.click()
    await expect(dialog.getByRole('checkbox', { name: 'アクキー', exact: true })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'その他', exact: true })).toBeChecked()
    await expect(dialog.getByRole('button', { name: 'クリア', exact: true })).toBeDisabled()
    await expect(page.locator('[role="status"]')).toHaveCount(0)
  })
}

test('resize preserves open dialog and selected conditions without duplicate controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/events/?region=hokkaido&status=ongoing')
  const trigger = page.getByRole('button', { name: 'イベントを絞り込む' })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: 'アクキー', exact: true }).click()
  const applied = page.url()
  await page.setViewportSize({ width: 1440, height: 800 })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'アクキー', exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('checkbox', { name: 'アクキー', exact: true })).not.toBeChecked()
  expect(page.url()).toBe(applied)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('radiogroup', { name: '地域で絞り込み', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(1)
  await expect(page.getByTestId('event-store-toolbar').getByRole('combobox')).toBeVisible()
  expect(page.url()).toBe(applied)
  await trigger.click()
  await expect(dialog.getByRole('checkbox', { name: 'アクキー', exact: true })).not.toBeChecked()
})

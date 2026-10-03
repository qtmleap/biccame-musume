import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'

const phase = process.env.B08_PHASE ?? 'after'
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b08', phase)
const widths = [320, 375, 430, 768, 1024, 1280, 1440]
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
async function install(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-19T16:00:00Z'))
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
async function fonts(page: Page) {
  return page.evaluate(async () => {
    const faces = []
    for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'])
      for (const weight of [400, 500, 700]) {
        await document.fonts.load(`${weight} 14px "${family}"`, 'イベント一覧123')
        faces.push({ family, weight, loaded: document.fonts.check(`${weight} 14px "${family}"`, 'イベント一覧123') })
      }
    await document.fonts.ready
    return faces
  })
}
async function measure(page: Page, theme: string) {
  const loaded = await fonts(page)
  for (const face of loaded) expect(face.loaded).toBe(true)
  const evidence = await page.evaluate(() => {
    const rgb = (color: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const lum = (a: number[]) =>
      a
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const root = document.querySelector('[role="dialog"]') ?? document.getElementById('root')!
    const labels = [...root.querySelectorAll('label, [data-slot="filter-header"]')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const ctx = document.createElement('canvas').getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, 1, 1)
        const ancestors = []
        for (let p: Element | null = e; p; p = p.parentElement) ancestors.push(p)
        for (const p of ancestors.reverse()) {
          ctx.fillStyle = getComputedStyle(p).backgroundColor
          ctx.fillRect(0, 0, 1, 1)
        }
        const bg = lum([...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)),
          fg = lum(rgb(getComputedStyle(e).color))
        return {
          text: e.textContent,
          color: getComputedStyle(e).color,
          contrast: (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05)
        }
      })
    const opacity = [...root.querySelectorAll('*')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => Number(getComputedStyle(e).opacity))
    return {
      dark: document.documentElement.classList.contains('dark'),
      background: rgb(getComputedStyle(document.body).backgroundColor),
      font: getComputedStyle(document.body).fontFamily,
      opacity: { min: Math.min(...opacity), belowOne: opacity.filter((v) => v < 1).length },
      labels,
      ids: [...document.querySelectorAll('a[href^="/events/"]')].map((e) => e.getAttribute('href')),
      sheet: document.querySelector('[role="dialog"]')
        ? {
            display: getComputedStyle(root).display,
            position: getComputedStyle(root).position,
            bottom: root.getBoundingClientRect().bottom
          }
        : null,
      overflow: document.documentElement.scrollWidth,
      viewport: innerWidth
    }
  })
  expect(evidence.dark).toBe(theme === 'dark')
  expect(evidence.background).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
  expect(evidence.font).toContain('Zen Maru Gothic')
  if (evidence.sheet) {
    expect(evidence.sheet.display).toBe('flex')
    expect(evidence.sheet.position).toBe('fixed')
    expect(evidence.sheet.bottom).toBe(800)
  }
  return { ...evidence, loaded }
}
test.beforeEach(async ({ page }) => install(page))
for (const theme of ['light', 'dark'])
  for (const width of widths)
    test(`visual ${theme} ${width}`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/events/?theme=${theme}&category=ackey,other&region=hokkaido&status=ongoing`)
      await expect(page.getByRole('heading', { name: 'イベント一覧', exact: true })).toBeVisible()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      if (width < 768) await page.getByRole('button', { name: 'イベントを絞り込む' }).click()
      const pre = await measure(page, theme)
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      const immediatePostOpacity = await page.evaluate(() =>
        [...(document.querySelector('[role="dialog"]') ?? document.getElementById('root')!).querySelectorAll('*')]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => Number(getComputedStyle(e).opacity))
      )
      const post = await measure(page, theme)
      expect(post.opacity).toEqual(pre.opacity)
      expect(post.ids).toEqual(pre.ids)
      const sha = (s: string) => createHash('sha256').update(s).digest('hex')
      await writeFile(
        resolve(scratch, `${theme}-${width}.json`),
        JSON.stringify(
          {
            phase,
            fixtureHash: sha(JSON.stringify(events)),
            specHash: sha(await readFile('e2e/event-filter-sheet-layout.spec.ts', 'utf8')),
            sourceHash: sha(await readFile('workers/app/src/app/routes/events/index.tsx', 'utf8')),
            pre,
            immediatePostOpacity,
            post
          },
          null,
          2
        )
      )
      if (phase === 'before') return
      const before = JSON.parse(await readFile(resolve(scratch, '../../b08/before', `${theme}-${width}.json`), 'utf8'))
      expect(pre.ids).toEqual(before.pre.ids)
      expect(pre.overflow).toBeLessThanOrEqual(width)
      for (const label of pre.labels) expect(label.contrast, label.text ?? '').toBeGreaterThanOrEqual(4.5)
      await expect(page.getByRole('status').filter({ hasText: '8件' }).first()).toBeVisible()
      if (width < 768) await expect(page.getByRole('button', { name: '8件を表示', exact: true })).toBeVisible()
    })
test('result action closes with keyboard without changing immediately applied URL', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(
    '/events/?page=2&hideInterested=true&hideCompleted=true&region=hokkaido&status=ongoing&store=sapporo&tracking=fixture'
  )
  await expect(page.locator('a[href^="/events/"]')).toHaveCount(4)
  await page.getByRole('button', { name: 'イベントを絞り込む' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: '16件を表示', exact: true })).toBeVisible()
  await dialog.getByRole('checkbox', { name: 'アクキー', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '12件を表示', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('page')).toBe('1')
  expect(new URL(page.url()).searchParams.get('category')).not.toContain('ackey')
  expect(new URL(page.url()).searchParams.get('hideInterested')).toBe('true')
  expect(new URL(page.url()).searchParams.get('hideCompleted')).toBe('true')
  expect(new URL(page.url()).searchParams.get('region')).toBe('hokkaido')
  expect(new URL(page.url()).searchParams.get('status')).toBe('ongoing')
  expect(new URL(page.url()).searchParams.get('store')).toBe('sapporo')
  expect(new URL(page.url()).searchParams.get('tracking')).toBe('fixture')
  const applied = page.url()
  await dialog.getByRole('button', { name: '12件を表示', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  expect(page.url()).toBe(applied)
  await expect(page.getByRole('button', { name: 'イベントを絞り込む' })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: '12件' })).toContainText('興味ありを非表示')
})
for (const width of [320, 375, 430])
  test(`last condition scroll, zero change and reset ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 })
    await page.goto('/events/?category=&region=all&status=ongoing&hideCompleted=true')
    await page.getByRole('button', { name: 'イベントを絞り込む' }).click()
    const dialog = page.getByRole('dialog'),
      action = dialog.getByRole('button', { name: '0件を表示', exact: true })
    await expect(action).toBeEnabled()
    if (width === 320) {
      await action.focus()
      await page.keyboard.press('Enter')
      await expect(dialog).toHaveCount(0)
      await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
      await page.getByRole('button', { name: 'イベントを絞り込む' }).click()
    }
    const store = dialog.getByRole('combobox')
    await store.focus()
    await expect(store).toBeInViewport()
    const storeBox = (await store.boundingBox())!,
      actionBox = (await action.boundingBox())!
    expect(storeBox.y + storeBox.height).toBeLessThanOrEqual(actionBox.y)
    const unobscured = await store.evaluate((e) => {
      const r = e.getBoundingClientRect()
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    })
    expect(unobscured).toBe(true)
    await store.press('Space')
    await expect(page.getByRole('option', { name: '札幌店', exact: true })).toBeVisible()
    await page.keyboard.press('End')
    await expect(page.getByRole('option', { name: '札幌店', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => new URL(page.url()).searchParams.get('store')).toBe('sapporo')
    await dialog.getByRole('checkbox', { name: 'アクキー', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(dialog.getByRole('button', { name: '4件を表示', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'フィルターをクリア' }).click()
    await expect(dialog.getByRole('button', { name: '16件を表示', exact: true })).toBeVisible()
    const url = new URL(page.url())
    expect(url.searchParams.get('store')).toBeNull()
    expect(url.searchParams.get('hideCompleted')).toBe('false')
    await dialog.getByRole('button', { name: '16件を表示', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('16件')
    await expect(page.getByRole('status')).toContainText('すべての種別')
  })

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { paintEvidence } from './local/support'

const phase = process.env.B02_PHASE ?? 'after'
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b02', phase)
const widths = [320, 375, 430, 768, 1024, 1280, 1440]
const fixedNow = new Date('2026-10-19T16:00:00Z') // October 20 JST, October 19 UTC
const todayJst = new Date(fixedNow.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
const statusLabels = { upcoming: '開催前', ongoing: '開催中', last_day: '最終日', ended: '終了' } as const
// Same date rule as the app's calculateEventStatus, evaluated on the JST date of the fixed clock.
function statusOn(event: { startDate: string; endDate: string }): keyof typeof statusLabels {
  if (todayJst < event.startDate) return 'upcoming'
  if (todayJst > event.endDate) return 'ended'
  if (todayJst === event.endDate) return 'last_day'
  return 'ongoing'
}
const events = ['limited_card', 'regular_card', 'ackey', 'other'].flatMap((category, c) =>
  ['ongoing', 'upcoming', 'last_day', 'ended'].map((status, i) => ({
    uuid: `550e8400-e29b-41d4-a716-${String(c * 4 + i).padStart(12, '0')}`,
    category,
    title: `${category} 秋の記念プレゼント ${status}`,
    stores: category === 'regular_card' ? [['sapporo'], ['akiba'], ['shinjyuku'], ['nagoyagate']][i] : ['sapporo'],
    startDate: status === 'upcoming' ? '2026-10-24' : '2026-10-01',
    endDate: status === 'last_day' ? '2026-10-20' : status === 'ended' ? '2026-10-18' : '2026-11-06',
    isVerified: true,
    isPreliminary: false,
    conditions: [],
    status,
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01'
  }))
)
async function install(page: Page) {
  await page.clock.setFixedTime(fixedNow)
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15322') return route.abort()
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
async function themeCheck(page: Page, theme: string) {
  const actual = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor
    ctx.fillRect(0, 0, 1, 1)
    return {
      dark: document.documentElement.classList.contains('dark'),
      rgb: [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
  })
  expect(actual).toEqual({ dark: theme === 'dark', rgb: theme === 'dark' ? [9, 9, 11] : [252, 231, 243] })
  return actual
}
// The first page load makes the dev server transform the whole module graph, which takes 10s or more and would eat
// most of the first test's 15s budget. Pay it once here, waiting for the page to render rather than for a fixed time.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000)
  const page = await browser.newPage()
  try {
    await install(page)
    await page.goto('/events/', { timeout: 50_000 })
    await expect(page.getByRole('heading', { name: 'イベント一覧', exact: true })).toBeVisible({ timeout: 50_000 })
  } finally {
    await page.close()
  }
})
test.beforeEach(async ({ page }) => install(page))
for (const width of widths)
  test(`responsive choice ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/events/')
    await expect(page.getByRole('heading', { name: 'イベント一覧', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'ガントチャートスクロールエリア' })).toHaveCount(width < 768 ? 0 : 1)
    const list = page.getByRole('button', { name: '一覧', exact: true }),
      schedule = page.getByRole('button', { name: '日程', exact: true })
    await expect(list).toHaveAttribute('aria-pressed', width < 768 ? 'true' : 'false')
    await expect(schedule).toHaveAttribute('aria-pressed', width < 768 ? 'false' : 'true')
    expect(await page.evaluate(() => localStorage.getItem('event-view-mode'))).toBeNull()
    await page.setViewportSize({ width: width < 768 ? 1280 : 375, height: 900 })
    await expect(list).toHaveAttribute('aria-pressed', width < 768 ? 'false' : 'true')
    await schedule.click()
    await expect(schedule).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(schedule).toHaveAttribute('aria-pressed', 'true')
    await page.setViewportSize({ width: 320, height: 900 })
    await expect(schedule).toHaveAttribute('aria-pressed', 'true')
    await list.click()
    await page.reload()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(list).toHaveAttribute('aria-pressed', 'true')
    expect(new URL(page.url()).searchParams.has('view')).toBe(false)
  })
for (const saved of ['grid', 'gantt', 'invalid'])
  test(`saved ${saved}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.addInitScript((value) => localStorage.setItem('event-view-mode', JSON.stringify(value)), saved)
    await page.goto('/events/')
    await expect(page.getByRole('button', { name: saved === 'gantt' ? '日程' : '一覧', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
test('today position scrolls timetable and returns current JST month', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.addInitScript(() => localStorage.setItem('event-view-mode', JSON.stringify('gantt')))
  await page.goto('/events/')
  const region = page.getByRole('region', { name: 'ガントチャートスクロールエリア' })
  await expect(region).toBeVisible()
  await region.evaluate((e) => {
    e.scrollLeft = 0
  })
  await page.getByRole('button', { name: '今日の位置へ', exact: true }).click()
  await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBe(608)
  await page.getByRole('button', { name: '26/11', exact: true }).click()
  await page.getByRole('button', { name: '今日の位置へ', exact: true }).click()
  await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBe(608)
  await expect(page.getByText('左右にスクロールして日付を確認できます', { exact: true })).toBeVisible()
})
for (const theme of ['light', 'dark'])
  for (const width of widths)
    test(`visual ${theme} ${width}`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(() => localStorage.setItem('event-view-mode', JSON.stringify('gantt')))
      await page.goto(`/events/?theme=${theme}&status=ongoing,upcoming,ended`)
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      await expect(page.getByRole('heading', { name: 'イベント一覧', exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      // The initial scroll schedules a rAF and a 150ms label fade; settle that queued work before the paint guard.
      await page.waitForTimeout(200)
      await expect
        .poll(() =>
          page
            .locator('section .absolute.top-1 > div')
            .evaluateAll((elements) => elements.every((element) => getComputedStyle(element).opacity === '1'))
        )
        .toBe(true)
      const verified = await themeCheck(page, theme)
      const exactFonts = await paintEvidence(page, theme)
      await writeFile(resolve(scratch, `${theme}-${width}-exact-fonts.json`), JSON.stringify(exactFonts, null, 2))
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      const evidence = await page.evaluate(() => {
        const rgb = (color: string) => {
          const ctx = document.createElement('canvas').getContext('2d')!
          ctx.fillStyle = color
          ctx.fillRect(0, 0, 1, 1)
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
        }
        const lum = (color: number[]) =>
          color
            .map((v) => v / 255)
            .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
        const bars = [...document.querySelectorAll('section .absolute.top-1')].map((bar) => {
          const text = bar.querySelector('span')!
          const bg = getComputedStyle(bar).backgroundColor,
            fg = getComputedStyle(text).color
          const a = lum(rgb(bg)),
            b = lum(rgb(fg))
          return {
            title: text.textContent,
            text: bar.textContent,
            background: bg,
            labelOpacity: getComputedStyle(bar.firstElementChild!).opacity,
            color: fg,
            contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            font: parseFloat(getComputedStyle(text).fontSize),
            labels: [...bar.querySelectorAll('div span')].map((label) => ({
              text: label.textContent,
              color: getComputedStyle(label).color,
              font: parseFloat(getComputedStyle(label).fontSize)
            })),
            rowHeight: bar.parentElement!.getBoundingClientRect().height
          }
        })
        const region = document.querySelector('section')!
        return {
          bars,
          scrollWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
          internalWidth: region.scrollWidth,
          internalClient: region.clientWidth
        }
      })
      await themeCheck(page, theme)
      await writeFile(resolve(scratch, `${theme}-${width}.json`), JSON.stringify({ verified, ...evidence }, null, 2))
      for (const bar of evidence.bars) expect(bar.labelOpacity).toBe('1')
      if (phase === 'before') return
      expect(evidence.scrollWidth).toBeLessThanOrEqual(width)
      expect(evidence.internalWidth).toBeGreaterThan(evidence.internalClient)
      expect(evidence.bars).toHaveLength(16)
      for (const bar of evidence.bars) {
        expect(bar.contrast).toBeGreaterThanOrEqual(4.5)
        expect(bar.rowHeight).toBeGreaterThanOrEqual(32)
        expect(bar.font).toBeGreaterThanOrEqual(13)
        for (const label of bar.labels) {
          expect(label.color).toBe(bar.color)
          expect(label.font).toBeGreaterThanOrEqual(13)
        }
        expect(bar.text).toMatch(/限定名刺|通年名刺|アクキー|アクスタ|その他/)
        // The schedule bar names the status except while the event is ongoing; match the bar to its fixture event.
        const event = events.find((candidate) => candidate.title === bar.title)
        if (!event) throw new Error(`No fixture event for bar "${bar.title}"`)
        const status = statusOn(event)
        expect(event.status, `fixture status of "${event.title}"`).toBe(status)
        const shown = Object.values(statusLabels).filter((label) => bar.text?.includes(label))
        expect(shown, `status words in "${event.title}"`).toEqual(status === 'ongoing' ? [] : [statusLabels[status]])
      }
    })

for (const theme of ['light', 'dark'])
  test(`hover preserves opaque readable bands ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.addInitScript(() => localStorage.setItem('event-view-mode', JSON.stringify('gantt')))
    await page.goto(`/events/?theme=${theme}&status=ongoing,upcoming,ended`)
    await expect(page.getByRole('heading', { name: 'イベント一覧', exact: true })).toBeVisible()
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
    await themeCheck(page, theme)
    const links = page.locator('section .absolute.top-1 > a')
    await expect(links).toHaveCount(16)
    const evidence = []
    for (const link of await links.all()) {
      await link.hover()
      const measured = await link.evaluate((el) => {
        const bar = el.parentElement
        if (!bar) throw new Error('Missing band')
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('Missing color measurement context')
        // The computed overlay syntax (rgba / oklab / color()) depends on the browser, so paint it over an opaque
        // backdrop and compare pixels instead of strings.
        const over = (color: string, backdrop: string) => {
          ctx.fillStyle = backdrop
          ctx.fillRect(0, 0, 1, 1)
          ctx.fillStyle = color
          ctx.fillRect(0, 0, 1, 1)
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
        }
        // Reference: --gantt-foreground at 10%, resolved in the same scope as the link.
        const reference = document.createElement('div')
        reference.style.backgroundColor = 'color-mix(in srgb, var(--gantt-foreground) 10%, transparent)'
        bar.appendChild(reference)
        const referenceColor = getComputedStyle(reference).backgroundColor
        reference.remove()
        const overlay = getComputedStyle(el).backgroundColor
        const foreground = over(getComputedStyle(bar).getPropertyValue('--gantt-foreground').trim(), '#fff')
        const overlayOnWhite = over(overlay, '#fff'),
          overlayOnBlack = over(overlay, '#000')
        const referenceOnWhite = over(referenceColor, '#fff'),
          referenceOnBlack = over(referenceColor, '#000')
        // white - black = 255 * (1 - alpha), independent of the overlay color.
        const gap = overlayOnWhite.map((v, i) => v - overlayOnBlack[i])
        return {
          overlay,
          overlayOnWhite,
          overlayOnBlack,
          overlayAlpha: 1 - gap.reduce((sum, v) => sum + v, 0) / gap.length / 255,
          foreground,
          referenceDelta: Math.max(
            ...overlayOnWhite.map((v, i) => Math.abs(v - referenceOnWhite[i])),
            ...overlayOnBlack.map((v, i) => Math.abs(v - referenceOnBlack[i]))
          ),
          outline: getComputedStyle(el).outlineStyle,
          background: getComputedStyle(bar).backgroundColor,
          colors: [...bar.querySelectorAll('div span')].map((span) => getComputedStyle(span).color)
        }
      })
      // Hover darkens the whole band with --gantt-foreground at 10% alpha, with no outline.
      expect(measured.foreground).toEqual([24, 24, 27])
      expect(Math.abs(measured.overlayAlpha - 0.1)).toBeLessThanOrEqual(0.01)
      expect(measured.referenceDelta).toBeLessThanOrEqual(1)
      expect(measured.outline).toBe('none')
      for (const color of measured.colors) expect(color).toBe('rgb(24, 24, 27)')
      evidence.push(measured)
    }
    await mkdir(scratch, { recursive: true })
    await writeFile(resolve(scratch, `${theme}-hover.json`), JSON.stringify(evidence, null, 2))
  })

for (const theme of ['light', 'dark'])
  for (const width of [375, 1280])
    for (const selected of ['grid', 'gantt'])
      test(`view control contrast ${theme} ${width} ${selected}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.addInitScript((mode) => localStorage.setItem('event-view-mode', JSON.stringify(mode)), selected)
        await page.goto(`/events/?theme=${theme}`)
        await expect(page.getByRole('heading', { name: 'イベント一覧', exact: true })).toBeVisible()
        await themeCheck(page, theme)
        await page.mouse.move(0, 0)
        const measurements = []
        for (const [label, mode] of [
          ['一覧', 'grid'],
          ['日程', 'gantt']
        ]) {
          const button = page.getByRole('button', { name: label, exact: true })
          await expect(button).toHaveAttribute('aria-pressed', String(selected === mode))
          const measured = await button.evaluate((element) => {
            const ctx = document.createElement('canvas').getContext('2d')
            if (!ctx) throw new Error('Missing color measurement context')
            const ancestors: Element[] = []
            for (let parent: Element | null = element; parent; parent = parent.parentElement) ancestors.push(parent)
            // Composite every transparent/alpha ancestor background in actual paint order.
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, 1, 1)
            for (const ancestor of ancestors.reverse()) {
              ctx.fillStyle = getComputedStyle(ancestor).backgroundColor
              ctx.fillRect(0, 0, 1, 1)
            }
            const backgroundRGB = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
            const color = getComputedStyle(element).color
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            const foregroundRGB = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
            const luminance = (rgb: number[]) =>
              rgb
                .map((v) => v / 255)
                .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
            const fg = luminance(foregroundRGB),
              bg = luminance(backgroundRGB)
            return {
              label: element.textContent?.trim(),
              color,
              foregroundRGB,
              backgroundRGB,
              contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
            }
          })
          measurements.push(measured)
          expect(measured.contrast, `${theme} ${selected} ${label}`).toBeGreaterThanOrEqual(4.5)
        }
        await themeCheck(page, theme)
        const folder = resolve(scratch, 'controls-review-fix')
        await mkdir(folder, { recursive: true })
        await writeFile(resolve(folder, `${theme}-${width}-${selected}.json`), JSON.stringify(measurements, null, 2))
      })

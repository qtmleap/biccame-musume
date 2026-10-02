import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { characters } from './character-search-layout/fixtures'

const phase = process.env.B07_PHASE ?? 'after'
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b07', phase)
const setup = async (page: Page, theme: string) => {
  await page.addInitScript(() => {
    localStorage.setItem('biccame-sort-type', JSON.stringify('character_birthday'))
    Math.random = () => 0.5
  })
  // biome-ignore lint/plugin: Playwright clock accepts Date for the fixed synthetic instant.
  await page.clock.setFixedTime(new Date('2026-10-02T03:00:00Z'))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15327') return route.abort()
    if (url.pathname === '/characters.json') return route.fulfill({ json: characters })
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/')) return route.abort()
    return route.continue()
  })
  await page.goto(`/e2e/card-surface-layout/index.html?theme=${theme}`)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  await expect(page.locator('[data-surface=characters] h3')).toHaveCount(4)
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('#root *')].every((e) => Number(getComputedStyle(e).opacity) === 1)
      )
    )
    .toBe(true)
}
const measure = async (page: Page, theme: string) => {
  await page.evaluate(async () => {
    for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'])
      for (const weight of [400, 500, 700]) await document.fonts.load(`${weight} 16px "${family}"`, '店舗ABC')
    await document.fonts.ready
  })
  const takeMeasurement = () =>
    page.evaluate(() => {
      const box = (e: Element) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      }
      const cards = [...document.querySelectorAll('section[data-surface] .bg-card')]
        .filter((e) => e.getBoundingClientRect().width > 0 && e.querySelector('h3, [data-event-heading] p'))
        .map((e) => {
          const style = getComputedStyle(e)
          const surface = e.closest('section[data-surface]')?.getAttribute('data-surface')
          const title = e.querySelector('h3, [data-event-heading] p')
          const rotate = e.parentElement
          const shadow = rotate?.parentElement
          return {
            surface,
            id: e.querySelector('a')?.getAttribute('href') ?? e.getAttribute('href'),
            premium: surface === 'ranking' && e.classList.contains('flex-col'),
            box: box(e),
            layoutHeight: e.clientHeight,
            padding: style.padding,
            background: style.backgroundColor,
            radius: style.borderRadius,
            transform: rotate ? getComputedStyle(rotate).transform : '',
            filter: shadow ? getComputedStyle(shadow).filter : '',
            title: title
              ? {
                  box: box(title),
                  font: getComputedStyle(title).fontFamily,
                  weight: getComputedStyle(title).fontWeight
                }
              : null,
            actions: [...e.querySelectorAll('a,button')].map((a) => ({
              href: a.getAttribute('href'),
              label: a.getAttribute('aria-label'),
              box: box(a)
            })),
            tapes: e.querySelectorAll('[aria-hidden].absolute').length
          }
        })
      const context = document.createElement('canvas').getContext('2d')!
      context.fillStyle = getComputedStyle(document.body).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return {
        dark: document.documentElement.classList.contains('dark'),
        bodyRGB: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3),
        fonts: [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, status: f.status })),
        opacity: [...document.querySelectorAll('html,body,#root,#root *')].map((e) => getComputedStyle(e).opacity),
        nonOpaque: [...document.querySelectorAll('html,body,#root,#root *')]
          .filter((e) => getComputedStyle(e).opacity !== '1')
          .map((e) => ({ html: e.outerHTML.slice(0, 250), opacity: getComputedStyle(e).opacity })),
        grids: [
          ...document.querySelectorAll(
            '[data-surface=characters] .grid, [data-surface=home] > .grid, [data-surface=events] > .grid, [data-surface=ranking] .grid'
          )
        ]
          .filter((e) => !e.closest('[data-surface=characters]') || e.querySelector('h3'))
          .map((e) => ({
            display: getComputedStyle(e).display,
            columns: getComputedStyle(e).gridTemplateColumns,
            gap: getComputedStyle(e).gap
          })),
        cards,
        scrollWidth: document.documentElement.scrollWidth
      }
    })
  const samples: Awaited<ReturnType<typeof takeMeasurement>>[] = []
  await expect
    .poll(async () => {
      const snapshot = await takeMeasurement()
      samples.push(snapshot)
      return snapshot.opacity.every((v) => v === '1')
    })
    .toBe(true)
  const result = samples[samples.length - 1]
  expect(result.dark).toBe(theme === 'dark')
  expect(result.bodyRGB).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
  for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'])
    for (const weight of ['400', '500', '700'])
      expect(
        result.fonts.some(
          (f) => f.family.replaceAll('"', '') === family && f.weight === weight && f.status === 'loaded'
        ),
        JSON.stringify({
          family,
          weight,
          registered: result.fonts
            .filter((f) => f.family.includes(family))
            .map((f) => ({ weight: f.weight, status: f.status }))
        })
      ).toBe(true)
  expect(
    result.opacity.every((v) => v === '1'),
    JSON.stringify(result.nonOpaque)
  ).toBe(true)
  expect(result.grids, JSON.stringify(result.grids)).toEqual(
    expect.arrayContaining([expect.objectContaining({ display: 'grid', gap: '16px' })])
  )
  for (const grid of result.grids) expect(Number.parseFloat(grid.gap), JSON.stringify(grid)).toBeGreaterThanOrEqual(12)
  for (const c of result.cards) {
    expect(c.radius).not.toBe('0px')
    expect(c.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(c.title?.font).toContain('Zen Maru Gothic')
    expect(Number(c.title?.weight)).toBeGreaterThanOrEqual(600)
    expect(c.box.width).toBeGreaterThan(100)
  }
  return result
}
const noOverlap = (cards: Awaited<ReturnType<typeof measure>>['cards']) => {
  for (const [i, a] of cards.entries())
    for (const b of cards.slice(i + 1))
      if (a.surface === b.surface && !a.premium && !b.premium)
        expect(
          a.box.right <= b.box.x + 0.5 ||
            b.box.right <= a.box.x + 0.5 ||
            a.box.bottom <= b.box.y + 0.5 ||
            b.box.bottom <= a.box.y + 0.5
        ).toBe(true)
}
for (const theme of ['light', 'dark'])
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440])
    test(`${theme} ${width} surfaces`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await setup(page, theme)
      const beforeCapture = await measure(page, theme)
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      // 撮影直後の状態を待機せず記録し、後の安定化で無効な撮影を隠さない。
      const immediatePostOpacity = await page.evaluate(() =>
        [...document.querySelectorAll('html,body,#root,#root *')].map((e) => getComputedStyle(e).opacity)
      )
      const afterCapture = await measure(page, theme)
      await writeFile(
        resolve(scratch, `${theme}-${width}.json`),
        JSON.stringify(
          {
            phase,
            theme,
            width,
            sortMode: 'character_birthday',
            incidentalRandom: 0.5,
            head: execSync('git rev-parse HEAD').toString().trim(),
            specSHA256: createHash('sha256')
              .update(await readFile('e2e/card-surface-layout.spec.ts'))
              .digest('hex'),
            sourceDiffSHA256: createHash('sha256')
              .update(
                execSync(
                  'git diff -- src/lib/sticker.ts src/components/character-list-card.tsx src/components/home/event-list-item.tsx src/components/events/event-grid-item.tsx src/components/ranking/ranking-row.tsx'
                )
              )
              .digest('hex'),
            beforeCapture,
            afterCapture,
            immediatePostOpacity
          },
          null,
          2
        )
      )
      expect(immediatePostOpacity.every((v) => v === '1')).toBe(true)
      if (phase === 'before') return
      const baseline = JSON.parse(await readFile(resolve(scratch, '../before', `${theme}-${width}.json`), 'utf8'))
      expect(afterCapture.cards.map((c) => c.id)).toEqual(baseline.afterCapture.cards.map((c: { id: string }) => c.id))
      expect(afterCapture.scrollWidth).toBeLessThanOrEqual(width)
      noOverlap(afterCapture.cards)
      for (const c of afterCapture.cards.filter((c) => !c.premium)) {
        expect(c.transform).toBe('none')
        expect(c.padding).toBe('12px')
      }
      for (const c of afterCapture.cards.filter((c) => c.premium)) expect(c.transform).not.toBe('none')
      const characterCards = afterCapture.cards.filter((c) => c.surface === 'characters').slice(0, 3)
      expect(new Set(characterCards.map((c) => c.layoutHeight)).size).toBe(1)
      for (const surface of ['home', 'events']) {
        const cards = afterCapture.cards.filter((c) => c.surface === surface)
        expect(new Set(cards.map((c) => c.title?.box.height)).size).toBe(1)
      }
      for (const surface of ['characters', 'home', 'events', 'ranking']) {
        const section = page.locator(`[data-surface=${surface}]`)
        const target = section
          .locator(surface === 'ranking' ? '.bg-card:not(.flex-col) a' : 'a')
          .filter({ visible: true })
          .first()
        await target.scrollIntoViewIfNeeded()
        await target.hover()
        await page.waitForTimeout(350)
        noOverlap((await measure(page, theme)).cards)
        await target.focus()
        await expect(target).toBeFocused()
        const focus = await target.evaluate((e) => ({
          shadow: getComputedStyle(e).boxShadow,
          outline: getComputedStyle(e).outlineStyle,
          hit: (() => {
            const r = e.getBoundingClientRect()
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            return hit === e || (hit !== null && e.contains(hit))
          })()
        }))
        expect(focus.hit).toBe(true)
        expect(focus.shadow !== 'none' || focus.outline !== 'none').toBe(true)
        expect(await target.getAttribute('href')).toMatch(/^\/(characters|events)\//)
        await page.mouse.move(0, 0)
      }
    })

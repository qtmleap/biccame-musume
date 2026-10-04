import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { characters } from './character-search-layout/fixtures'

const phase = process.env.B04_PHASE ?? 'after'
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b04', phase)
const setup = async (page: Page, theme = 'light') => {
  await page.addInitScript(() => {
    localStorage.setItem('biccame-sort-type', JSON.stringify('character_birthday'))
    Math.random = () => 0.5
  })
  // biome-ignore lint/plugin: Browser clock accepts Date for a fixed synthetic instant.
  await page.clock.setFixedTime(new Date('2026-10-02T03:00:00Z'))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15324') return route.abort()
    if (url.pathname === '/characters.json') return route.fulfill({ json: characters })
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/')) return route.abort()
    return route.continue()
  })
  await page.goto(`/e2e/character-search-layout/index.html?theme=${theme}`)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  await expect(page.locator('h3')).toHaveCount(4)
}
test('search, region AND, empty reset and keyboard reachability', async ({ page }) => {
  await setup(page)
  const search = page.getByRole('searchbox', { name: '名前・別名・店舗名で検索' })
  await expect(search).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(search).toBeFocused()
  for (const query of ['ナゴヤ ゲート', 'ｹﾞｰﾄ　ﾁｬﾝ', '名古屋 JR']) {
    await search.fill(query)
    await expect(page.locator('h3')).toHaveCount(1)
    await expect(page.getByRole('status')).toHaveText('1件 / 全4件')
  }
  await page.getByRole('radio', { name: '関東' }).click()
  await expect(page.locator('h3')).toHaveCount(0)
  await expect(page.getByText('条件に一致するキャラクターが見つかりません。')).toBeVisible()
  const emptyEvidence = await measure(page, 'light')
  for (const item of emptyEvidence.text) expect(item.contrast).toBeGreaterThanOrEqual(4.5)
  await page.getByRole('button', { name: '条件を解除' }).click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(page.getByRole('radio', { name: '全国' })).toBeChecked()
  await expect(page.locator('h3')).toHaveCount(4)
  const reached = new Set<string>()
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    reached.add(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''))
  }
  expect([...reached].some((name) => name.endsWith('の詳細を見る'))).toBe(true)
  expect(reached.has('フォロー')).toBe(true)
  expect(reached.has('応援する')).toBe(true)
})
const measure = async (page: Page, theme: string) => {
  await page.evaluate(async () => {
    for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code']) {
      for (const weight of [400, 500, 700]) await document.fonts.load(`${weight} 16px "${family}"`, '店舗検索ABC')
    }
    await document.fonts.ready
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('#root *')].every((e) => Number(getComputedStyle(e).opacity) === 1)
      )
    )
    .toBe(true)
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) throw new Error('No canvas')
    const rgb = (color: string) => {
      canvas.fillStyle = color
      canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (color: number[]) =>
      color
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const text = [...document.querySelectorAll('h1,h3,p,input,label,button')]
      .filter((e) => e.tagName !== 'BUTTON' || e.textContent?.trim() === '条件を解除')
      .map((e) => {
        const style = getComputedStyle(e)
        const ancestors: Element[] = []
        for (let p: Element | null = e; p; p = p.parentElement) ancestors.push(p)
        const bg =
          ancestors.map((p) => getComputedStyle(p).backgroundColor).find((c) => c !== 'rgba(0, 0, 0, 0)') ?? 'white'
        const a = luminance(rgb(style.color)),
          b = luminance(rgb(bg))
        const r = e.getBoundingClientRect()
        return {
          text: e.textContent,
          family: style.fontFamily,
          weight: style.fontWeight,
          color: style.color,
          background: bg,
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          opacity: ancestors.map((p) => getComputedStyle(p).opacity)
        }
      })
    const cards = [...document.querySelectorAll('a[aria-label$="の詳細を見る"]')].map((a) => {
      const card = a.parentElement
      if (!card) throw new Error('No card')
      const action = card.querySelector('button')
      const title = card.querySelector('h3')
      const metadata = card.querySelector('[data-character-region]')
      const r = card.getBoundingClientRect()
      const grid = card.parentElement?.parentElement?.parentElement
      return {
        id: a.getAttribute('href')?.split('/').pop(),
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        actions: [...card.querySelectorAll('button,a[aria-label=フォロー]')].map((e) => ({
          top: e.getBoundingClientRect().top
        })),
        height: card.clientHeight,
        width: card.clientWidth,
        x: r.x,
        titleBottom: title?.getBoundingClientRect().bottom,
        metadataBottom: metadata?.getBoundingClientRect().bottom,
        actionTop: action?.getBoundingClientRect().top
      }
    })
    return {
      dark: document.documentElement.classList.contains('dark'),
      bodyRGB: rgb(getComputedStyle(document.body).backgroundColor),
      fonts: [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, status: f.status })),
      text,
      cards,
      opacity: [...document.querySelectorAll('html,body,#root,#root *')].map((e) => getComputedStyle(e).opacity),
      scrollWidth: document.documentElement.scrollWidth
    }
  })
  expect(result.dark).toBe(theme === 'dark')
  expect(result.bodyRGB).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
  for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'])
    for (const weight of ['400', '500', '700'])
      expect(
        result.fonts.some(
          (f) => f.family.replaceAll('"', '') === family && f.weight === weight && f.status === 'loaded'
        )
      ).toBe(true)
  for (const text of result.text) expect(text.family).toContain('Zen Maru Gothic')
  expect(result.text.filter((t) => t.weight === '700').length).toBeGreaterThan(0)
  expect(result.opacity.every((o) => o === '1')).toBe(true)
  return result
}
for (const theme of ['light', 'dark'])
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440])
    test(`${theme} ${width} visual`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await setup(page, theme)
      const beforeCapture = await measure(page, theme)
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      const afterCapture = await measure(page, theme)
      await writeFile(
        resolve(scratch, `${theme}-${width}.json`),
        JSON.stringify(
          {
            phase,
            sortMode: 'character_birthday',
            incidentalRandom: 0.5,
            theme,
            width,
            head: execSync('git rev-parse HEAD').toString().trim(),
            specSHA256: createHash('sha256')
              .update(await readFile('e2e/character-search-layout.spec.ts'))
              .digest('hex'),
            beforeCapture,
            afterCapture
          },
          null,
          2
        )
      )
      if (phase === 'before') return
      expect(afterCapture.cards.map((c) => c.id)).toEqual(['gate', 'tokyo', 'kyoto', 'other'])
      if (process.env.B04_COMPARE_BASELINE === '1') {
        const baseline = JSON.parse(await readFile(resolve(scratch, '../before', `${theme}-${width}.json`), 'utf8'))
        expect(afterCapture.cards.map((c) => c.id)).toEqual(
          baseline.afterCapture.cards.map((c: { id: string }) => c.id)
        )
      }
      expect(afterCapture.scrollWidth).toBeLessThanOrEqual(width)
      for (const t of afterCapture.text) expect(t.contrast).toBeGreaterThanOrEqual(4.5)
      for (const c of afterCapture.cards) {
        expect(c.columns).toBe(width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1)
        for (const action of c.actions) {
          expect(c.titleBottom).toBeLessThanOrEqual(action.top)
          expect(c.metadataBottom).toBeLessThanOrEqual(action.top)
        }
      }
      expect(new Set(afterCapture.cards.slice(0, 3).map((c) => c.height)).size).toBe(1)
      expect(new Set(afterCapture.cards.slice(0, 3).map((c) => c.width)).size).toBe(1)
    })

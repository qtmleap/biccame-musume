import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'

const phase = process.env.B09_PHASE ?? 'after'
const artifactDir = `.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b09/${phase}`
const identity = {
  head: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
  sourceHash: createHash('sha256').update(readFileSync('workers/app/src/app/routes/route/index.tsx')).digest('hex'),
  specHash: createHash('sha256').update(readFileSync('e2e/route-empty-state-layout.spec.ts')).digest('hex'),
  fixture: ['a', 'b', 'c', 'd', 'e', 'f'],
  sort: 'distance from Kyoto'
}
const setup = async (page: Page, theme = 'light') => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://localhost:15409') return route.abort()
    if (url.pathname === '/api/directions') {
      requests.push(route.request().postData() ?? '')
      return route.fulfill({ json: { status: 'unavailable', reason: 'generation_failed' } })
    }
    if (url.pathname.startsWith('/api/')) return route.abort()
    if (url.pathname === '/route-empty-state-harness')
      return route.fulfill({
        contentType: 'text/html',
        body: `<html class="${theme}"><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/e2e/route-empty-state-harness.tsx');</script></html>`
      })
    return route.continue()
  })
  await page.goto('/route-empty-state-harness')
  await expect(page.getByRole('heading', { name: 'ルート計算' })).toBeVisible()
  return { requests, errors }
}
const add = async (page: Page, name: string) => {
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name, exact: true }).click()
}

test('instructions and distinct disabled reasons update without AI calls', async ({ page }) => {
  const { requests, errors } = await setup(page)
  await expect(page.getByText('店舗を2〜5件選択', { exact: true })).toBeVisible()
  await expect(page.getByText('利用駅を確認', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('まず店舗を2〜5件選択してください。')
  await expect(page.getByRole('button', { name: '訪問順を計算' })).toBeDisabled()
  await add(page, '店舗A')
  await expect(page.getByRole('status')).toHaveText('あと1店舗選択してください（現在1件）。')
  await add(page, '駅未設定の店舗')
  await expect(page.getByRole('status')).toHaveText(
    '利用駅が未設定の店舗があります。各店舗の利用駅を確認してください。'
  )
  await expect(page.getByRole('button', { name: '訪問順を計算' })).toBeDisabled()
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: '駅未設定の店舗をルートから削除' }).focus()
  await page.keyboard.press('Enter')
  await add(page, '店舗B')
  await expect(page.getByRole('status')).toHaveText('利用駅を確認したら、訪問順を計算できます。')
  await page.getByRole('combobox', { name: '店舗Aの利用駅' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('option', { name: '新宿', exact: true }).click()
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: '訪問順を計算' }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect(page.getByText('所要時間を取得できませんでした').first()).toBeVisible()
  await expect(page.getByText('0分', { exact: true })).toHaveCount(0)
  await expect(page.getByText('交通機関での最短経路を保証するものではありません。').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('five-store cap and long names fit mobile while keyboard clear remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  const { requests, errors } = await setup(page)
  for (const name of ['店舗A', '店舗B', 'とても長い名称の店舗C・駅前本館', '店舗E', '店舗F']) await add(page, name)
  await expect(page.getByRole('combobox').first()).toBeDisabled()
  await expect(page.getByText('選択中: 5店舗')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: '全てクリア' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('まず店舗を2〜5件選択してください。')
  expect(requests).toHaveLength(0)
  expect(errors).toEqual([])
})

const fonts = async (page: Page) =>
  page.evaluate(async () => {
    const faces = ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'].flatMap((family) =>
      [400, 500, 700].map((weight) => `${weight} 16px "${family}"`)
    )
    await Promise.all(faces.map((face) => document.fonts.load(face, '店舗 Route 123')))
    await document.fonts.ready
    return faces.map((face) => ({ face, loaded: document.fonts.check(face, '店舗 Route 123') }))
  })
const measure = async (page: Page, theme: string) => {
  const loadedFonts = await fonts(page)
  expect(loadedFonts.every((font) => font.loaded)).toBe(true)
  const snapshot = await page.evaluate(() => {
    const heading = document.querySelector('h1')
    if (!heading) throw new Error('Route heading is missing')
    const form = heading.parentElement
    if (!form) throw new Error('Route container is missing')
    const select = document.querySelector('[data-slot="select-trigger"]')
    if (!select) throw new Error('Store selector is missing')
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('訪問順を計算'))
    if (!button) throw new Error('Calculate button is missing')
    const bounds = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    const elements = [form, ...form.querySelectorAll('*')]
    return {
      theme: document.documentElement.className,
      background: getComputedStyle(document.body).backgroundColor,
      themeBackground: getComputedStyle(document.body).getPropertyValue('--page-bg'),
      font: getComputedStyle(heading).fontFamily,
      weight: getComputedStyle(heading).fontWeight,
      form: bounds(form),
      select: bounds(select),
      button: bounds(button),
      scrollWidth: document.documentElement.scrollWidth,
      opacity: Math.min(...elements.map((el) => Number(getComputedStyle(el).opacity))),
      activeOpacity: Math.min(
        ...elements
          .filter((el) => !el.closest(':disabled') && !el.matches('svg,svg *'))
          .map((el) => Number(getComputedStyle(el).opacity))
      ),
      headingDisplay: getComputedStyle(heading).display,
      selectHit:
        document
          .elementFromPoint(select.getBoundingClientRect().x + 20, select.getBoundingClientRect().y + 15)
          ?.closest('button') === select
    }
  })
  expect(snapshot.theme).toBe(theme)
  expect(snapshot.background).toBe(theme === 'dark' ? 'oklch(0.141 0.005 285.823)' : 'oklch(0.948 0.028 342.258)')
  expect(snapshot.font).toContain('Zen Maru Gothic')
  expect(snapshot.weight).toBe('700')
  expect(snapshot.headingDisplay).toBe('flex')
  expect(snapshot.select.height).toBeGreaterThanOrEqual(35)
  expect(snapshot.select.width).toBeGreaterThan(200)
  expect(snapshot.selectHit).toBe(true)
  expect(snapshot.activeOpacity).toBe(1)
  return { ...snapshot, loadedFonts }
}
for (const theme of ['light', 'dark'])
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
    test(`capture ${theme} ${width}`, async ({ page }) => {
      mkdirSync(artifactDir, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      const { requests, errors } = await setup(page, theme)
      const pre = await measure(page, theme)
      expect(pre.scrollWidth).toBeLessThanOrEqual(width)
      if (phase !== 'before') {
        await expect(page.getByText('店舗を2〜5件選択', { exact: true })).toBeVisible()
        expect(pre.form.width).toBeLessThanOrEqual(768)
        expect(pre.select.y).toBeGreaterThan(pre.form.y)
      }
      await page.screenshot({ path: `${artifactDir}/${theme}-${width}.png`, fullPage: true })
      const immediatePostOpacity = await page.evaluate(() =>
        Math.min(...[...document.querySelectorAll('h1,h1 ~ *')].map((el) => Number(getComputedStyle(el).opacity)))
      )
      const post = await measure(page, theme)
      expect(post).toEqual(pre)
      expect(requests).toHaveLength(0)
      expect(errors).toEqual([])
      writeFileSync(
        `${artifactDir}/${theme}-${width}.json`,
        JSON.stringify(
          { identity, phase, width, theme, pre, immediatePostOpacity, post, requests: requests.length, errors },
          null,
          2
        )
      )
    })
  }

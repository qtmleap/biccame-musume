import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'

const phase = process.env.B03_PHASE ?? 'after'
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b03', phase)
const widths = [320, 375, 430, 768, 1024, 1280, 1440]
const setup = async (page: Page, width: number, theme = 'light') => {
  await page.setViewportSize({ width, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-02T03:00:00Z'))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (
      url.origin !== 'http://127.0.0.1:15323' ||
      url.pathname.startsWith('/images/') ||
      url.pathname.startsWith('/api/')
    )
      return route.abort()
    return route.continue()
  })
  await page.goto(`/?theme=${theme}`)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  await expect(page.getByRole('button', { name: '2026年10月', exact: true })).toBeVisible()
  return page
}
const verifyCapture = async (page: Page, theme: string) => {
  await page.evaluate(async () => {
    for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code']) {
      for (const weight of ['400', '500', '700']) {
        const registered = [...document.fonts].some(
          (f) => f.family.replaceAll('"', '') === family && f.weight === weight
        )
        if (!registered) throw new Error(`Unregistered ${family}/${weight}`)
        const faces = await document.fonts.load(`${weight} 16px "${family}"`, '岡山駅前店高槻0123456789')
        if (!faces.length || faces.some((f) => f.status !== 'loaded')) throw new Error(`Unloaded ${family}/${weight}`)
      }
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
  const evidence = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) throw new Error('No canvas')
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor
    ctx.fillRect(0, 0, 1, 1)
    return {
      dark: document.documentElement.classList.contains('dark'),
      surface: [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3),
      fonts: [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => ({ family: f.family, weight: f.weight })),
      controls: [...document.querySelectorAll('button')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => ({
          name: e.getAttribute('aria-label') ?? e.textContent,
          color: getComputedStyle(e).color,
          font: getComputedStyle(e).fontFamily
        }))
    }
  })
  expect(evidence.dark).toBe(theme === 'dark')
  expect(evidence.surface).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
  if (phase !== 'before') {
    const controlColors = await page
      .getByRole('button', { name: /^(前の月|次の月|2026年10月)$/ })
      .evaluateAll((elements) => {
        const ctx = document.createElement('canvas').getContext('2d')
        if (!ctx) throw new Error('No canvas')
        return elements.map((e) => {
          ctx.fillStyle = getComputedStyle(e).color
          ctx.fillRect(0, 0, 1, 1)
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
        })
      })
    expect(controlColors).toEqual(Array.from({ length: 3 }, () => (theme === 'dark' ? [250, 250, 250] : [9, 9, 11])))
  }
  return evidence
}
for (const theme of ['light', 'dark'])
  for (const width of widths) {
    test(`visual ${theme} ${width}`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await setup(page, width, theme)
      const evidence = await verifyCapture(page, theme)
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      await verifyCapture(page, theme)
      await writeFile(resolve(scratch, `${theme}-${width}.json`), JSON.stringify(evidence, null, 2))
    })
  }
for (const width of widths) {
  test(`numeric months and reachable ends ${width}`, async ({ page }) => {
    await setup(page, width)
    await verifyCapture(page, 'light')
    if (width >= 768) {
      const first = await page.getByRole('button', { name: '1月に移動', exact: true }).boundingBox()
      const last = await page.getByRole('button', { name: '12月に移動', exact: true }).boundingBox()
      expect(first && last && first.x >= 0 && last.x + last.width <= width).toBe(true)
      if (!first || !last) throw new Error('Missing month bounds')
      expect(Math.abs((first.x + last.x + last.width) / 2 - width / 2)).toBeLessThan(2)
    }
    for (const month of [10, 1, 12, 2, 11, 3, 9, 4, 8, 5, 7, 6]) {
      const button = page.getByRole('button', { name: `${month}月に移動`, exact: true })
      await expect(button).toHaveText(`${month}月`)
      await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: `2026年${month}月`, exact: true })).toBeVisible()
      const visible = await button.evaluate((el) => {
        const b = el.getBoundingClientRect()
        const p = el.parentElement?.parentElement?.getBoundingClientRect()
        return !!p && b.left >= p.left - 1 && b.right <= p.right + 1 && b.left >= 0 && b.right <= innerWidth
      })
      expect(visible).toBe(true)
    }
    // Changing selection through previous/next controls also scrolls the selected month into view.
    await page.getByRole('button', { name: '2026年6月', exact: true }).click()
    await page.getByRole('button', { name: '次の月', exact: true }).click()
    const selected = page.getByRole('button', { name: '11月に移動', exact: true })
    await expect(selected).toHaveAttribute('aria-pressed', 'true')
    const b = await selected.boundingBox()
    expect(b && b.x >= 0 && b.x + b.width <= width).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
for (const width of [320, 768, 1024]) {
  test(`same target detail and full store names ${width}`, async ({ page }) => {
    await setup(page, width, 'dark')
    if (width <= 768) {
      await expect(page.getByText('岡山駅前店', { exact: true })).toBeVisible()
      await expect(page.getByText('高槻阪急スクエア店', { exact: true })).toBeVisible()
      expect(
        await page.getByText('高槻阪急スクエア店', { exact: true }).evaluate((e) => e.scrollHeight <= e.clientHeight)
      ).toBe(true)
      await expect(page.getByRole('link', { name: /岡山たん/ })).toHaveAttribute('href', '/characters/okayama')
      await page.getByRole('button', { name: '10月2日のイベントを開く', exact: true }).click()
    } else {
      await expect(page.getByText('岡山たん', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '2026年10月2日(イベント1件)', exact: true }).click()
    }
    await expect(page.getByRole('dialog')).toBeVisible()
    const target = page.getByRole('dialog').getByRole('link', { name: /岡山たん/ })
    await expect(target).toHaveAttribute('href', '/characters/okayama')
    await expect(target.getByText('ビックカメラ岡山駅前店', { exact: true })).toBeVisible()
    await target.click()
    await expect(page.getByText('詳細ページ到達')).toBeVisible()
  })
}
test('selected month stays visible when header advances on a narrow viewport', async ({ page }) => {
  await setup(page, 320)
  await page.getByRole('button', { name: '次の月', exact: true }).click()
  const selected = page.getByRole('button', { name: '11月に移動', exact: true })
  await expect(selected).toHaveAttribute('aria-pressed', 'true')
  expect((await selected.boundingBox())?.width).toBeGreaterThanOrEqual(44)
  await expect
    .poll(async () => {
      const b = await selected.boundingBox()
      return !!b && b.x >= 0 && b.x + b.width <= 320
    })
    .toBe(true)
})
test('initial selection, year transitions and viewport resize keep the selected month visible', async ({ page }) => {
  await setup(page, 320)
  await verifyCapture(page, 'light')
  const selectedVisible = async (month: number, width: number) => {
    const button = page.getByRole('button', { name: `${month}月に移動`, exact: true })
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => {
        const b = await button.boundingBox()
        return !!b && b.x >= 0 && b.x + b.width <= width
      })
      .toBe(true)
  }
  await selectedVisible(10, 320)
  await page.getByRole('button', { name: '12月に移動', exact: true }).click()
  await page.getByRole('button', { name: '次の月', exact: true }).click()
  await expect(page.getByRole('button', { name: '2027年1月', exact: true })).toBeVisible()
  await selectedVisible(1, 320)
  await page.getByRole('button', { name: '前の月', exact: true }).click()
  await expect(page.getByRole('button', { name: '2026年12月', exact: true })).toBeVisible()
  await selectedVisible(12, 320)
  await page.setViewportSize({ width: 1280, height: 900 })
  await selectedVisible(12, 1280)
  await page.setViewportSize({ width: 375, height: 900 })
  await selectedVisible(12, 375)
  await page.setViewportSize({ width: 768, height: 900 })
  await selectedVisible(12, 768)
  const first = await page.getByRole('button', { name: '1月に移動', exact: true }).boundingBox()
  expect(first && first.x >= 0 && first.x + first.width <= 768).toBe(true)
})

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { events } from './character-detail-layout/fixtures'

const phase = process.env.B05_PHASE ?? 'after'
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b05', phase)
const specSHA = createHash('sha256')
  .update(await readFile('e2e/character-detail-layout.spec.ts'))
  .digest('hex')
const head = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
for (const theme of ['light', 'dark'])
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
    test(`${theme}-${width}`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await page.clock.setFixedTime(new Date('2026-10-02T03:00:00Z'))
      await page.addInitScript(() => {
        Math.random = () => 0.5
      })
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== 'http://127.0.0.1:15325') return route.abort()
        if (url.pathname === '/api/me/favorites') return route.fulfill({ json: { favorites: [] } })
        if (url.pathname === '/api/me/activities')
          return route.fulfill({ json: { stores: [], events: { interested: [], completed: [] } } })
        if (url.pathname === '/api/events') return route.fulfill({ json: events })
        if (url.pathname.startsWith('/api/')) return route.abort()
        return route.continue()
      })
      await page.goto(`/e2e/character-detail-layout/index.html?theme=${theme}`)
      await expect(page.locator('h1')).toHaveText('あべのたん')
      await expect(page.getByRole('heading', { name: '店舗情報' })).toBeVisible()
      await expect(page.locator('img').first()).toBeVisible()
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(
          [400, 500, 700].map((weight) => document.fonts.load(`${weight} 16px "Zen Maru Gothic"`, '店舗情報あべのたん'))
        )
      })
      const snapshot = () =>
        page.evaluate(() => {
          const required = (selector: string) => {
            const e = document.querySelector(selector)
            if (!e) throw new Error(selector)
            return e
          }
          const canvas = document.createElement('canvas').getContext('2d')
          if (!canvas) throw new Error('canvas')
          const rgb = (color: string) => {
            canvas.clearRect(0, 0, 1, 1)
            canvas.fillStyle = color
            canvas.fillRect(0, 0, 1, 1)
            return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3)
          }
          const box = (e: Element) => {
            const r = e.getBoundingClientRect()
            return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
          }
          const luminance = (v: number[]) =>
            v
              .map((n) => n / 255)
              .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
              .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0)
          const title = required('h1')
          const headings = [...document.querySelectorAll('h2')]
          const store = headings.find((e) => e.textContent === '店舗情報')?.parentElement?.parentElement
          const nearby = headings.find((e) => e.textContent === '近くのビッカメ娘')?.parentElement
          const image = required('img')
          if (!store || !nearby || !(image instanceof HTMLImageElement)) throw new Error('fixture incomplete')
          const text = [...document.querySelectorAll('h1,h2,p,a,button,span')]
            .filter((e) => e.textContent?.trim() && e.children.length === 0 && e.getBoundingClientRect().height > 0)
            .map((e) => {
              const backgrounds: string[] = []
              for (const p of [
                e,
                ...(() => {
                  const parents: Element[] = []
                  const add = (n: Element | null): void => {
                    if (n) {
                      parents.push(n)
                      add(n.parentElement)
                    }
                  }
                  add(e.parentElement)
                  return parents
                })()
              ])
                backgrounds.push(getComputedStyle(p).backgroundColor)
              const background = backgrounds.find((c) => c !== 'rgba(0, 0, 0, 0)') ?? 'white'
              const s = getComputedStyle(e),
                fg = luminance(rgb(s.color)),
                bg = luminance(rgb(background))
              return {
                localSurface: Boolean(e.closest('.bg-card')),
                text: e.textContent,
                font: parseFloat(s.fontSize),
                family: s.fontFamily,
                weight: s.fontWeight,
                contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
                foregroundRGB: rgb(s.color),
                backgroundRGB: rgb(background),
                ...box(e)
              }
            })
          return {
            dark: document.documentElement.classList.contains('dark'),
            bodyRGB: rgb(getComputedStyle(document.body).backgroundColor),
            rootRGB: rgb(getComputedStyle(required('#root > div')).backgroundColor),
            fonts: [...document.fonts]
              .filter((f) => f.family.includes('Zen Maru Gothic'))
              .map((f) => ({ family: f.family, weight: f.weight, status: f.status })),
            opacity: [...document.querySelectorAll('[style]')].map((e) => Number(getComputedStyle(e).opacity)),
            image: {
              ...box(image),
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              objectFit: getComputedStyle(image).objectFit,
              transform: getComputedStyle(image).transform,
              src: image.getAttribute('src'),
              dpr: devicePixelRatio
            },
            title: {
              ...box(title),
              family: getComputedStyle(title).fontFamily,
              weight: getComputedStyle(title).fontWeight
            },
            store: box(store),
            nearby: box(nearby),
            text,
            orderedIDs: [...nearby.querySelectorAll('a[href]')].map((e) => e.getAttribute('href')),
            controls: [...document.querySelectorAll('button')].map(box),
            scrollWidth: document.documentElement.scrollWidth
          }
        })
      await expect.poll(async () => (await snapshot()).opacity.every((n) => n === 1)).toBe(true)
      const pre = await snapshot()
      const assertEnvironment = (record: typeof pre) => {
        expect(record.dark).toBe(theme === 'dark')
        expect(record.bodyRGB).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
        expect(record.rootRGB).toEqual(record.bodyRGB)
        expect(record.fonts.some((f) => f.status === 'loaded' && f.weight === '700')).toBe(true)
        expect(record.title.family).toContain('Zen Maru Gothic')
        expect(record.title.weight).toBe('700')
        expect(record.opacity.every((n) => n === 1)).toBe(true)
        expect(record.image.naturalWidth).toBe(330)
        expect(record.image.naturalHeight).toBe(330)
        expect(record.image.width / record.image.height).toBe(1)
      }
      assertEnvironment(pre)
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      const post = await snapshot()
      assertEnvironment(post)
      await writeFile(
        resolve(scratch, `${theme}-${width}.json`),
        JSON.stringify({ phase, width, theme, specSHA, head, seed: 0.5, pre, post }, null, 2)
      )
      if (phase === 'before') return
      const before = JSON.parse(await readFile(resolve(scratch, '../before', `${theme}-${width}.json`), 'utf8'))
      expect(pre.orderedIDs).toEqual(before.pre.orderedIDs)
      expect(pre.image.src).toBe(before.pre.image.src)
      expect(pre.scrollWidth).toBeLessThanOrEqual(width)
      expect(pre.image.objectFit).toBe('contain')
      expect(pre.image.transform).toBe('none')
      expect(pre.image.width).toBeGreaterThanOrEqual(width < 768 ? 96 : 128)
      expect(pre.image.width).toBeLessThanOrEqual(width < 768 ? 128 : 160)
      expect(pre.image.naturalWidth).toBeGreaterThanOrEqual(pre.image.width * 2)
      if (width < 768) expect(pre.nearby.y).toBeGreaterThanOrEqual(pre.store.bottom)
      else expect(pre.nearby.x).toBeGreaterThan(pre.store.right)
      for (const t of pre.text.filter((t) => t.localSurface))
        expect(t.contrast, t.text ?? '').toBeGreaterThanOrEqual(4.5)
      for (const c of pre.controls) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.right).toBeLessThanOrEqual(width)
        expect(
          c.bottom <= pre.title.y || c.y >= pre.title.bottom || c.right <= pre.title.x || c.x >= pre.title.right
        ).toBe(true)
      }
      expect(
        pre.text
          .filter((t) => t.text?.includes('大阪府大阪市') || t.text?.includes('06-0000') || t.text?.includes('10:00'))
          .every((t) => t.font >= 14)
      ).toBe(true)
    })
  }

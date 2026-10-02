import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { events } from './visual-typography/fixtures'

const phase = process.env.B01_PHASE ?? 'after'
const scratch = resolve(
  '.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b01',
  process.env.B01_ARTIFACT_DIR ?? phase
)
const widths = [320, 375, 430, 768, 1024, 1280, 1440]

const assertRequestedTheme = async (page: Page, theme: string) => {
  const actual = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) throw new Error('Canvas unavailable for theme measurement')
    const rgb = (element: Element) => {
      canvas.fillStyle = getComputedStyle(element).backgroundColor
      canvas.fillRect(0, 0, 1, 1)
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const navigation = document.querySelector('header nav a')
    if (!navigation) throw new Error('Navigation fixture not ready')
    return {
      dark: document.documentElement.classList.contains('dark'),
      pageRGB: rgb(document.body),
      navRGB: rgb(navigation)
    }
  })
  expect(actual).toEqual(
    theme === 'dark'
      ? { dark: true, pageRGB: [9, 9, 11], navRGB: [24, 24, 27] }
      : { dark: false, pageRGB: [252, 231, 243], navRGB: [255, 255, 255] }
  )
  return actual
}

for (const theme of ['light', 'dark']) {
  for (const width of widths) {
    test(`${theme}_${width}_readability`, async ({ page }) => {
      await mkdir(scratch, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await page.clock.setFixedTime(new Date('2026-10-02T03:00:00Z'))
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== 'http://127.0.0.1:15321') return route.abort()
        if (url.pathname === '/api/events') return route.fulfill({ json: events })
        if (url.pathname === '/api/stats') return route.fulfill({ json: { today: 12, total: 345 } })
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/')) return route.abort()
        return route.continue()
      })
      await page.goto(`/e2e/visual-typography/index.html?theme=${theme}`)
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
      await expect(page.locator('[data-section=home] a').first()).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('[data-section=grid] h3')).toHaveCount(4)
      // Motion settles its entrance opacity; CSS transition disabling does not freeze JS motion.
      await expect(page.locator('[data-section=home] a').first().locator('..').locator('..')).toHaveCSS('opacity', '1')
      // Guard rejection is checked for both requested themes and before-mode cannot bypass it.
      await expect(assertRequestedTheme(page, theme === 'dark' ? 'light' : 'dark')).rejects.toThrow()
      const verifiedTheme = await assertRequestedTheme(page, theme)
      await page.screenshot({ path: resolve(scratch, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      const evidence = await page.evaluate(() => {
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            layoutHeight: element.clientHeight,
            layoutBox:
              element instanceof HTMLElement
                ? {
                    x: element.offsetLeft,
                    y: element.offsetTop,
                    width: element.offsetWidth,
                    height: element.offsetHeight,
                    parent: element.offsetParent?.tagName
                  }
                : null,
            font: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            clamp: style.webkitLineClamp,
            color: style.color,
            background: style.backgroundColor
          }
        }
        const home = [...document.querySelectorAll('[data-section=home] a')].filter((a) => a.querySelector('p'))
        const grid = [...document.querySelectorAll('[data-section=grid] a')].filter((a) => a.querySelector('h3'))
        const titles = [...home, ...grid].map((a) => {
          const title = a.querySelector('p,h3') as Element
          const header =
            title.closest('[data-event-heading]') ??
            (a.querySelector('h3') ? a.firstElementChild?.nextElementSibling : title.parentElement?.parentElement)
          const badgeContainer = header?.querySelector('[data-status-badge]') ?? header?.lastElementChild
          const badge = badgeContainer?.querySelector('[data-slot=badge]') ?? badgeContainer
          const prefix = document.createRange()
          const textNode = title.firstChild
          if (!textNode) throw new Error('Missing event title')
          prefix.setStart(textNode, 0)
          prefix.setEnd(textNode, Math.min(20, textNode.textContent?.length ?? 0))
          const prefixRect = prefix.getBoundingClientRect()
          return {
            title: box(title),
            badge: badge ? box(badge) : null,
            sharedOffsetParent:
              title instanceof HTMLElement && badge instanceof HTMLElement && title.offsetParent === badge.offsetParent,
            prefixBottom: prefixRect.bottom,
            text: title.textContent
          }
        })
        const supplements = [
          ...document.querySelectorAll(
            '[data-section=home] .text-muted-foreground span,[data-section=grid] .text-muted-foreground span,[data-section=calendar] p,[data-section=calendar] button span:first-child,[data-section=store] p'
          )
        ]
          .filter((e) => e.textContent?.trim())
          .map(box)
        const links = [...document.querySelectorAll('header nav a,[data-section=home] a,[data-section=store] a')]
          .filter((a) => !a.querySelector('p'))
          .map((a) => {
            let parent: Element | null = a
            let background = ''
            while (parent) {
              background = getComputedStyle(parent).backgroundColor
              if (background !== 'rgba(0, 0, 0, 0)') break
              parent = parent.parentElement
            }
            const canvas = document.createElement('canvas').getContext('2d')
            if (!canvas) throw new Error('Canvas unavailable for computed color measurement')
            const rgb = (color: string) => {
              canvas.fillStyle = color
              canvas.fillRect(0, 0, 1, 1)
              return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3)
            }
            const luminance = (color: number[]) =>
              color
                .map((v) => v / 255)
                .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
            const foreground = getComputedStyle(a).color
            const fg = luminance(rgb(foreground)),
              bg = luminance(rgb(background))
            return {
              text: a.textContent,
              foreground,
              background,
              foregroundRGB: rgb(foreground),
              backgroundRGB: rgb(background),
              contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
            }
          })
        return { titles, supplements, links, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth }
      })
      await writeFile(
        resolve(scratch, `${theme}-${width}.json`),
        JSON.stringify(
          { ...evidence, requestedTheme: theme, verifiedTheme, measuredTheme: await assertRequestedTheme(page, theme) },
          null,
          2
        )
      )
      if (phase === 'before') return
      expect(evidence.scrollWidth).toBeLessThanOrEqual(width)
      for (const item of evidence.supplements) expect(item.font).toBeGreaterThanOrEqual(13)
      for (const link of evidence.links) expect(link.contrast).toBeGreaterThanOrEqual(4.5)
      for (const { title, badge, sharedOffsetParent, prefixBottom } of evidence.titles) {
        expect(title.font).toBe(16)
        expect(title.clamp).toBe('2')
        expect(title.layoutHeight).toBeLessThanOrEqual(title.lineHeight * 2 + 1)
        expect(title.width).toBeGreaterThanOrEqual(180)
        if (width <= 430) expect(prefixBottom).toBeLessThanOrEqual(title.y + title.height + 1)
        if (badge) {
          expect(sharedOffsetParent).toBe(true)
          const titleBox = title.layoutBox
          const badgeBox = badge.layoutBox
          expect(titleBox).not.toBeNull()
          expect(badgeBox).not.toBeNull()
          if (!titleBox || !badgeBox) throw new Error('Missing card layout geometry')
          expect(titleBox.parent).toBe('A')
          expect(badgeBox.parent).toBe(titleBox.parent)
          expect(
            titleBox.y + titleBox.height <= badgeBox.y ||
              badgeBox.y + badgeBox.height <= titleBox.y ||
              titleBox.x + titleBox.width <= badgeBox.x
          ).toBeTruthy()
          if (width <= 430)
            expect(
              title.y + title.height <= badge.y + 1 ||
                badge.y + badge.height <= title.y + 1 ||
                title.x + title.width <= badge.x + 1
            ).toBeTruthy()
        }
      }
    })
  }
}

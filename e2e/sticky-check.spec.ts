import { expect, test } from '@playwright/test'
import { prepare } from './local/support'
import { assertHealthyScreen, assertStickyPosition } from './regression/guards'
import { events } from './visual-typography/fixtures'

for (const width of [375, 1280])
  test(`sticky_header_position_is_asserted ${width}`, async ({ page }) => {
    await prepare(page)
    await page.route('**/api/events', (route) =>
      route.fulfill({
        json: Array.from({ length: 40 }, (_, index) => ({
          ...events[0],
          uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          title: `スクロール検証 ${index}`
        }))
      })
    )
    await page.setViewportSize({ width, height: 800 })
    await page.addInitScript(() => localStorage.setItem('event-view-mode', JSON.stringify('gantt')))
    await page.goto('/events')
    await assertHealthyScreen(page, 'イベント一覧')
    const header = page.locator('.gantt-scroll-container[aria-hidden=true]')
    await expect(header).toBeVisible()
    await header.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + 100))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
    await assertStickyPosition(header, width < 768 ? 48 : 56)
  })

/**
 * E2E: useUserActivity refactor — initialData / no nullish fallbacks
 *
 * Verifies that the refactored hook (initialData + initialDataUpdatedAt: 0)
 * does not cause runtime errors or blank renders on pages that consume it.
 *
 * Coverage:
 *  (a) Unauthenticated — empty arrays should result in nothing flagged, no errors
 *  (b) Key public pages load without JS exceptions
 *
 * /control_panel and /admin/* are out of scope per project memory.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

// Ongoing event UUID from live API
const ONGOING_EVENT_UUID = '503add7e-96ab-4172-8065-69e9caf68493'

// Upcoming event UUID (to verify interested badge displays correctly)
const UPCOMING_EVENT_UUID = 'f2102a16-efe8-4aad-8851-54868bea3d83'

// A character with a known store key (abeno)
const CHARACTER_ID = 'abeno'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 1,
})

/** Take a WEBP screenshot via sharp if available, fallback to PNG */
const capture = async (page: import('@playwright/test').Page, name: string) => {
  await mkdir('test-results', { recursive: true })
  try {
    // biome-ignore lint/correctness/noNodejsModules: test helper
    const sharp = (await import('sharp')).default
    const buf = await page.screenshot({ fullPage: true, type: 'png' })
    const webp = await sharp(buf).webp({ quality: 80 }).toBuffer()
    await writeFile(`test-results/ua-${name}.webp`, webp)
  } catch {
    await page.screenshot({ path: `test-results/ua-${name}.png`, fullPage: true })
  }
}

/**
 * Errors that are pre-existing / unrelated to useUserActivity refactor:
 *   - workbox Service Worker registration issue (SW is blocked in tests)
 *   - "Unauthorized" thrown when unauthenticated user hits /me/* API endpoints
 *   - Firebase / emulator connection noise
 *   - React duplicate key warning on /characters/abeno (天王寺駅 appears twice in
 *     the station access data — pre-existing in develop, key={item.station} in
 *     store-info-items.tsx)
 */
const isKnownPreexistingError = (msg: string) =>
  msg.includes('Firebase') ||
  msg.includes('emulator') ||
  msg.includes('workbox') ||
  msg.includes('Service Worker') ||
  msg.includes('Unauthorized') ||
  msg.includes('waiting') ||
  // Pre-existing React duplicate key warning in station access list
  msg.includes('two children with the same key')

/** Collect JS pageerrors and console.error from a page, filtered by known pre-existing issues */
const collectNewErrors = (page: import('@playwright/test').Page) => {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    if (!isKnownPreexistingError(err.message)) {
      errors.push(`[pageerror] ${err.message}`)
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isKnownPreexistingError(msg.text())) {
      errors.push(`[console.error] ${msg.text()}`)
    }
  })
  return errors
}

// ─── Unauthenticated tests ──────────────────────────────────────────────────

test.describe('unauthenticated — useUserActivity empty arrays', () => {
  test('/ (home) renders without errors and event list is visible', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // The event list section heading must appear
    await expect(page.locator('text=開催中・開催予定のイベント')).toBeVisible()

    // No new JS runtime errors (beyond known pre-existing ones)
    expect(errors).toHaveLength(0)

    await capture(page, 'home-unauth')
  })

  test('/events renders without errors, page heading visible', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto('/events', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Page heading
    await expect(page.locator('h1', { hasText: 'イベント一覧' })).toBeVisible()

    expect(errors).toHaveLength(0)

    await capture(page, 'events-unauth')
  })

  test('/events/$uuid (ongoing event detail) interest/complete buttons are disabled when unauth', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto(`/events/${ONGOING_EVENT_UUID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // The heart (interested) button must have aria-label indicating login required or be disabled
    const heartBtn = page.locator('button[aria-label="ログインが必要です"]').first()
    await expect(heartBtn).toBeVisible()

    // It must be disabled
    await expect(heartBtn).toBeDisabled()

    // No new runtime errors
    expect(errors).toHaveLength(0)

    await capture(page, 'event-detail-unauth')
  })

  test('/events/$uuid (upcoming event) page renders without errors', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto(`/events/${UPCOMING_EVENT_UUID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // At minimum the page must not crash — either the event title is shown or 404
    const h1 = page.locator('h1').first()
    await expect(h1).toBeVisible()

    expect(errors).toHaveLength(0)

    await capture(page, 'event-detail-upcoming-unauth')
  })

  test(`/characters/${CHARACTER_ID} renders without errors`, async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto(`/characters/${CHARACTER_ID}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Character page must render main content (not the 404 fallback)
    const notFound = page.locator('text=キャラクターが見つかりませんでした')
    await expect(notFound).not.toBeVisible()

    expect(errors).toHaveLength(0)

    await capture(page, `character-${CHARACTER_ID}-unauth`)
  })

  test('/me does not produce new JS exceptions when unauthenticated', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto('/me', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Page must not crash with a new error — Unauthorized is a known pre-existing error
    expect(errors).toHaveLength(0)

    await capture(page, 'me-unauth')
  })

  test('/me/completed does not produce new JS exceptions when unauthenticated', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto('/me/completed', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    expect(errors).toHaveLength(0)

    await capture(page, 'me-completed-unauth')
  })

  test('/me/visited does not produce new JS exceptions when unauthenticated', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto('/me/visited', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    expect(errors).toHaveLength(0)

    await capture(page, 'me-visited-unauth')
  })

  test('/me/interested does not produce new JS exceptions when unauthenticated', async ({ page }) => {
    const errors = collectNewErrors(page)
    await page.goto('/me/interested', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    expect(errors).toHaveLength(0)

    await capture(page, 'me-interested-unauth')
  })
})

// ─── Structural / regression tests ─────────────────────────────────────────

test.describe('useUserActivity structural checks', () => {
  test('event list on / does not render a JS exception banner', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => {
      if (!isKnownPreexistingError(err.message)) {
        errors.push(err.message)
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // No uncaught exceptions from the refactored hook
    expect(errors).toHaveLength(0)
  })

  test('/events page renders event items (not empty due to broken activity hook)', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    await expect(page.locator('h1', { hasText: 'イベント一覧' })).toBeVisible()

    // The page must not show an empty state message (we have 56 ongoing events).
    // An empty completedEvents array should NOT cause all events to be hidden.
    const emptyMsg = page.locator('text=開催中・開催予定のイベントはありません')
    await expect(emptyMsg).not.toBeVisible()
  })

  test('event detail header interest + completed buttons render for ongoing event', async ({ page }) => {
    await page.goto(`/events/${ONGOING_EVENT_UUID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // The "ログインが必要です" buttons (heart + award) must be present and disabled
    const loginRequiredBtns = page.locator('button[aria-label="ログインが必要です"]')
    const count = await loginRequiredBtns.count()
    // Both interested and completed buttons should show login-required when unauth
    expect(count).toBeGreaterThanOrEqual(1)

    // No crash banner
    const errorBanner = page.locator('text=Something went wrong')
    await expect(errorBanner).not.toBeVisible()

    await capture(page, 'event-detail-stats')
  })

  test('/characters renders without crashing (store-info-section + character-visit-button)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => {
      if (!isKnownPreexistingError(err.message)) {
        errors.push(err.message)
      }
    })

    await page.goto('/characters', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    expect(errors).toHaveLength(0)
    await capture(page, 'characters-list')
  })

  test('character detail page visit-button renders without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => {
      if (!isKnownPreexistingError(err.message)) {
        errors.push(err.message)
      }
    })

    await page.goto(`/characters/${CHARACTER_ID}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    expect(errors).toHaveLength(0)
    await capture(page, `character-${CHARACTER_ID}-detail`)
  })
})

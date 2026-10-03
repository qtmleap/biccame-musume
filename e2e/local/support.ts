import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { events } from '../visual-typography/fixtures'
export const screens = [
  ['/', '開催中・開催予定のイベント', 'heading'],
  ['/events', 'イベント一覧', 'heading'],
  ['/about', '当ウェブサイトについて', 'heading'],
  ['/ranking', '総選挙', 'heading'],
  ['/characters', 'ビッカメ娘一覧', 'heading'],
  ['/contact', 'お問い合わせ', 'heading'],
  ['/calendar', '2026年10月', 'button'],
  ['/location', 'Google Maps APIキーが設定されていません', 'text'],
  ['/me', '開催中・開催予定のイベント', 'heading'],
  ['/events/00000000-0000-4000-8000-000000000000', events[0].title, 'heading']
] as const
export const fixtureHash = createHash('sha256')
  .update(JSON.stringify(events))
  .update(readFileSync('public/characters.json'))
  .digest('hex')
export async function prepare(page: Page, theme = 'light') {
  await page.clock.setFixedTime(Date.parse('2026-10-02T00:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((dark) => {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', dark)
    Math.random = () => 0.5
  }, theme === 'dark')
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
    if (url.pathname === '/api/events') return route.fulfill({ json: events })
    if (url.pathname === '/api/events/stats') return route.fulfill({ json: {} })
    if (url.pathname.startsWith('/api/events/'))
      return route.fulfill({ json: { ...events[0], referenceUrls: [], comments: [] } })
    if (url.pathname === '/cdn-cgi/access/get-identity')
      return route.fulfill({ status: 401, json: { message: 'No local admin identity' } })
    if (url.pathname === '/api/event-groups') return route.fulfill({ json: [] })
    if (url.pathname === '/api/votes') return route.fulfill({ json: [{ key: 'nagoyagate', count: 42 }] })
    if (url.pathname === '/api/stats') return route.fulfill({ json: { today: 0, total: 0 } })
    if (url.pathname === '/characters.json')
      return route.fulfill({ contentType: 'application/json', body: readFileSync('public/characters.json', 'utf8') })
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { message: 'Unstubbed API blocked by local test' } })
    if (url.pathname.startsWith('/images/characters/'))
      return route.fulfill({ contentType: 'image/webp', body: readFileSync('e2e/character-detail-layout/abeno.webp') })
    return route.continue()
  })
}
export async function paintEvidence(page: Page, theme: string) {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
  })
  const data = await page.evaluate(async () => {
    const faces = ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code']
    await Promise.all(
      faces.flatMap((face) =>
        [400, 500, 700].map((weight) => document.fonts.load(`${weight} 16px "${face}"`, '日本語ABC'))
      )
    )
    await document.fonts.ready
    const fontReady = faces.flatMap((face) =>
      [400, 500, 700].map((weight) => ({
        face,
        weight,
        loaded:
          document.fonts.check(`${weight} 16px "${face}"`, '日本語ABC') &&
          [...document.fonts].some(
            (font) =>
              font.family.replaceAll('"', '') === face && font.weight === String(weight) && font.status === 'loaded'
          )
      }))
    )
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) throw new Error('Missing color measurement canvas')
    canvas.fillStyle = getComputedStyle(document.body).backgroundColor
    canvas.fillRect(0, 0, 1, 1)
    return {
      orderedLinks: [...document.querySelectorAll('main a[href]')].map((el) => el.getAttribute('href')),
      backgroundRGB: [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3),
      dark: document.documentElement.classList.contains('dark'),
      background: getComputedStyle(document.body).backgroundColor,
      fontReady,
      opacities: [...document.querySelectorAll('h1,h2,main a')].map((el) => getComputedStyle(el).opacity)
    }
  })
  expect(data.dark).toBe(theme === 'dark')
  expect(data.backgroundRGB).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
  expect(data.fontReady.every((face) => face.loaded)).toBe(true)
  await expect
    .poll(async () =>
      page.locator('h1,h2').evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '1'))
    )
    .toBe(true)
  return { ...data, fixtureHash, orderedEventIDs: events.map((event) => event.uuid) }
}

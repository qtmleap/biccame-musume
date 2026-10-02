import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expect, test } from '@playwright/test'
import { assertHealthyScreen, assertStickyPosition } from './guards'

test('route_200_with_error_screen_fails', async ({ page }) => {
  await page.route('http://localhost/error', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>イベント一覧</h1><h1>エラーが発生しました</h1>' })
  )
  expect((await page.goto('http://localhost/error'))?.status()).toBe(200)
  await expect(assertHealthyScreen(page, 'イベント一覧')).rejects.toThrow()
})

test('delayed_ready_with_error_screen_fails', async ({ page }) => {
  await page.setContent('<body></body>')
  await page.addScriptTag({
    content: `setTimeout(() => {
      document.body.innerHTML = '<h1>イベント一覧</h1><h1>エラーが発生しました</h1>'
    }, 100)`
  })
  await expect(assertHealthyScreen(page, 'イベント一覧')).rejects.toThrow(/toHaveCount/)
})

test('visual_change_fails_instead_of_overwriting', async ({ page }, info) => {
  await page.setContent('<body style="background:rgb(0,0,255)"><h1>Disposable comparator fixture</h1></body>')
  const baseline = info.snapshotPath('disposable.png')
  await mkdir(dirname(baseline), { recursive: true })
  await writeFile(baseline, await page.screenshot({ animations: 'disabled' }))
  const before = await readFile(baseline)
  await page.evaluate(() => {
    document.body.style.background = 'rgb(255,0,0)'
  })
  await expect(expect(page).toHaveScreenshot('disposable.png', { timeout: 1000 })).rejects.toThrow()
  expect(await readFile(baseline)).toEqual(before)
  await rm(baseline)
  await expect(expect(page).toHaveScreenshot('disposable.png', { timeout: 1000 })).rejects.toThrow()
  await expect(readFile(baseline)).rejects.toThrow()
})

test('sticky_header_position_is_asserted', async ({ page }) => {
  await page.setContent('<div style="height:1200px"><header style="position:sticky;top:0">日程</header></div>')
  await page.evaluate(() => window.scrollTo(0, 400))
  await assertStickyPosition(page.locator('header'), 0)
  await page.locator('header').evaluate((el) => {
    el.style.position = 'static'
  })
  await expect(assertStickyPosition(page.locator('header'), 0)).rejects.toThrow()
})

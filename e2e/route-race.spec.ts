import { expect, type Page, test } from '@playwright/test'

declare global {
  interface Window {
    routeRequests: { aborted: boolean; settled: boolean; resolve: () => void }[]
  }
}

const setup = async (page: Page, abortAware = false) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text())
  })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://localhost:15300' || url.pathname.startsWith('/api/')) return route.abort()
    if (url.pathname === '/route-race-harness')
      return route.fulfill({
        contentType: 'text/html',
        body: `<div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/e2e/route-race-harness.tsx');</script>`
      })
    return route.continue()
  })
  // 通信境界だけを制御。abortを無視する応答も返して世代チェックを検証する。
  await page.addInitScript(
    ({ abortAware }) => {
      const original = window.fetch
      const requests: { aborted: boolean; settled: boolean; resolve: () => void }[] = []
      Object.assign(window, { routeRequests: requests })
      Object.defineProperty(window, 'fetch', {
        value: (input: RequestInfo | URL, init?: RequestInit) => {
          if (input !== '/api/directions') return original(input, init)
          return new Promise<Response>((resolve, reject) => {
            const legs = JSON.parse(String(init?.body)).legs
            const request = {
              aborted: false,
              settled: false,
              resolve: () => {
                request.settled = true
                resolve(
                  new Response(
                    JSON.stringify({
                      status: 'estimated',
                      legs: legs.map((leg: Record<string, string>) => ({
                        ...leg,
                        duration: 23,
                        transfers: 0,
                        routes: [
                          { operator: 'JR', line: '試験線', from: leg.fromStation, to: leg.toStation, duration: 23 }
                        ]
                      }))
                    })
                  )
                )
              }
            }
            init?.signal?.addEventListener('abort', () => {
              request.aborted = true
              if (abortAware) {
                request.settled = true
                reject(new DOMException('Cancelled', 'AbortError'))
              }
            })
            requests.push(request)
          })
        }
      })
    },
    { abortAware }
  )
  await page.goto('/route-race-harness')
  for (const name of ['店舗A', '店舗B']) {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name, exact: true }).click()
  }
  return errors
}
const requests = (page: Page) =>
  page.evaluate(() => window.routeRequests.map(({ aborted, settled }) => ({ aborted, settled })))
const resolveRequest = async (page: Page, index: number) => {
  await page.evaluate((i) => window.routeRequests[i].resolve(), index)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
}
const calculate = async (page: Page, count = 1) => {
  await page.getByRole('button', { name: '訪問順を計算' }).click()
  await expect.poll(async () => (await requests(page)).length).toBe(count)
}

test('clear_during_calculation_keeps_result_empty', async ({ page }) => {
  const errors = await setup(page)
  await calculate(page)
  await page.getByRole('button', { name: '全てクリア' }).click()
  await resolveRequest(page, 0)
  await expect(page.getByRole('heading', { name: 'ルート案内' })).toHaveCount(0)
  expect((await requests(page))[0].aborted).toBe(true)
  expect(errors).toEqual([])
})

test('station_change_discards_previous_response', async ({ page }) => {
  const errors = await setup(page)
  await calculate(page)
  await page.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: '新宿', exact: true }).click()
  await expect(page.getByRole('button', { name: '訪問順を計算' })).toBeEnabled()
  await calculate(page, 2)
  await resolveRequest(page, 0)
  await expect(page.getByRole('heading', { name: 'ルート案内' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '探索中...' })).toBeDisabled()
  await resolveRequest(page, 1)
  await expect(page.getByRole('heading', { name: 'ルート案内' })).toBeVisible()
  await expect(page.getByRole('link', { name: /外部経路検索/ })).toHaveAttribute('href', /origin=%E6%96%B0%E5%AE%BF/)
  expect((await requests(page))[0].aborted).toBe(true)
  expect(errors).toEqual([])
})

test('abort_does_not_show_failure_toast', async ({ page }) => {
  const errors = await setup(page, true)
  await calculate(page)
  await page.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: '新宿', exact: true }).click()
  await expect.poll(async () => (await requests(page))[0].aborted).toBe(true)
  await expect(page.getByRole('button', { name: '訪問順を計算' })).toBeEnabled()
  await expect(page.getByText('所要時間を取得できませんでした')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('unmount_aborts_pending_request', async ({ page }) => {
  const errors = await setup(page, true)
  await calculate(page)
  await page.getByRole('button', { name: 'Unmount page' }).click()
  await expect.poll(async () => (await requests(page))[0].aborted).toBe(true)
  await expect(page.getByRole('heading', { name: 'ルート計算' })).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const action of ['add', 'remove']) {
  test(`${action}_store_discards_previous_response`, async ({ page }) => {
    const errors = await setup(page)
    await calculate(page)
    if (action === 'add') {
      await page.getByRole('combobox').first().click()
      await page.getByRole('option', { name: '店舗C', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '店舗Aをルートから削除', exact: true }).click()
    }
    await resolveRequest(page, 0)
    await expect(page.getByRole('heading', { name: 'ルート案内' })).toHaveCount(0)
    expect((await requests(page))[0].aborted).toBe(true)
    expect(errors).toEqual([])
  })
}

test('older_response_cannot_overwrite_new_result', async ({ page }) => {
  const errors = await setup(page)
  await calculate(page)
  await page.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: '新宿', exact: true }).click()
  await expect(page.getByRole('button', { name: '訪問順を計算' })).toBeEnabled()
  await calculate(page, 2)
  await resolveRequest(page, 1)
  await expect(page.getByRole('heading', { name: 'ルート案内' })).toBeVisible()
  await resolveRequest(page, 0)
  await expect(page.getByRole('link', { name: /外部経路検索/ })).toHaveAttribute('href', /origin=%E6%96%B0%E5%AE%BF/)
  await expect(page.getByRole('button', { name: '訪問順を計算' })).toBeEnabled()
  expect(errors).toEqual([])
})

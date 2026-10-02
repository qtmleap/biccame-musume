import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })
const estimated = {
  status: 'estimated',
  legs: [
    {
      from: '店舗A',
      to: '店舗B',
      fromStation: '東京',
      toStation: '大阪',
      routes: [{ operator: 'JR', line: '東海道', from: '東京', to: '大阪', duration: 150 }],
      duration: 150,
      transfers: 0
    }
  ]
}
for (const mode of ['unavailable', 'http-error', 'invalid', 'estimated']) {
  test(mode === 'unavailable' ? 'failed_route_has_no_zero_minute_label' : `route result: ${mode}`, async ({ page }) => {
    page.on('pageerror', (error) => console.error('HARNESS PAGE ERROR:', error.message))
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== 'http://localhost:15300') return route.abort()
      if (url.pathname === '/api/directions')
        return route.fulfill({
          status: mode === 'http-error' ? 503 : 200,
          json:
            mode === 'estimated'
              ? estimated
              : mode === 'invalid'
                ? { legs: [] }
                : { status: 'unavailable', reason: 'generation_failed' }
        })
      if (url.pathname.startsWith('/api/')) return route.abort()
      if (url.pathname === '/route-result-harness')
        return route.fulfill({
          contentType: 'text/html',
          body: `
        <div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/e2e/route-result-harness.tsx');
        </script>`
        })
      return route.continue()
    })
    await page.goto('/route-result-harness')
    if (mode !== 'estimated') {
      await expect(page.getByText('店舗A', { exact: true })).toBeVisible()
      await expect(page.getByText('0分', { exact: true })).toHaveCount(0)
      await expect(page.getByText('所要時間を取得できませんでした')).toBeVisible()
    }
    await expect(page.getByText('店舗間の直線距離')).toBeVisible()
    await expect(page.getByText('91.1 km')).toBeVisible()
    await expect(page.getByText('直線距離を基準にした訪問順')).toBeVisible()
    await expect(page.getByRole('link', { name: /外部経路検索/ })).toHaveAttribute(
      'href',
      /origin=%E6%9D%B1%E4%BA%AC.*destination=%E5%A4%A7%E9%98%AA/
    )
    if (mode === 'estimated') {
      await expect(page.getByText('AIによる参考経路')).toBeVisible()
      await expect(page.getByText('2時間30分')).toBeVisible()
    } else {
      await expect(page.getByText('所要時間を取得できませんでした')).toBeVisible()
      await expect(page.getByText('0分', { exact: true })).toHaveCount(0)
      await expect(page.getByText(/概算/)).toHaveCount(0)
    }
  })
}

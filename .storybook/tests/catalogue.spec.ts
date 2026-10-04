import { mkdir, writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import coverage from '../catalogue/coverage.json' with { type: 'json' }
import index from '../catalogue/story-index.json' with { type: 'json' }

const entries = Object.values(index.entries).filter((entry) => entry.type === 'story')
const expectedErrors = new Set([
  'pages-production--eventserror',
  'components-common-error-fallback--error-fallback',
  'components-common-error-boundary--caught-error'
])
const routeMarkers: Record<string, string> = {
  home: 'ビッカメ娘を',
  rootlayout: 'ビッカメ娘を',
  ranking: '総選挙',
  contact: 'お問い合わせ',
  calendar: '2026',
  route: 'ルート計算',
  admin: '管理画面',
  admincomments: 'コメント管理',
  admintwitter: 'Storybook合成アカウント',
  adminusers: 'ユーザー管理',
  'adminevent-groups': 'イベントグループ管理',
  'adminevent-groupsuuidedit': 'イベントグループの編集',
  'adminevent-groupsnew': 'イベントグループの新規作成',
  adminevents: 'イベント管理',
  admineventsuuid: 'イベント編集',
  admineventsuuidedit: 'イベント編集',
  admineventsnew: '新規イベント登録',
  adminbadges: 'バッジ管理',
  adminbadgesranking: 'バッジ所持数ランキング',
  about: '当ウェブサイトについて',
  mecompleted: '達成したイベント',
  me: 'マイページ',
  mevisited: '訪れた店舗',
  mefavorites: '推しのビッカメ娘',
  meinterested: '気になるイベント',
  events: 'イベント一覧',
  eventsgroupid: '秋のお誕生日イベント',
  eventsuuid: 'ビッカメ娘のお誕生日と店舗周年を記念した限定名刺プレゼント',
  eventsgroups: 'イベントグループ一覧',
  characters: 'ビッカメ娘一覧',
  charactersid: 'あべのたん',
  badges: 'バッジコレクション',
  'admin-layout': '管理画面',
  eventsempty: 'イベント一覧',
  adminsignedout: '認証が必要です'
}
const open = async (page: Page, id: string, theme: string) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === 'http://127.0.0.1:16006' ? route.continue() : route.abort()
  })
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`)
  await expect(page.getByTestId('review-frame')).toBeVisible()
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  await page.evaluate(async () => {
    for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'])
      for (const weight of [400, 500, 700]) await document.fonts.load(`${weight} 16px "${family}"`, '店舗検索ABC')
    await document.fonts.ready
  })
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/)
}
test('built Storybook index contains every route/component coverage reference', async ({ request }) => {
  const current = (await (await request.get('/index.json')).json()) as typeof index
  const ids = new Set(
    Object.values(current.entries)
      .filter((entry) => entry.type === 'story')
      .map((entry) => entry.id)
  )
  expect([...ids].sort()).toEqual(entries.map((entry) => entry.id).sort())
  for (const entry of coverage.entries)
    for (const id of entry.storyIds) expect(ids.has(id), `${entry.file}#${entry.name}`).toBe(true)
})
for (const theme of ['light', 'dark'])
  for (const entry of entries)
    test(`${theme} ${entry.id}`, async ({ page }) => {
      const errors: string[] = []
      const external: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.origin !== 'http://127.0.0.1:16006') external.push(url.href)
        if (url.pathname.startsWith('/api/')) external.push(url.href)
      })
      const width = entry.id.endsWith('--calendar-month-dots')
        ? 375
        : entry.id.endsWith('--calendar-month-tabs')
          ? 1024
          : theme === 'light'
            ? 1280
            : 375
      await page.setViewportSize({ width, height: 900 })
      await open(page, entry.id, theme)
      await expect(page.locator('.sb-errordisplay')).not.toBeVisible()
      await expect(page.getByText('Something went wrong!', { exact: true })).not.toBeVisible()
      const expectedError = expectedErrors.has(entry.id)
      if (expectedError) await expect(page.getByRole('heading', { name: 'エラーが発生しました' })).toBeVisible()
      else await expect(page.getByRole('heading', { name: 'エラーが発生しました' })).not.toBeVisible()
      // Real rendered content or visible dialogs/widgets, rather than a nonempty frame containing only markup.
      await expect
        .poll(async () =>
          page.evaluate(() =>
            [...document.querySelectorAll('[data-testid=review-frame], [role=dialog], [data-sonner-toast]')].some(
              (e) => {
                const r = e.getBoundingClientRect()
                return (
                  r.width > 0 &&
                  r.height > 0 &&
                  ((e.textContent?.trim().length ?? 0) > 0 ||
                    e.querySelector('input,button,svg,img,[role=status],[data-slot=skeleton]'))
                )
              }
            )
          )
        )
        .toBeTruthy()
      if (
        entry.id.startsWith('pages-production--') &&
        !expectedError &&
        entry.id !== 'pages-production--eventsloading'
      ) {
        const pageRoot = page.getByTestId('production-page')
        await expect(pageRoot.locator('main')).toBeVisible()
        await expect.poll(async () => pageRoot.locator('main').innerText()).not.toBe('')
        await expect(pageRoot.locator('main')).not.toContainText('予期しないエラー')
        const routeName = entry.id.replace('pages-production--', '')
        if (routeName === 'location') await expect(pageRoot.getByTestId('maps-adapter')).toBeVisible()
        else {
          expect(routeMarkers[routeName], `missing route-specific marker: ${routeName}`).toBeDefined()
          await expect(pageRoot.locator('main')).toContainText(routeMarkers[routeName])
        }
      }
      if (entry.id.startsWith('components-')) {
        const componentRoot = page.getByTestId('production-component')
        await expect(componentRoot).toBeAttached()
        await expect
          .poll(
            async () =>
              page.evaluate(() => {
                const e = document.querySelector('[data-testid=production-component]') as Element
                const candidates = [
                  e,
                  ...e.querySelectorAll('*'),
                  ...document.querySelectorAll(
                    '[role=dialog], [role=dialog] *, [data-sonner-toast], [data-sonner-toast] *'
                  )
                ]
                return candidates.some((node) => {
                  const style = getComputedStyle(node)
                  const r = node.getBoundingClientRect()
                  return (
                    r.width > 0 &&
                    r.height > 0 &&
                    style.visibility !== 'hidden' &&
                    Number(style.opacity) > 0 &&
                    (node.matches('svg,input,button,[data-slot=skeleton]') ||
                      (node.childElementCount === 0 && Boolean(node.textContent?.trim())))
                  )
                })
              }),
            { message: `actual production export is empty: ${entry.id}` }
          )
          .toBeTruthy()
        if (!expectedError) await expect(page.getByRole('heading', { name: 'エラーが発生しました' })).not.toBeVisible()
      }
      if (entry.id.endsWith('--update-prompt')) {
        await page.getByRole('button', { name: '更新通知を表示' }).click()
        await expect(page.getByText('新しいバージョンが利用可能です', { exact: true })).toBeVisible()
      }
      if (entry.id.endsWith('--ios-install-prompt'))
        await expect(page.getByRole('dialog', { name: 'ホーム画面に追加' })).toBeVisible()
      if (entry.id.endsWith('--auth-provider') || entry.id.endsWith('--backend-session-gate'))
        await expect(page.getByRole('button', { name: 'お気に入り解除', exact: true })).toBeVisible()
      if (entry.id.endsWith('--event-form'))
        await expect(page.getByLabel('イベント名', { exact: true })).toHaveValue(
          'ビッカメ娘のお誕生日と店舗周年を記念した限定名刺プレゼント'
        )
      if (entry.id.endsWith('--event-group-form'))
        await expect(page.locator('#group-title')).toHaveValue('秋のお誕生日イベント')
      if (entry.id.endsWith('--event-flags-section')) await expect(page.getByRole('checkbox')).toHaveCount(3)
      if (entry.id.endsWith('--gantt-row') || entry.id.endsWith('--gantt-timeline'))
        await expect(page.getByTestId('production-component')).toContainText(
          'ビッカメ娘のお誕生日と店舗周年を記念した限定名刺プレゼント'
        )
      if (entry.id.endsWith('--character-competition-level'))
        await expect(page.getByRole('heading', { name: '激戦区レベル' })).toBeVisible()
      if (entry.id.startsWith('ui-')) await expect(page.getByTestId('ui-family')).toBeVisible()
      const state = await page.evaluate(() => {
        const fixture = Reflect.get(window, '__storybookFixture')
        const frame = document.querySelector('[data-testid=review-frame]') as Element
        return {
          calls: fixture?.calls,
          unexpected: fixture?.unexpected,
          htmlTheme: document.documentElement.className,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          frameBackground: getComputedStyle(frame).backgroundColor,
          frameForeground: getComputedStyle(frame).color,
          font: getComputedStyle(frame).fontFamily,
          fontWeight: getComputedStyle(frame).fontWeight,
          fontProof: ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'].flatMap((family) =>
            [400, 500, 700].map((weight) => ({
              family,
              weight,
              registered: [...document.fonts].some(
                (face) => face.family.replaceAll(/['"]/g, '') === family && face.weight === String(weight)
              ),
              loaded: [...document.fonts].some(
                (face) =>
                  face.family.replaceAll(/['"]/g, '') === family &&
                  face.weight === String(weight) &&
                  face.status === 'loaded'
              ),
              checked: document.fonts.check(`${weight} 16px "${family}"`, '店舗検索ABC')
            }))
          )
        }
      })
      expect(state.unexpected).toEqual([])
      expect(state.font).toContain('Zen Maru Gothic')
      for (const face of state.fontProof) {
        expect(face.registered, `${face.family}/${face.weight} registered`).toBe(true)
        expect(face.loaded, `${face.family}/${face.weight} loaded`).toBe(true)
        expect(face.checked).toBe(true)
      }
      expect(errors).toEqual([])
      expect(external).toEqual([])
      await mkdir('.storybook/.artifacts/smoke', { recursive: true })
      await writeFile(
        `.storybook/.artifacts/smoke/${theme}-${entry.id}.json`,
        JSON.stringify({ id: entry.id, theme, width, ...state, errors, external }, null, 2)
      )
    })

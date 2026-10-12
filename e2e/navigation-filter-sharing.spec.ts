import { type Browser, expect, type Page, test } from '@playwright/test'

const events = Array.from({ length: 60 }, (_, i) => ({
  uuid: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
  category: i < 13 ? 'ackey' : 'other',
  title: `共有イベント${i + 1}`,
  stores: ['sapporo'],
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2099-12-31T00:00:00.000Z',
  isVerified: true,
  isPreliminary: false,
  conditions: [],
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}))
const characters = [
  {
    id: 'sapporo',
    prefecture: '北海道',
    character: {
      name: '札幌娘',
      description: 'テスト用の娘',
      images: ['fixture.png'],
      is_biccame_musume: true
    },
    store: { name: '札幌店', access: [] }
  }
]
const urlValue = (page: Page, key: string) => new URL(page.url()).searchParams.get(key)
// クエリ文字列そのもの(`?store=chofu` など。無ければ空文字)。キー単位の確認では、足された余計なパラメータを見逃す。
const urlSearch = (page: Page) => new URL(page.url()).search
const category = (page: Page, label: string) => page.getByRole('checkbox', { name: label, exact: true })

// 条件部品は全画面幅でダイアログ内だけに表示する。
const openEventFilters = async (page: Page) => {
  if (!new URL(page.url()).pathname.startsWith('/events')) return
  if (await page.locator('[data-slot="dialog-content"]').count()) return
  await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'フィルター', exact: true })).toBeVisible()
}
const closeEventFilters = async (page: Page) => {
  if (!(await page.locator('[data-slot="dialog-content"]').count())) return
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0)
}

// 開いただけでは URL を書き換えないことの確認用。URL を別の値へ変える pushState / replaceState の呼び出しを記録する。
// 読み込みのたびに(ページ自身のスクリプトより先に)入れ直されるので、記録は今開いているドキュメント分になる。
// `/events/` → `/events` のような末尾スラッシュだけの違いは、ルーター自身の既定の正規化でクエリではないので数えない。
const trackUrlWrites = (page: Page) =>
  page.addInitScript(() => {
    const writes: string[] = []
    Reflect.set(window, '__urlWrites', writes)
    const canonical = (href: string) => {
      const url = new URL(href, location.href)
      return url.pathname.replace(/\/+$/, '') + url.search + url.hash
    }
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history)
      history[method] = (data, unused, url) => {
        if (url !== undefined && url !== null && canonical(String(url)) !== canonical(location.href))
          writes.push(`${method} ${String(url)}`)
        original(data, unused, url)
      }
    }
  })
const urlWrites = (page: Page): Promise<string[]> => page.evaluate(() => Reflect.get(window, '__urlWrites'))
// 画面が出たあとで、URL がクエリごと開いたときのままで、一度も書き換えられていないことを確かめる。
const expectUrlUntouched = async (page: Page, search: string) => {
  expect(urlSearch(page)).toBe(search)
  expect(await urlWrites(page)).toEqual([])
}

const installFixtures = async (page: Page) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15314') return route.abort()
    if (url.pathname === '/api/events') return route.fulfill({ json: events })
    if (url.pathname === '/api/me/activities')
      return route.fulfill({ json: { stores: [], events: { interested: [events[0].uuid], completed: [] } } })
    if (url.pathname === '/characters.json') return route.fulfill({ json: characters })
    if (url.pathname === '/api/event-groups') return route.fulfill({ json: [] })
    if (url.pathname === '/api/stats') return route.fulfill({ json: { today: 1, total: 1 } })
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/characters/')) return route.abort()
    return route.continue()
  })
}

// 保存値(event-list-filters)の例。既定とは全項目が異なる。
const savedFilters = {
  category: 'ackey',
  status: 'upcoming,ongoing,ended',
  region: 'hokkaido',
  store: 'sapporo',
  hideInterested: true,
  hideCompleted: false,
  hideOldEvents: false
}
// ページの確認用。興味ありを隠さず、アクキー 13 件が 2 ページ目に 1 件だけ残る。
const pagedSavedFilters = { ...savedFilters, hideInterested: false }
const readSaved = (page: Page) => page.evaluate(() => localStorage.getItem('event-list-filters'))

// beforeEach の init script は読み込みのたびに localStorage を空にするので、保存を確かめるテストは専用の context で行う。
const withPersistentContext = async (browser: Browser, run: (page: Page) => Promise<void>) => {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })
  try {
    const persisted = await context.newPage()
    await persisted.clock.setFixedTime(new Date('2026-10-03T03:00:00Z'))
    await persisted.addInitScript(() => {
      if (localStorage.getItem('event-view-mode') === null)
        localStorage.setItem('event-view-mode', JSON.stringify('grid'))
    })
    await installFixtures(persisted)
    await run(persisted)
  } finally {
    await context.close()
  }
}
const goToCharactersAndBack = async (page: Page) => {
  await closeEventFilters(page)
  await page.getByRole('link', { name: '娘一覧へ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ビッカメ娘一覧', exact: true })).toBeVisible()
  await closeEventFilters(page)
  await page.getByRole('link', { name: 'イベント一覧へ', exact: true }).click()
}
const chooseStore = async (page: Page) => {
  await closeEventFilters(page)
  await page.getByTestId('event-store-toolbar').getByRole('combobox').click()
  await page.getByRole('option', { name: '札幌店', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-03T03:00:00Z'))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('event-view-mode', JSON.stringify('grid'))
  })
  await installFixtures(page)
})

test('shared_url_reproduces_filters', async ({ page, browser }) => {
  // 初回のモジュール変換と、別コンテキストでの共有 URL 確認に必要な時間を確保する。
  test.setTimeout(30000)
  await trackUrlWrites(page)
  await page.addInitScript(() => {
    localStorage.setItem('biccame-region-filter', JSON.stringify('kyushu'))
    localStorage.setItem('event-list-status-filter', JSON.stringify({ upcoming: false, ongoing: false, ended: true }))
    localStorage.setItem('event-page', JSON.stringify(5))
    localStorage.setItem(
      'event-list-filters',
      JSON.stringify({ category: 'other', region: 'kanto', hideCompleted: true, hideOldEvents: false })
    )
  })
  await page.goto(
    '/events/?category=ackey&status=ongoing&region=hokkaido&store=sapporo&page=2&campaign=test&hideInterested=false'
  )
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, 'アクキー')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, 'その他')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '開催中')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '終了')).not.toBeChecked()
  // URL に絞り込みが 1 つでもあれば保存値は一切使わない。URL に無い hideCompleted は保存値(true)ではなく既定(false)になる。
  await openEventFilters(page)
  await expect(category(page, '興味あり')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '達成済み')).not.toBeChecked()
  // 共有された URL は、読み込んだだけでは(足されも正されもせず)そのまま残る。
  await expectUrlUntouched(
    page,
    '?category=ackey&status=ongoing&region=hokkaido&store=sapporo&page=2&campaign=test&hideInterested=false'
  )
  const sharedUrl = page.url()
  const otherContext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })
  try {
    const otherPage = await otherContext.newPage()
    await otherPage.addInitScript(() => {
      localStorage.setItem('event-view-mode', JSON.stringify('grid'))
      localStorage.setItem('biccame-region-filter', JSON.stringify('all'))
      localStorage.setItem('event-page', JSON.stringify(1))
      localStorage.setItem('event-list-status-filter', JSON.stringify({ upcoming: true, ongoing: true, ended: false }))
    })
    await installFixtures(otherPage)
    await otherPage.goto(sharedUrl)
    await expect(otherPage.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
    await openEventFilters(otherPage)
    await expect(otherPage.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
    await openEventFilters(otherPage)
    await expect(category(otherPage, 'その他')).not.toBeChecked()
    await openEventFilters(otherPage)
    await expect(category(otherPage, '興味あり')).not.toBeChecked()
    await openEventFilters(otherPage)
    await expect(category(otherPage, '達成済み')).not.toBeChecked()
  } finally {
    await otherContext.close()
  }
  await page.reload()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await openEventFilters(page)
  await page.getByRole('radio', { name: '全国', exact: true }).click()
  await expect(page.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
  expect(page.url()).toBe(sharedUrl)
  expect(await urlWrites(page)).toEqual([])
})

test('character_region_does_not_change_events', async ({ page }) => {
  await page.goto('/characters/')
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await openEventFilters(page)
  await page.getByRole('radio', { name: '関東', exact: true }).click()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await closeEventFilters(page)
  await page.getByRole('link', { name: 'イベント一覧へ', exact: true }).click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await openEventFilters(page)
  await page.getByRole('radio', { name: '北海道', exact: true }).click()
  expect(urlSearch(page)).toBe('')
  await expect.poll(() => readSaved(page)).toContain('"region":"hokkaido"')
  await closeEventFilters(page)
  await page.getByRole('link', { name: '娘一覧へ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ビッカメ娘一覧', exact: true })).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
})

test('url_less_ignores_old_keys_and_leaves_url_untouched', async ({ page }) => {
  await trackUrlWrites(page)
  await page.addInitScript(() => {
    localStorage.setItem('biccame-region-filter', JSON.stringify('kyushu'))
    localStorage.setItem('event-page', JSON.stringify(5))
    localStorage.setItem('event-list-status-filter', JSON.stringify({ upcoming: false, ongoing: false, ended: true }))
    localStorage.setItem('event-user-activity-filter', JSON.stringify({ hideInterested: true, hideCompleted: true }))
  })
  await page.goto('/events/')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '開催中')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '終了')).not.toBeChecked()
  // 旧い非表示設定のキーも読まない(引き継がない)。
  await openEventFilters(page)
  await expect(category(page, '興味あり')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '達成済み')).not.toBeChecked()
  // パラメータ無しで開いても、使った値(ここでは既定)を URL に書き込まない。
  await expectUrlUntouched(page, '')
})

test('url_less_uses_saved_filters_as_a_whole_and_leaves_url_untouched', async ({ page }) => {
  await trackUrlWrites(page)
  await page.addInitScript((saved) => localStorage.setItem('event-list-filters', JSON.stringify(saved)), savedFilters)
  await page.goto('/events/')
  await expect(page.getByText('全 12 件中 1–12 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, 'その他')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '終了')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '興味あり')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '達成済み')).not.toBeChecked()
  // 保存値は画面にだけ効かせ、URL には書き込まない。
  await expectUrlUntouched(page, '')
})

test('legacy_activity_key_does_not_mix_into_saved_filters', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('event-user-activity-filter', JSON.stringify({ hideInterested: true, hideCompleted: true }))
    localStorage.setItem('event-list-filters', JSON.stringify({ region: 'kanto' }))
  })
  await page.goto('/events/')
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '興味あり')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '達成済み')).not.toBeChecked()
})

test('page_only_and_tracking_only_urls_use_saved_filters_and_stay_as_opened', async ({ page }) => {
  await trackUrlWrites(page)
  await page.addInitScript(
    (saved) => localStorage.setItem('event-list-filters', JSON.stringify(saved)),
    pagedSavedFilters
  )
  await page.goto('/events/?page=2')
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
  await expectUrlUntouched(page, '?page=2')
  await page.goto('/events/?campaign=test')
  await expect(page.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
  // 知らないパラメータはそのまま残り、保存値も page も足されない。
  await expectUrlUntouched(page, '?campaign=test')
})

test('store_only_url_stays_as_opened', async ({ page }) => {
  await trackUrlWrites(page)
  await page.goto('/events/?store=chofu')
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await expectUrlUntouched(page, '?store=chofu')
  await page.goto('/events/?store=sapporo')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  // page も、ほかの絞り込みの既定値も足されない。
  await expectUrlUntouched(page, '?store=sapporo')
})

test('invalid_only_url_is_an_explicit_url_and_does_not_fall_back_to_saved_filters', async ({ page }) => {
  await page.addInitScript((saved) => localStorage.setItem('event-list-filters', JSON.stringify(saved)), savedFilters)
  await page.goto('/events/?category=garbage')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, 'その他')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '終了')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '興味あり')).not.toBeChecked()
})

test('partial_url_fills_missing_items_with_defaults_not_saved_values', async ({ page }) => {
  await page.addInitScript((saved) => localStorage.setItem('event-list-filters', JSON.stringify(saved)), savedFilters)
  await page.goto('/events/?region=kanto')
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, 'その他')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '終了')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '興味あり')).not.toBeChecked()
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
})

for (const malformed of ['-2', '1.5', 'junk', '0', '9007199254740992', 'true'])
  test(`invalid_search_uses_safe_defaults_without_rewriting_url_${malformed}`, async ({ page }) => {
    await trackUrlWrites(page)
    await page.goto(`/events/?page=${malformed}&category=invalid&status=invalid&region=invalid&store=invalid`)
    await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(page)
    await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
    await openEventFilters(page)
    await expect(category(page, '開催中')).toBeChecked()
    // 不正な値は読むときだけ既定として扱い、URL には既定値を書き戻さない。
    expect(await urlWrites(page)).toEqual([])
    expect(urlValue(page, 'page')).toBe(malformed)
    for (const key of ['category', 'status', 'region', 'store']) expect(urlValue(page, key)).toBe('invalid')
  })

test('explicit_store_and_region_are_independent_and_legacy_store_works', async ({ page }) => {
  await page.goto('/events/?store=sapporo&region=kanto')
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
  await page.goto('/events/?store=sapporo')
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
})

test('local_page_reset_refetch_clamp_and_browser_navigation_never_rewrite_entry_url', async ({ page }) => {
  test.setTimeout(30000)
  await page.goto('/events/?page=5&region=all')
  await expect(page.getByText('全 60 件中 49–60 件を表示')).toBeVisible()
  const first = page.url()
  await openEventFilters(page)
  await category(page, 'その他').click()
  await expect(page.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
  expect(page.url()).toBe(first)
  await page.goto('/events/?category=other&region=all&page=2')
  await expect(page.getByText('全 47 件中 13–24 件を表示')).toBeVisible()
  const second = page.url()
  await page.goBack()
  await expect(page.getByText('全 60 件中 49–60 件を表示')).toBeVisible()
  expect(page.url()).toBe(first)
  await page.goForward()
  await expect(page.getByText('全 47 件中 13–24 件を表示')).toBeVisible()
  expect(page.url()).toBe(second)
  await page.goBack()
  await expect(page.getByText('全 60 件中 49–60 件を表示')).toBeVisible()
  await page.route('**/api/events', (route) => route.fulfill({ json: events.slice(0, 13) }))
  await page.getByRole('button', { name: '一覧再取得' }).click()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  expect(page.url()).toBe(first)
  await page.reload()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  expect(page.url()).toBe(first)
})

test('empty_category_and_status_round_trip_in_url', async ({ page }) => {
  await page.goto('/events/?category=&status=')
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
  await openEventFilters(page)
  await expect(category(page, 'アクキー')).not.toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '開催中')).not.toBeChecked()
  await page.reload()
  await openEventFilters(page)
  await expect(category(page, 'アクキー')).not.toBeChecked()
  await closeEventFilters(page)
  await page.getByRole('button', { name: '条件を解除', exact: true }).click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  expect(urlSearch(page)).toBe('?category=&status=')
  await page.reload()
  await openEventFilters(page)
  await expect(category(page, 'アクキー')).not.toBeChecked()
})

test('activity_url_flags_use_explicit_boolean_values', async ({ page }) => {
  await page.goto('/events/?hideInterested=true&hideCompleted=false')
  await expect(page.getByText('全 59 件中 1–12 件を表示')).toBeVisible()
  await openEventFilters(page)
  await expect(category(page, '興味あり')).toBeChecked()
  await openEventFilters(page)
  await expect(category(page, '達成済み')).not.toBeChecked()
  await openEventFilters(page)
  await category(page, '興味あり').click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  expect(urlValue(page, 'hideInterested')).toBe('true')
  await expect.poll(() => readSaved(page)).toContain('"hideInterested":false')
  await page.reload()
  await openEventFilters(page)
  await expect(category(page, '興味あり')).toBeChecked()
  await page.goto('/events/?hideInterested=garbage&hideCompleted=1')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
})

test('activity_filter_persists_across_navigation_reload_and_reset', async ({ browser }) => {
  await withPersistentContext(browser, async (persisted) => {
    await persisted.goto('/events/')
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await category(persisted, '興味あり').click()
    await expect(persisted.getByText('全 59 件中 1–12 件を表示')).toBeVisible()
    expect(urlSearch(persisted)).toBe('')
    await expect.poll(() => readSaved(persisted)).toContain('"hideInterested":true')
    // 別ページから戻ると URL の条件は消えるが、保存値で復元する。復元しただけでは URL に書き込まない。
    await goToCharactersAndBack(persisted)
    await expect(persisted.getByText('全 59 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(category(persisted, '興味あり')).toBeChecked()
    expect(urlSearch(persisted)).toBe('')
    // リロード(URL なしの再訪)でも保存値が効く。
    await persisted.goto('/events/')
    await expect(persisted.getByText('全 59 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(category(persisted, '興味あり')).toBeChecked()
    await openEventFilters(persisted)
    await expect(category(persisted, '達成済み')).not.toBeChecked()
    expect(urlSearch(persisted)).toBe('')
    // 「クリア」は保存値も既定に戻す。
    await openEventFilters(persisted)
    await persisted.getByRole('button', { name: 'クリア', exact: true }).filter({ visible: true }).click()
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await persisted.goto('/events/')
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(category(persisted, '興味あり')).not.toBeChecked()
  })
})

test('filters_persist_across_header_links_and_reload', async ({ browser }) => {
  await withPersistentContext(browser, async (persisted) => {
    await persisted.goto('/events/')
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await category(persisted, 'その他').click()
    await openEventFilters(persisted)
    await category(persisted, '終了').click()
    await openEventFilters(persisted)
    await persisted.getByRole('radio', { name: '北海道', exact: true }).click()
    await chooseStore(persisted)
    await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
    await expect.poll(() => readSaved(persisted)).toContain('"store":"sapporo"')
    expect(urlSearch(persisted)).toBe('')
    const expectRestored = async () => {
      await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
      await openEventFilters(persisted)
      await expect(category(persisted, 'アクキー')).toBeChecked()
      await openEventFilters(persisted)
      await expect(category(persisted, 'その他')).not.toBeChecked()
      await openEventFilters(persisted)
      await expect(category(persisted, '終了')).toBeChecked()
      await openEventFilters(persisted)
      await expect(persisted.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
      await closeEventFilters(persisted)
      await expect(persisted.getByTestId('event-store-toolbar').getByRole('combobox')).toContainText('札幌店')
      // 保存値で復元しただけでは URL に書き込まない。
      expect(urlSearch(persisted)).toBe('')
    }
    await goToCharactersAndBack(persisted)
    await expectRestored()
    await persisted.reload()
    await expectRestored()
    await persisted.goto('/events/')
    await expectRestored()
    expect(JSON.parse(String(await readSaved(persisted)))).toMatchObject({
      category: 'limited_card,regular_card,ackey,acsta',
      status: 'upcoming,ongoing,ended',
      region: 'hokkaido',
      store: 'sapporo'
    })
    // ページは保存しない。
    expect(await readSaved(persisted)).not.toContain('page')
  })
})

test('clear_filters_resets_saved_filters_and_stays_default_after_navigation', async ({ browser }) => {
  await withPersistentContext(browser, async (persisted) => {
    await persisted.goto('/events/')
    await openEventFilters(persisted)
    await category(persisted, 'その他').click()
    await openEventFilters(persisted)
    await persisted.getByRole('radio', { name: '北海道', exact: true }).click()
    await chooseStore(persisted)
    await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await persisted.getByRole('button', { name: 'クリア', exact: true }).filter({ visible: true }).click()
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(persisted.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
    expect(JSON.parse(String(await readSaved(persisted)))).toMatchObject({
      category: 'limited_card,regular_card,ackey,acsta,other',
      status: 'upcoming,ongoing',
      region: 'all',
      hideOldEvents: true
    })
    await goToCharactersAndBack(persisted)
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(category(persisted, 'その他')).toBeChecked()
    await openEventFilters(persisted)
    await expect(persisted.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
    await persisted.goto('/events/')
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(persisted.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  })
})

test('explicit_url_beats_saved_filters_without_overwriting_them', async ({ browser }) => {
  await withPersistentContext(browser, async (persisted) => {
    await persisted.goto('/events/')
    await openEventFilters(persisted)
    await category(persisted, 'その他').click()
    await openEventFilters(persisted)
    await persisted.getByRole('radio', { name: '北海道', exact: true }).click()
    await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
    // 共有 URL(種別だけ明示)を開くと、保存済みの地域ではなく既定(全国)で URL の種別だけが効く。
    await persisted.goto('/events/?category=other')
    await expect(persisted.getByText('全 47 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(category(persisted, 'アクキー')).not.toBeChecked()
    await openEventFilters(persisted)
    await expect(persisted.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
    // URL の値は保存値を書き換えない。パラメータ無しで開き直すと保存値が戻る。
    await persisted.goto('/events/')
    await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
    await openEventFilters(persisted)
    await expect(persisted.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
  })
})

test('anonymous_visit_waits_for_login_before_applying_saved_hide_flags_and_never_writes_url', async ({ browser }) => {
  await withPersistentContext(browser, async (persisted) => {
    await persisted.addInitScript((saved) => {
      if (localStorage.getItem('event-list-filters') === null)
        localStorage.setItem('event-list-filters', JSON.stringify(saved))
    }, savedFilters)
    await persisted.goto('/events/?anon=1')
    // 未ログインでも、非表示設定以外の保存値は効く。非表示設定は出さない。URL には書き込まない。
    await openEventFilters(persisted)
    await expect(persisted.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
    await openEventFilters(persisted)
    await expect(category(persisted, 'その他')).not.toBeChecked()
    await openEventFilters(persisted)
    await expect(category(persisted, '興味あり')).toHaveCount(0)
    expect(urlSearch(persisted)).toBe('?anon=1')
    // ログインが確定すると保存値の非表示設定が効く。それでも URL は開いたときのまま。
    await closeEventFilters(persisted)
    await persisted.getByRole('button', { name: 'ログイン(テスト)', exact: true }).click()
    await openEventFilters(persisted)
    await expect(category(persisted, '興味あり')).toBeChecked()
    await expect(persisted.getByText('全 12 件中 1–12 件を表示')).toBeVisible()
    expect(urlSearch(persisted)).toBe('?anon=1')
  })
})

test('page_is_not_saved_and_resets_when_returning', async ({ browser }) => {
  await withPersistentContext(browser, async (persisted) => {
    await persisted.goto('/events/?page=3')
    await expect(persisted.getByText('全 60 件中 25–36 件を表示')).toBeVisible()
    await goToCharactersAndBack(persisted)
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    // ページを変えただけでは何も保存しない(URL から開いただけで保存値を書き換えない)。
    expect(await readSaved(persisted)).toBeNull()
  })
})

test('ui_edits_override_stale_url_locally_and_never_write_filters_or_page', async ({ browser }) => {
  test.setTimeout(30000)
  await withPersistentContext(browser, async (persisted) => {
    await trackUrlWrites(persisted)
    await persisted.goto('/events/?category=other&status=ongoing&region=all&page=2&tracking=fixture')
    await expect(persisted.getByText('全 47 件中 13–24 件を表示')).toBeVisible()
    const incoming = persisted.url()
    await openEventFilters(persisted)
    await category(persisted, 'その他').click()
    await expect(persisted.getByText('条件に一致するイベントはありません')).toBeVisible()
    expect(persisted.url()).toBe(incoming)
    await persisted.getByRole('button', { name: 'クリア', exact: true }).click()
    await expect(persisted.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    expect(persisted.url()).toBe(incoming)
    await persisted.getByRole('button', { name: '適用', exact: true }).click()
    expect(persisted.url()).toBe(incoming)
    await chooseStore(persisted)
    expect(persisted.url()).toBe(incoming)
    await openEventFilters(persisted)
    await category(persisted, 'その他').click()
    await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
    await persisted.getByRole('button', { name: '適用', exact: true }).click()
    expect(persisted.url()).toBe(incoming)
    await persisted.getByRole('link', { name: '2', exact: true }).click()
    await expect(persisted.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
    expect(persisted.url()).toBe(incoming)
    expect(await urlWrites(persisted)).toEqual([])
    await expect.poll(() => readSaved(persisted)).toContain('"store":"sapporo"')
    await persisted.reload()
    await expect(persisted.getByText('全 47 件中 13–24 件を表示')).toBeVisible()
    expect(persisted.url()).toBe(incoming)
    await persisted.goto('/events/?tracking=fixture')
    await expect(persisted.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
    await expectUrlUntouched(persisted, '?tracking=fixture')
  })
})

test('controlled_event_region_retains_keyboard_selection_and_url', async ({ page }) => {
  await page.goto('/events/')
  await openEventFilters(page)
  await page.getByRole('radio', { name: '北海道', exact: true }).click()
  await page.keyboard.down('ArrowRight')
  await openEventFilters(page)
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await page.keyboard.up('ArrowRight')
  await expect.poll(() => readSaved(page)).toContain('"region":"kanto"')
  expect(urlSearch(page)).toBe('')
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
})

test('mobile_filter_changes_preserve_url_and_reset_display_page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/events/?category=ackey&status=ongoing&page=2')
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
  await openEventFilters(page)
  await category(page, 'アクキー').click()
  await openEventFilters(page)
  await expect(category(page, 'アクキー')).not.toBeChecked()
  expect(urlSearch(page)).toBe('?category=ackey&status=ongoing&page=2')
  await expect.poll(() => readSaved(page)).toContain('"category":""')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'イベントを絞り込む', exact: true })).toBeFocused()
  await closeEventFilters(page)
  await page.getByRole('button', { name: '条件を解除', exact: true }).click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
})

for (const width of [375, 1280])
  test(`event_age_default_opt_out_share_and_reset_${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixtures = [
      { ...events[0], title: '終了告知のない古いイベント', startDate: '2026-09-03T00:00:00+09:00', endDate: undefined },
      { ...events[1], title: '最近のイベント', startDate: '2026-09-04T00:00:00+09:00', endDate: undefined },
      { ...events[2], title: '開催予定のイベント', startDate: '2026-10-10T00:00:00+09:00', endDate: undefined }
    ]
    await page.route('**/api/events', (route) => route.fulfill({ json: fixtures }))
    await page.goto('/events/')
    await expect(page.getByText('全 2 件中 1–2 件を表示')).toBeVisible()
    await expect(page.getByRole('link', { name: /終了告知のない古いイベント/ })).toHaveCount(0)
    const openFilters = async () => {
      await openEventFilters(page)
    }
    const age = page
      .getByRole('checkbox', { name: '開始から1か月以上経ったイベントを非表示', exact: true })
      .filter({ visible: true })
    await openFilters()
    await expect(age).toBeChecked()
    await age.uncheck()
    await expect.poll(() => readSaved(page)).toContain('"hideOldEvents":false')
    expect(urlSearch(page)).toBe('')
    await closeEventFilters(page)
    await expect(page.getByText('全 3 件中 1–3 件を表示')).toBeVisible()
    // 生成するのではなく、外部から与えられた URL の条件を読む。
    await page.goto('/events/?hideOldEvents=false')
    await expect(page.getByRole('link', { name: /終了告知のない古いイベント/ })).toBeVisible()
    await openFilters()
    await expect(age).not.toBeChecked()
    await page.getByRole('button', { name: 'クリア', exact: true }).filter({ visible: true }).click()
    await expect(age).toBeChecked()
    await closeEventFilters(page)
    await expect(page.getByText('全 2 件中 1–2 件を表示')).toBeVisible()
    await closeEventFilters(page)
    await page.getByRole('radio', { name: '日程', exact: true }).click()
    await expect(page.getByRole('link', { name: '最近のイベントの詳細を見る', exact: true })).toBeVisible()
    await expect(page.locator('.gantt-scroll-container').getByText(/・開催中/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /終了告知のない古いイベント/ })).toHaveCount(0)
  })

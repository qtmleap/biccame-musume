import { expect, type Page, test } from '@playwright/test'

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
const category = (page: Page, label: string) => page.getByRole('checkbox', { name: label, exact: true })

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
  await page.addInitScript(() => {
    localStorage.setItem('biccame-region-filter', JSON.stringify('kyushu'))
    localStorage.setItem('event-list-status-filter', JSON.stringify({ upcoming: false, ongoing: false, ended: true }))
    localStorage.setItem('event-page', JSON.stringify(5))
    localStorage.setItem('event-user-activity-filter', JSON.stringify({ hideInterested: true, hideCompleted: true }))
  })
  await page.goto(
    '/events/?category=ackey&status=ongoing&region=hokkaido&store=sapporo&page=2&campaign=test&hideInterested=false'
  )
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await expect(page.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
  await expect(category(page, 'アクキー')).toBeChecked()
  await expect(category(page, 'その他')).not.toBeChecked()
  await expect(category(page, '開催中')).toBeChecked()
  await expect(category(page, '終了')).not.toBeChecked()
  await expect(category(page, '興味あり')).not.toBeChecked()
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
    await expect(otherPage.getByRole('radio', { name: '北海道', exact: true })).toBeChecked()
    await expect(category(otherPage, 'その他')).not.toBeChecked()
    await expect(category(otherPage, '興味あり')).not.toBeChecked()
  } finally {
    await otherContext.close()
  }
  await page.reload()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await page.getByRole('radio', { name: '全国', exact: true }).click()
  await expect.poll(() => urlValue(page, 'campaign')).toBe('test')
  await expect.poll(() => urlValue(page, 'page')).toBe('1')
})

test('character_region_does_not_change_events', async ({ page }) => {
  await page.goto('/characters/')
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: '関東', exact: true }).click()
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await page.getByRole('link', { name: 'イベント一覧へ', exact: true }).click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: '北海道', exact: true }).click()
  await expect.poll(() => urlValue(page, 'region')).toBe('hokkaido')
  await page.getByRole('link', { name: '娘一覧へ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ビッカメ娘一覧', exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
})

test('url_less_ignores_old_persisted_filters_and_page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('biccame-region-filter', JSON.stringify('kyushu'))
    localStorage.setItem('event-page', JSON.stringify(5))
    localStorage.setItem('event-list-status-filter', JSON.stringify({ upcoming: false, ongoing: false, ended: true }))
  })
  await page.goto('/events/')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
})

for (const malformed of ['-2', '1.5', 'junk', '0', '9007199254740992', 'true'])
  test(`invalid_search_uses_safe_defaults_${malformed}`, async ({ page }) => {
    await page.goto(`/events/?page=${malformed}&category=invalid&status=invalid&region=invalid&store=invalid`)
    await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
    await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
    await expect(category(page, '開催中')).toBeChecked()
  })

test('explicit_store_and_region_are_independent_and_legacy_store_works', async ({ page }) => {
  await page.goto('/events/?store=sapporo&region=kanto')
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
  await page.goto('/events/?store=sapporo')
  await expect(page.getByRole('radio', { name: '全国', exact: true })).toBeChecked()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
})

test('filter_reset_refetch_clamp_and_browser_back_preserve_distinction', async ({ page }) => {
  await page.goto('/events/?page=5')
  await expect(page.getByText('全 60 件中 49–60 件を表示')).toBeVisible()
  await category(page, 'その他').click()
  await expect(page.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
  await expect.poll(() => urlValue(page, 'page')).toBe('1')
  await page.goBack()
  await expect(page.getByText('全 60 件中 49–60 件を表示')).toBeVisible()
  await page.route('**/api/events', (route) => route.fulfill({ json: events.slice(0, 13) }))
  await page.getByRole('button', { name: '一覧再取得' }).click()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await expect.poll(() => urlValue(page, 'page')).toBe('2')
  await page.reload()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
})

test('empty_category_and_status_round_trip_in_url', async ({ page }) => {
  await page.goto('/events/?category=&status=')
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
  await expect(category(page, 'アクキー')).not.toBeChecked()
  await expect(category(page, '開催中')).not.toBeChecked()
  await page.reload()
  await expect(category(page, 'アクキー')).not.toBeChecked()
  await page.getByRole('button', { name: '条件を解除', exact: true }).click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await page.goBack()
  await expect(category(page, 'アクキー')).not.toBeChecked()
})

test('activity_url_flags_use_explicit_boolean_values', async ({ page }) => {
  await page.goto('/events/?hideInterested=true&hideCompleted=false')
  await expect(page.getByText('全 59 件中 1–12 件を表示')).toBeVisible()
  await expect(category(page, '興味あり')).toBeChecked()
  await expect(category(page, '達成済み')).not.toBeChecked()
  await category(page, '興味あり').click()
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await expect.poll(() => urlValue(page, 'hideInterested')).toBe('false')
  await page.reload()
  await expect(category(page, '興味あり')).not.toBeChecked()
  await page.goto('/events/?hideInterested=garbage&hideCompleted=1')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
})

test('controlled_event_region_retains_keyboard_selection_and_url', async ({ page }) => {
  await page.goto('/events/')
  await page.getByRole('radio', { name: '北海道', exact: true }).click()
  await page.keyboard.down('ArrowRight')
  await expect(page.getByRole('radio', { name: '関東', exact: true })).toBeChecked()
  await page.keyboard.up('ArrowRight')
  await expect.poll(() => urlValue(page, 'region')).toBe('kanto')
  await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
})

test('mobile_filter_changes_update_url_and_reset_page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/events/?category=ackey&status=ongoing&page=2')
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
  await category(page, 'アクキー').click()
  await expect(category(page, 'アクキー')).not.toBeChecked()
  await expect.poll(() => urlValue(page, 'category')).toBe('')
  await expect.poll(() => urlValue(page, 'page')).toBe('1')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'イベントを絞り込む', exact: true })).toBeFocused()
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
      if (width < 768) await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
    }
    const age = page.getByRole('checkbox', { name: '開始から1か月以上経ったイベントを非表示', exact: true }).filter({ visible: true })
    await openFilters()
    await expect(age).toBeChecked()
    await age.uncheck()
    await expect.poll(() => urlValue(page, 'hideOldEvents')).toBe('false')
    if (width < 768) await page.keyboard.press('Escape')
    await expect(page.getByText('全 3 件中 1–3 件を表示')).toBeVisible()
    const sharedUrl = page.url()
    await page.goto(sharedUrl)
    await expect(page.getByRole('link', { name: /終了告知のない古いイベント/ })).toBeVisible()
    await openFilters()
    await expect(age).not.toBeChecked()
    await page.getByRole('button', { name: 'フィルターをクリア', exact: true }).filter({ visible: true }).click()
    await expect(age).toBeChecked()
    if (width < 768) await page.keyboard.press('Escape')
    await expect(page.getByText('全 2 件中 1–2 件を表示')).toBeVisible()
    await page.getByRole('button', { name: '日程', exact: true }).click()
    await expect(page.getByRole('link', { name: '最近のイベントの詳細を見る', exact: true })).toBeVisible()
    await expect(page.locator('.gantt-scroll-container').getByText(/・開催中/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /終了告知のない古いイベント/ })).toHaveCount(0)
  })

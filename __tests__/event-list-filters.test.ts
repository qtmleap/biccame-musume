import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import {
  DEFAULT_EVENT_CATEGORY,
  DEFAULT_EVENT_LIST_FILTERS,
  DEFAULT_EVENT_STATUS,
  type EventListFilters,
  EventSearchSchema
} from '../workers/app/src/schemas/event-search'
import {
  hasEventListFilterParams,
  resolveEventListFilters,
  shouldNormalizeEventListSearch,
  toEventListFilterSearch,
  toStoredEventListFilters
} from '../workers/app/src/utils/event-list-filters'

const parseSearch = (input: Record<string, unknown>) => {
  const result = EventSearchSchema.safeParse(input)
  if (!result.success) throw new Error('search should always parse')
  return result.data
}

// 保存値(既定とは全項目が異なる)。
const stored: EventListFilters = {
  category: 'ackey',
  status: 'ended',
  region: 'kyushu',
  store: 'sapporo',
  hideInterested: true,
  hideCompleted: true,
  hideOldEvents: false
}

describe('検索スキーマ', () => {
  const filterKeys = [
    'category',
    'status',
    'region',
    'store',
    'hideInterested',
    'hideCompleted',
    'hideOldEvents'
  ] as const

  test('絞り込みの 7 項目は省略時に undefined のまま(既定値を補わない)', () => {
    const data = parseSearch({})
    for (const key of filterKeys) expect(data[key]).toBeUndefined()
    expect(data.page).toBe(1)
  })

  test('正しい値はそのまま読む', () => {
    expect(
      parseSearch({
        category: 'ackey',
        status: 'ongoing',
        region: 'kanto',
        store: 'sapporo',
        hideInterested: 'true',
        hideCompleted: false,
        hideOldEvents: 'false'
      })
    ).toMatchObject({
      category: 'ackey',
      status: 'ongoing',
      region: 'kanto',
      store: 'sapporo',
      hideInterested: true,
      hideCompleted: false,
      hideOldEvents: false
    })
  })

  test('空文字は「選択なし」として読む', () => {
    expect(parseSearch({ category: '', status: '' })).toMatchObject({ category: '', status: '' })
  })

  test('不正な値は「書かれている」まま既定の値に戻す(undefined にしない)', () => {
    expect(
      parseSearch({
        category: 'garbage',
        status: 'garbage',
        region: 'garbage',
        store: 'garbage',
        hideInterested: 'garbage',
        hideCompleted: '1',
        hideOldEvents: 'garbage'
      })
    ).toMatchObject({
      category: DEFAULT_EVENT_CATEGORY,
      status: DEFAULT_EVENT_STATUS,
      region: 'all',
      store: '',
      hideInterested: false,
      hideCompleted: false,
      hideOldEvents: true
    })
  })

  test('ページと計測用のパラメータは別扱いで、保持する', () => {
    const data = parseSearch({ page: '3', campaign: 'x' })
    expect(data.page).toBe(3)
    expect(Reflect.get(data, 'campaign')).toBe('x')
    expect(parseSearch({ page: 'junk' }).page).toBe(1)
  })
})

describe('URL に絞り込みのパラメータがあるか', () => {
  test('絞り込みの項目が 1 つでもあれば「あり」', () => {
    for (const input of [
      { category: 'ackey' },
      { status: '' },
      { region: 'kanto' },
      { store: 'sapporo' },
      { hideInterested: 'false' },
      { hideCompleted: 'true' },
      { hideOldEvents: 'false' }
    ])
      expect(hasEventListFilterParams(parseSearch(input))).toBe(true)
  })

  test('page だけ・計測用のパラメータだけ・空は「なし」', () => {
    expect(hasEventListFilterParams(parseSearch({}))).toBe(false)
    expect(hasEventListFilterParams(parseSearch({ page: '2' }))).toBe(false)
    expect(hasEventListFilterParams(parseSearch({ campaign: 'x', theme: 'dark', page: 3 }))).toBe(false)
  })

  test('不正な値だけでも「あり」', () => {
    expect(hasEventListFilterParams(parseSearch({ category: 'garbage' }))).toBe(true)
    expect(hasEventListFilterParams(parseSearch({ store: 'garbage' }))).toBe(true)
    expect(hasEventListFilterParams(parseSearch({ hideOldEvents: 'garbage' }))).toBe(true)
  })
})

describe('URL と保存値の合成(全か無か)', () => {
  test('パラメータが無ければ保存値をまるごと使う', () => {
    expect(resolveEventListFilters(parseSearch({}), stored, true)).toEqual(stored)
  })

  test('保存値が無ければ(既定の保存値なら)既定になる', () => {
    expect(resolveEventListFilters(parseSearch({}), DEFAULT_EVENT_LIST_FILTERS, true)).toEqual(
      DEFAULT_EVENT_LIST_FILTERS
    )
  })

  test('page だけ・計測用のパラメータだけの URL は保存値を使う', () => {
    expect(resolveEventListFilters(parseSearch({ page: '2' }), stored, true)).toEqual(stored)
    expect(resolveEventListFilters(parseSearch({ campaign: 'x' }), stored, true)).toEqual(stored)
  })

  test('1 つでもあれば保存値を一切使わず、URL に無い項目は既定になる', () => {
    expect(resolveEventListFilters(parseSearch({ region: 'kanto' }), stored, true)).toEqual({
      ...DEFAULT_EVENT_LIST_FILTERS,
      region: 'kanto'
    })
    expect(resolveEventListFilters(parseSearch({ hideInterested: 'false' }), stored, true)).toEqual(
      DEFAULT_EVENT_LIST_FILTERS
    )
    expect(resolveEventListFilters(parseSearch({ store: 'sapporo' }), DEFAULT_EVENT_LIST_FILTERS, true)).toEqual({
      ...DEFAULT_EVENT_LIST_FILTERS,
      store: 'sapporo'
    })
  })

  test('URL の値は保存値と異なっても URL が勝つ', () => {
    const search = parseSearch({
      category: 'other',
      status: 'upcoming',
      region: 'hokkaido',
      store: 'sapporo',
      hideInterested: 'false',
      hideCompleted: 'false',
      hideOldEvents: 'true',
      page: 2
    })
    expect(resolveEventListFilters(search, stored, true)).toEqual({
      category: 'other',
      status: 'upcoming',
      region: 'hokkaido',
      store: 'sapporo',
      hideInterested: false,
      hideCompleted: false,
      hideOldEvents: true
    })
  })

  test('不正な値だけの URL は「パラメータあり」として既定になる(保存値で補わない)', () => {
    expect(resolveEventListFilters(parseSearch({ category: 'garbage' }), stored, true)).toEqual(
      DEFAULT_EVENT_LIST_FILTERS
    )
    expect(resolveEventListFilters(parseSearch({ store: 'garbage' }), stored, true)).toEqual(DEFAULT_EVENT_LIST_FILTERS)
  })

  test('空文字の種別・開催状況は「選択なし」のまま使う', () => {
    expect(resolveEventListFilters(parseSearch({ category: '', status: '' }), stored, true)).toMatchObject({
      category: '',
      status: ''
    })
  })

  test('未ログインでは、保存値の非表示設定を効かせない', () => {
    expect(resolveEventListFilters(parseSearch({}), stored, false)).toEqual({
      ...stored,
      hideInterested: false,
      hideCompleted: false
    })
  })

  test('未ログインでも、URL に明示された非表示設定は効く', () => {
    expect(resolveEventListFilters(parseSearch({ hideInterested: 'true' }), stored, false)).toEqual({
      ...DEFAULT_EVENT_LIST_FILTERS,
      hideInterested: true
    })
  })
})

describe('URL への書き込みと保存', () => {
  test('ログイン後は非表示設定も含めて全項目を書く。store が無ければ書かない', () => {
    expect(toEventListFilterSearch({ ...stored, store: undefined }, true)).toEqual({
      category: 'ackey',
      status: 'ended',
      region: 'kyushu',
      store: undefined,
      hideOldEvents: false,
      hideInterested: true,
      hideCompleted: true
    })
  })

  test('未ログインの間は非表示設定を書かない', () => {
    const search = toEventListFilterSearch(stored, false)
    expect(Reflect.has(search, 'hideInterested')).toBe(false)
    expect(Reflect.has(search, 'hideCompleted')).toBe(false)
    expect(search).toMatchObject({ category: 'ackey', region: 'kyushu', store: 'sapporo' })
  })

  test('未ログインで変更しても、保存済みの非表示設定は残す', () => {
    const next = { ...DEFAULT_EVENT_LIST_FILTERS, region: 'kanto' as const }
    expect(toStoredEventListFilters(next, stored, false)).toEqual({
      ...next,
      hideInterested: true,
      hideCompleted: true
    })
    expect(toStoredEventListFilters(next, stored, true)).toEqual(next)
  })

  test('URL の正規化は、パラメータが無いときだけ行う', () => {
    expect(shouldNormalizeEventListSearch(parseSearch({}), stored, true)).toBe(true)
    expect(shouldNormalizeEventListSearch(parseSearch({ page: 2 }), stored, true)).toBe(true)
    expect(shouldNormalizeEventListSearch(parseSearch({ region: 'kanto' }), stored, true)).toBe(false)
  })

  test('未ログインで保存値に非表示設定があるときは、ログインが確定するまで正規化を待つ', () => {
    expect(shouldNormalizeEventListSearch(parseSearch({}), stored, false)).toBe(false)
    expect(
      shouldNormalizeEventListSearch(parseSearch({}), { ...stored, hideInterested: false, hideCompleted: false }, false)
    ).toBe(true)
  })
})

type AtomModule = typeof import('../workers/app/src/atoms/event-list-filters-atom')

describe('絞り込みの永続化 atom', () => {
  const key = 'event-list-filters'
  const data = new Map<string, string>()
  const fake = {
    getItem: (name: string) => (data.has(name) ? String(data.get(name)) : null),
    setItem: (name: string, value: string) => data.set(name, value),
    removeItem: (name: string) => data.delete(name)
  }

  const hadWindow = Reflect.has(globalThis, 'window')
  const originalWindow = Reflect.get(globalThis, 'window')
  beforeEach(() => {
    data.clear()
    Reflect.set(globalThis, 'window', { localStorage: fake })
  })
  afterEach(() => {
    if (hadWindow) Reflect.set(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  // getOnInit は atom の生成時(モジュール読込時)に保存値を読むので、テストごとに読み込み直して初期表示を再現する。
  let loads = 0
  const loadAtom = async () => {
    loads += 1
    const loaded: AtomModule = await import(`../workers/app/src/atoms/event-list-filters-atom?load=${loads}`)
    return loaded.eventListFiltersAtom
  }

  test('保存が無ければ既定', async () => {
    expect(createStore().get(await loadAtom())).toEqual(DEFAULT_EVENT_LIST_FILTERS)
  })

  test('保存値を初期表示で読む', async () => {
    data.set(key, JSON.stringify(stored))
    expect(createStore().get(await loadAtom())).toEqual(stored)
  })

  test('書き込むと localStorage に保存され、読み込み直しても残る(ページは保存しない)', async () => {
    createStore().set(await loadAtom(), stored)
    expect(JSON.parse(String(data.get(key)))).toEqual(stored)
    expect(Reflect.has(JSON.parse(String(data.get(key))), 'page')).toBe(false)
    expect(createStore().get(await loadAtom())).toEqual(stored)
  })

  test('store が無い保存値は store を持たない(JSON に出ない)', async () => {
    createStore().set(await loadAtom(), { ...stored, store: undefined })
    expect(Reflect.has(JSON.parse(String(data.get(key))), 'store')).toBe(false)
  })

  test('壊れた項目だけ既定へ戻し、ほかの項目は残す', async () => {
    data.set(key, JSON.stringify({ ...stored, region: 'garbage', category: 'garbage', hideInterested: 'yes' }))
    expect(createStore().get(await loadAtom())).toEqual({
      ...stored,
      region: 'all',
      category: DEFAULT_EVENT_CATEGORY,
      hideInterested: false
    })
  })

  test('欠けた項目は既定になる', async () => {
    data.set(key, JSON.stringify({ region: 'kanto' }))
    expect(createStore().get(await loadAtom())).toEqual({ ...DEFAULT_EVENT_LIST_FILTERS, region: 'kanto' })
  })

  test.each([
    ['壊れた JSON', '{'],
    ['配列', '[]'],
    ['null', 'null'],
    ['文字列', JSON.stringify('x')]
  ])('全体が不正な保存値(%s)は既定に戻す', async (_label, raw) => {
    data.set(key, raw)
    expect(createStore().get(await loadAtom())).toEqual(DEFAULT_EVENT_LIST_FILTERS)
  })

  test('旧い保存キー(event-user-activity-filter・event-list-status-filter など)は読まず、引き継がない', async () => {
    data.set('event-user-activity-filter', JSON.stringify({ hideInterested: true, hideCompleted: true }))
    data.set('event-list-status-filter', JSON.stringify({ upcoming: false, ongoing: false, ended: true }))
    data.set('event-page', JSON.stringify(5))
    data.set('biccame-region-filter', JSON.stringify('kyushu'))
    expect(createStore().get(await loadAtom())).toEqual(DEFAULT_EVENT_LIST_FILTERS)
  })

  test('新キーがあっても旧い保存キーは混ざらず、書き込んでも旧キーは触らない', async () => {
    const legacy = JSON.stringify({ hideInterested: true, hideCompleted: true })
    data.set(key, JSON.stringify({ region: 'kanto' }))
    data.set('event-user-activity-filter', legacy)
    const atom = await loadAtom()
    expect(createStore().get(atom)).toEqual({ ...DEFAULT_EVENT_LIST_FILTERS, region: 'kanto' })
    createStore().set(atom, stored)
    expect(data.get('event-user-activity-filter')).toBe(legacy)
  })
})

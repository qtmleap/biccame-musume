import { describe, expect, test } from 'bun:test'
import {
  accountSortToSearch,
  firstSortOrder,
  nextAccountSort,
  resolveAccountSort,
  type SortableAccount,
  sortAccounts
} from '@/components/admin/event-detect/account-sort'
import { EventDetectStatsSearchSchema } from '@/schemas/event-detect-search'

const account = (screenName: string, overrides: Partial<SortableAccount> = {}): SortableAccount => ({
  screenName,
  store: 'akiba',
  posts: 0,
  candidates: 0,
  emulated: 0,
  emulatedEnded: 0,
  events: 0,
  goldPosts: 0,
  ...overrides
})

const names = (accounts: readonly SortableAccount[]) => accounts.map((entry) => entry.screenName)

describe('sortAccounts', () => {
  const accounts = [
    account('bic_b', { posts: 10, candidates: 5, emulated: 4, emulatedEnded: 3, events: 1, goldPosts: 0 }),
    account('bic_a', { posts: 30, candidates: 2, emulated: 1, emulatedEnded: 1, events: 3, goldPosts: 2 }),
    account('bic_c', { posts: 20, candidates: 9, emulated: 7, emulatedEnded: 0, events: 2, goldPosts: 1 })
  ]

  test('投稿数の降順', () => {
    expect(names(sortAccounts(accounts, { key: 'posts', order: 'desc' }))).toEqual(['bic_a', 'bic_c', 'bic_b'])
  })

  test('投稿数の昇順は降順の逆になる', () => {
    expect(names(sortAccounts(accounts, { key: 'posts', order: 'asc' }))).toEqual(['bic_b', 'bic_c', 'bic_a'])
  })

  test.each([
    ['candidates', ['bic_c', 'bic_b', 'bic_a']],
    ['emulated', ['bic_c', 'bic_b', 'bic_a']],
    ['emulatedEnded', ['bic_b', 'bic_a', 'bic_c']],
    ['events', ['bic_a', 'bic_c', 'bic_b']],
    ['goldPosts', ['bic_a', 'bic_c', 'bic_b']]
  ] as const)('数値の列 %s は降順で大きい順に並ぶ', (key, expected) => {
    expect(names(sortAccounts(accounts, { key, order: 'desc' }))).toEqual([...expected])
    expect(names(sortAccounts(accounts, { key, order: 'asc' }))).toEqual([...expected].reverse())
  })

  test('アカウント名は大文字小文字を無視して昇順・降順に並ぶ', () => {
    const mixed = [account('bic_b'), account('Bic_c'), account('bic_a')]
    expect(names(sortAccounts(mixed, { key: 'screenName', order: 'asc' }))).toEqual(['bic_a', 'bic_b', 'Bic_c'])
    expect(names(sortAccounts(mixed, { key: 'screenName', order: 'desc' }))).toEqual(['Bic_c', 'bic_b', 'bic_a'])
  })

  test('店舗はキーではなく表示名の順で並ぶ', () => {
    // キーの昇順は abeno < akiba < bicqlo だが、表示名は「AKIBA店」「あべのキューズモール店」「新宿東口店」の順
    const stores = [
      account('bic_abeno', { store: 'abeno' }),
      account('bic_akiba', { store: 'akiba' }),
      account('bic_bicqlo', { store: 'bicqlo' })
    ]
    expect(names(sortAccounts(stores, { key: 'store', order: 'asc' }))).toEqual([
      'bic_akiba',
      'bic_abeno',
      'bic_bicqlo'
    ])
    expect(names(sortAccounts(stores, { key: 'store', order: 'desc' }))).toEqual([
      'bic_bicqlo',
      'bic_abeno',
      'bic_akiba'
    ])
  })

  test('値が同じ行はアカウント名の昇順になり、向きを変えても崩れない', () => {
    const tied = [
      account('bic_c', { posts: 5 }),
      account('bic_a', { posts: 5 }),
      account('Bic_b', { posts: 5 }),
      account('bic_z', { posts: 9 })
    ]
    expect(names(sortAccounts(tied, { key: 'posts', order: 'desc' }))).toEqual(['bic_z', 'bic_a', 'Bic_b', 'bic_c'])
    expect(names(sortAccounts(tied, { key: 'posts', order: 'asc' }))).toEqual(['bic_a', 'Bic_b', 'bic_c', 'bic_z'])
  })

  test('店舗が同じ行もアカウント名の昇順になる', () => {
    const sameStore = [account('bic_b'), account('bic_a')]
    expect(names(sortAccounts(sameStore, { key: 'store', order: 'desc' }))).toEqual(['bic_a', 'bic_b'])
  })

  test('入力の配列は書き換えない', () => {
    const input = [account('bic_b', { posts: 1 }), account('bic_a', { posts: 2 })]
    const before = names(input)
    sortAccounts(input, { key: 'posts', order: 'desc' })
    expect(names(input)).toEqual(before)
  })
})

describe('並べ替えの状態', () => {
  test('文字の列は昇順、数値の列は降順から始める', () => {
    expect(firstSortOrder('screenName')).toBe('asc')
    expect(firstSortOrder('store')).toBe('asc')
    for (const key of ['posts', 'candidates', 'emulated', 'emulatedEnded', 'events', 'goldPosts'] as const) {
      expect(firstSortOrder(key)).toBe('desc')
    }
  })

  test('検索パラメータが無ければ投稿数の降順', () => {
    expect(resolveAccountSort({})).toEqual({ key: 'posts', order: 'desc' })
  })

  test('向きを省略した列はその列の最初の向きになる', () => {
    expect(resolveAccountSort({ sort: 'screenName' })).toEqual({ key: 'screenName', order: 'asc' })
    expect(resolveAccountSort({ sort: 'goldPosts' })).toEqual({ key: 'goldPosts', order: 'desc' })
    expect(resolveAccountSort({ sort: 'emulated' })).toEqual({ key: 'emulated', order: 'desc' })
    expect(resolveAccountSort({ sort: 'emulatedEnded' })).toEqual({ key: 'emulatedEnded', order: 'desc' })
    expect(resolveAccountSort({ order: 'asc' })).toEqual({ key: 'posts', order: 'asc' })
  })

  test('別の列を押すとその列の最初の向きになる', () => {
    expect(nextAccountSort({ key: 'posts', order: 'desc' }, 'screenName')).toEqual({ key: 'screenName', order: 'asc' })
    expect(nextAccountSort({ key: 'screenName', order: 'desc' }, 'events')).toEqual({ key: 'events', order: 'desc' })
  })

  test('選択中の列をもう一度押すと向きが入れ替わる', () => {
    expect(nextAccountSort({ key: 'posts', order: 'desc' }, 'posts')).toEqual({ key: 'posts', order: 'asc' })
    expect(nextAccountSort({ key: 'posts', order: 'asc' }, 'posts')).toEqual({ key: 'posts', order: 'desc' })
    expect(nextAccountSort({ key: 'store', order: 'asc' }, 'store')).toEqual({ key: 'store', order: 'desc' })
  })

  test('既定の状態は URL に何も出さない', () => {
    expect(accountSortToSearch({ key: 'posts', order: 'desc' })).toEqual({ sort: undefined, order: undefined })
    expect(accountSortToSearch({ key: 'screenName', order: 'asc' })).toEqual({ sort: 'screenName', order: undefined })
  })

  test('既定と違う項目だけを URL に出し、読み戻すと同じ状態になる', () => {
    const states = [
      { key: 'posts', order: 'asc' },
      { key: 'screenName', order: 'desc' },
      { key: 'store', order: 'asc' },
      { key: 'goldPosts', order: 'desc' },
      { key: 'candidates', order: 'asc' },
      { key: 'emulated', order: 'asc' },
      { key: 'emulatedEnded', order: 'desc' }
    ] as const
    for (const state of states) {
      expect(resolveAccountSort(accountSortToSearch(state))).toEqual(state)
    }
    expect(accountSortToSearch({ key: 'posts', order: 'asc' })).toEqual({ sort: undefined, order: 'asc' })
  })
})

describe('EventDetectStatsSearchSchema', () => {
  const parse = (input: unknown) => EventDetectStatsSearchSchema.safeParse(input)

  test('省略は省略のまま通す', () => {
    expect(parse({})).toEqual({ success: true, data: {} })
  })

  test('正しい値は通し、不正な値は項目ごとに省略へ戻す', () => {
    expect(parse({ sort: 'store', order: 'desc' })).toEqual({ success: true, data: { sort: 'store', order: 'desc' } })
    expect(parse({ sort: 'nope', order: 'desc' })).toEqual({
      success: true,
      data: { sort: undefined, order: 'desc' }
    })
    expect(parse({ sort: 'posts', order: 3 })).toEqual({ success: true, data: { sort: 'posts', order: undefined } })
    expect(parse({ sort: 'emulatedEnded' })).toEqual({ success: true, data: { sort: 'emulatedEnded' } })
  })

  test('外した列（最初の投稿・最新の投稿）が URL に残っていても省略に戻し、向きは残す', () => {
    for (const sort of ['firstPost', 'lastPost']) {
      expect(parse({ sort })).toEqual({ success: true, data: { sort: undefined } })
      expect(parse({ sort, order: 'asc' })).toEqual({ success: true, data: { sort: undefined, order: 'asc' } })
      // 省略に戻った後は既定（投稿数）の並びになる
      const parsed = parse({ sort })
      expect(parsed.success && resolveAccountSort(parsed.data)).toEqual({ key: 'posts', order: 'desc' })
    }
  })
})

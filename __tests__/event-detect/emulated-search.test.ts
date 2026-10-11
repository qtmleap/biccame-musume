import { describe, expect, test } from 'bun:test'
import {
  emulatedSortToSearch,
  nextEmulatedSort,
  resolveEmulatedSort
} from '@/components/admin/event-detect/emulated-sort'
import { EventDetectEmulatedSearchSchema } from '@/schemas/event-detect-search'

/** 不正な値は項目ごとに省略へ戻るので、どんな入力でも成功する */
const parse = (input: unknown) => {
  const result = EventDetectEmulatedSearchSchema.safeParse(input)
  expect(result.success).toBe(true)
  return result.data
}

/** 省略へ戻った項目か。.catch(undefined) はキーを残して値を undefined にするので、値で見る */
const omitted = (search: ReturnType<typeof parse>, key: string) =>
  expect(Object.fromEntries(Object.entries({ ...search }))[key]).toBeUndefined()

describe('EventDetectEmulatedSearchSchema', () => {
  test('何も無ければ、絞り込みも並べ替えも持たず、ページは 1', () => {
    const search = parse({})
    expect(search).toEqual({ page: 1 })
    for (const key of ['year', 'store', 'status', 'ended', 'd1', 'q', 'sort', 'order']) omitted(search, key)
  })

  test('正しい値はそのまま通す', () => {
    const input = {
      year: 2026,
      store: 'kawasaki',
      status: 'end',
      ended: 1,
      d1: 'none',
      q: '名刺',
      sort: 'store',
      order: 'desc',
      page: 3
    } as const
    expect(parse(input)).toEqual(input)
    expect(parse({ ended: 0, d1: 'matched' })).toMatchObject({ ended: 0, d1: 'matched' })
  })

  test('年は 4 桁の数字か数字だけの文字列を受け、それ以外は省略へ戻る', () => {
    expect(parse({ year: '2026' })).toMatchObject({ year: 2026 })
    for (const year of [20, 12345, 2026.5, 'abc', '20x6', true, null, []]) omitted(parse({ year }), 'year')
  })

  test('店舗・検索語は文字列を受け、数字だけなら文字列へ戻し、空や型違いは省略へ戻る', () => {
    expect(parse({ store: 'kawasaki', q: 7 })).toMatchObject({ store: 'kawasaki', q: '7' })
    for (const value of ['', true, null, {}, []]) {
      const search = parse({ store: value, q: value })
      omitted(search, 'store')
      omitted(search, 'q')
    }
  })

  test('不正な状態は省略へ戻る', () => {
    for (const status of ['ended', 'ongoing ', 1, null]) omitted(parse({ status }), 'status')
  })

  test('終了は 1 と 0 の数字だけを受け、それ以外は省略へ戻る', () => {
    for (const ended of ['1', '0', true, false, 2, -1, null, 'yes']) omitted(parse({ ended }), 'ended')
  })

  test('D1 は matched と none だけを受ける', () => {
    for (const d1 of ['yes', 'MATCHED', 1, true, null]) omitted(parse({ d1 }), 'd1')
  })

  test('並べ替えの列と向きは、不正ならそれぞれ省略へ戻る', () => {
    omitted(parse({ sort: 'item', order: 'up' }), 'sort')
    omitted(parse({ sort: 'item', order: 'up' }), 'order')
    expect(parse({ sort: 'mentions', order: 'up' })).toMatchObject({ sort: 'mentions' })
    omitted(parse({ sort: 'mentions', order: 'up' }), 'order')
    expect(parse({ sort: 'x', order: 'asc' })).toMatchObject({ order: 'asc' })
  })

  test('ページは正の整数だけを受け、不正なら 1 へ戻る', () => {
    expect(parse({ page: '4' })).toMatchObject({ page: 4 })
    for (const page of [0, -1, 1.5, 'abc', '0', null]) expect(parse({ page })).toMatchObject({ page: 1 })
  })

  test('1 つの項目が不正でも、ほかの項目は残る', () => {
    expect(parse({ year: 'abc', store: 'kawasaki', ended: 1, status: 'nope', page: 2 })).toEqual({
      store: 'kawasaki',
      ended: 1,
      page: 2
    })
  })
})

describe('LLM イベント一覧の並べ替え', () => {
  test('省略時は最初の言及の降順で、店舗だけが昇順から始まる', () => {
    expect(resolveEmulatedSort({})).toEqual({ key: 'firstSeen', order: 'desc' })
    expect(resolveEmulatedSort({ sort: 'store' })).toEqual({ key: 'store', order: 'asc' })
    expect(resolveEmulatedSort({ sort: 'mentions', order: 'asc' })).toEqual({ key: 'mentions', order: 'asc' })
  })

  test('既定と同じ項目は URL から外す', () => {
    expect(emulatedSortToSearch({ key: 'firstSeen', order: 'desc' })).toEqual({ sort: undefined, order: undefined })
    expect(emulatedSortToSearch({ key: 'store', order: 'asc' })).toEqual({ sort: 'store', order: undefined })
    expect(emulatedSortToSearch({ key: 'mentions', order: 'asc' })).toEqual({ sort: 'mentions', order: 'asc' })
  })

  test('同じ列を押すと向きが入れ替わり、別の列を押すとその列の最初の向きになる', () => {
    expect(nextEmulatedSort({ key: 'firstSeen', order: 'desc' }, 'firstSeen')).toEqual({
      key: 'firstSeen',
      order: 'asc'
    })
    expect(nextEmulatedSort({ key: 'firstSeen', order: 'asc' }, 'firstSeen')).toEqual({
      key: 'firstSeen',
      order: 'desc'
    })
    expect(nextEmulatedSort({ key: 'firstSeen', order: 'desc' }, 'store')).toEqual({ key: 'store', order: 'asc' })
    expect(nextEmulatedSort({ key: 'store', order: 'asc' }, 'lastSeen')).toEqual({ key: 'lastSeen', order: 'desc' })
  })
})

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import {
  changeWebhookFilterAtom,
  cycleWebhookConfidenceSort,
  INITIAL_WEBHOOK_FILTER,
  NO_WEBHOOK_FILTER,
  setWebhookPostStatus,
  setWebhookRange,
  setWebhookScreenName,
  setWebhookVerdict,
  type WebhookFilter,
  webhookFilterAtom
} from '@/atoms/webhook-filter-atom'
import {
  INITIAL_WEBHOOK_PAGINATION,
  type WebhookPagination,
  webhookPaginationAtom
} from '@/atoms/webhook-pagination-atom'
import { type AtomModule, type FakeWindow, filterWith } from './fixtures/webhook-filter'

describe('絞り込み・並べ替えの永続化 atom', () => {
  const key = 'biccame-admin-webhook-filter'
  const paginationKey = 'biccame-admin-webhook-pagination'
  const session = new Map<string, string>()
  const local = new Map<string, string>()
  const fakeStorage = (data: Map<string, string>) => ({
    getItem: (name: string) => (data.has(name) ? String(data.get(name)) : null),
    setItem: (name: string, value: string) => data.set(name, value),
    removeItem: (name: string) => data.delete(name)
  })
  const throwingStorage = {
    getItem: () => {
      throw new Error('storage is not available')
    },
    setItem: () => {
      throw new Error('storage is not available')
    },
    removeItem: () => {
      throw new Error('storage is not available')
    }
  }
  // 保存された JSON を読み戻す。未保存なら JSON として不正になり、テストが落ちる。
  const saved = (name: string) => JSON.parse(String(session.get(name)))

  const hadWindow = Reflect.has(globalThis, 'window')
  const originalWindow = Reflect.get(globalThis, 'window')
  const setWindow = (value: Partial<FakeWindow> | Record<string, unknown>) => Reflect.set(globalThis, 'window', value)
  beforeEach(() => {
    session.clear()
    local.clear()
    setWindow({ sessionStorage: fakeStorage(session), localStorage: fakeStorage(local) })
  })
  afterEach(() => {
    if (hadWindow) Reflect.set(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  // getOnInit は atom の生成時(モジュール読込時)に保存値を読むので、テストごとに読み込み直して初期表示を再現する。
  let loads = 0
  const loadAtoms = async () => {
    loads += 1
    const filterModule: AtomModule = await import(`../workers/web/src/app/atoms/webhook-filter-atom?load=${loads}`)
    return { filterModule }
  }

  test('保存が無ければ既定値（判定は一致）', async () => {
    const { filterModule } = await loadAtoms()
    const value = createStore().get(filterModule.webhookFilterAtom)
    expect(value).toEqual(INITIAL_WEBHOOK_FILTER)
    expect(value.verdict).toBe('match')
  })

  test('保存済みの「すべて」(verdict: null)は既定の一致で上書きせず、そのまま使う', async () => {
    session.set(key, JSON.stringify(NO_WEBHOOK_FILTER))
    const { filterModule } = await loadAtoms()
    expect(createStore().get(filterModule.webhookFilterAtom)).toEqual(NO_WEBHOOK_FILTER)
  })

  test('判定を「すべて」にして保存すると、読み込み直しても「すべて」のまま', async () => {
    const first = await loadAtoms()
    createStore().set(first.filterModule.webhookFilterAtom, NO_WEBHOOK_FILTER)
    expect(saved(key)).toEqual(NO_WEBHOOK_FILTER)
    const second = await loadAtoms()
    expect(createStore().get(second.filterModule.webhookFilterAtom)).toEqual(NO_WEBHOOK_FILTER)
  })

  test('保存値を初期表示から読む(既定値を経由しない)', async () => {
    const value = filterWith({ range: '1h', sort: 'confidence', order: 'asc', verdict: 'excluded', postStatus: 'end' })
    session.set(key, JSON.stringify(value))
    const { filterModule } = await loadAtoms()
    expect(createStore().get(filterModule.webhookFilterAtom)).toEqual(value)
  })

  test('書き込むと sessionStorage に保存され、読み込み直しても残る。localStorage は使わない', async () => {
    const value = filterWith({ range: '24h', postStatus: 'ongoing' })
    const first = await loadAtoms()
    createStore().set(first.filterModule.webhookFilterAtom, value)
    expect(saved(key)).toEqual(value)
    expect(local.size).toBe(0)
    const second = await loadAtoms()
    expect(createStore().get(second.filterModule.webhookFilterAtom)).toEqual(value)
  })

  test.each([
    ['JSON として壊れている', '{"range":'],
    ['形が違う', JSON.stringify({ range: '7d' })],
    ['未知のステータス', JSON.stringify({ ...INITIAL_WEBHOOK_FILTER, postStatus: 'foo' })],
    [
      'ステータスの項目が無い(旧い保存値)',
      JSON.stringify({ range: null, sort: 'createdAt', order: 'desc', verdict: null })
    ],
    ['配列', '[]']
  ])('壊れた保存値(%s)は既定値(判定は一致)に倒す', async (_label, raw) => {
    session.set(key, raw)
    const { filterModule } = await loadAtoms()
    const value = createStore().get(filterModule.webhookFilterAtom)
    expect(value).toEqual(INITIAL_WEBHOOK_FILTER)
    expect(value.verdict).toBe('match')
  })

  test('sessionStorage が使えなくても落ちず、メモリ上で操作を続けられる', async () => {
    setWindow({ sessionStorage: throwingStorage })
    const { filterModule } = await loadAtoms()
    const store = createStore()
    expect(store.get(filterModule.webhookFilterAtom)).toEqual(INITIAL_WEBHOOK_FILTER)
    store.set(filterModule.webhookFilterAtom, filterWith({ range: '1h' }))
    expect(store.get(filterModule.webhookFilterAtom)).toEqual(filterWith({ range: '1h' }))
  })

  test('window が無い環境(SSR・テスト)でも既定値で動く', async () => {
    Reflect.deleteProperty(globalThis, 'window')
    const { filterModule } = await loadAtoms()
    const store = createStore()
    expect(store.get(filterModule.webhookFilterAtom)).toEqual(INITIAL_WEBHOOK_FILTER)
    store.set(filterModule.webhookFilterAtom, filterWith({ verdict: 'excluded' }))
    expect(store.get(filterModule.webhookFilterAtom)).toEqual(filterWith({ verdict: 'excluded' }))
  })

  // 本番と同じ結線を確かめるため、絞り込み atom が内部で参照する素のモジュール（クエリ無し）の atom を使う。
  // 保存値の読み込み（getOnInit）は検証済みなので、ここでは store に値を入れて更新の振る舞いだけを見る。
  describe('条件を変えたらページ位置を1ページ目へ戻す', () => {
    const page3: WebhookPagination = {
      cursor: '1000000000000000005',
      previousCursors: [null, '1000000000000000010']
    }

    // 条件なしから始める。既定（判定は一致）から始めると、判定を一致へ変える更新が「変わらない更新」になってしまう。
    const prepare = (start: WebhookFilter = NO_WEBHOOK_FILTER) => {
      const store = createStore()
      store.set(webhookFilterAtom, start)
      store.set(webhookPaginationAtom, page3)
      expect(store.get(webhookPaginationAtom)).toEqual(page3)
      return store
    }

    test('期間・判定・ステータス・並べ替えのどれを変えても、3ページ目から1ページ目に戻り、保存にも反映される', () => {
      const store = prepare()
      const changes: ((filter: WebhookFilter) => WebhookFilter)[] = [
        (filter) => setWebhookScreenName(filter, 'bic_abeno'),
        (filter) => setWebhookRange(filter, '1h'),
        (filter) => setWebhookVerdict(filter, 'match'),
        (filter) => setWebhookPostStatus(filter, 'announce'),
        cycleWebhookConfidenceSort
      ]
      for (const change of changes) {
        store.set(webhookPaginationAtom, page3)
        store.set(changeWebhookFilterAtom, change)
        expect(store.get(webhookPaginationAtom)).toEqual(INITIAL_WEBHOOK_PAGINATION)
        expect(saved(paginationKey)).toEqual(INITIAL_WEBHOOK_PAGINATION)
      }
      expect(saved(key)).toEqual(store.get(webhookFilterAtom))
    })

    test('実際には変わらない更新(同じ値)ではページ位置を動かさない', () => {
      const store = prepare()
      store.set(changeWebhookFilterAtom, (filter) => setWebhookRange(filter, null))
      store.set(changeWebhookFilterAtom, (filter) => setWebhookPostStatus(filter, null))
      store.set(changeWebhookFilterAtom, (filter) => filter)
      expect(store.get(webhookPaginationAtom)).toEqual(page3)
      expect(store.get(webhookFilterAtom)).toEqual(NO_WEBHOOK_FILTER)
    })

    test('「条件をクリア」(条件なしへ戻す)も条件の変更なので1ページ目へ戻し、すでに条件なしなら何も動かさない', () => {
      const store = prepare()
      store.set(webhookFilterAtom, filterWith({ range: '24h', verdict: 'excluded', postStatus: 'ignored' }))
      store.set(changeWebhookFilterAtom, () => NO_WEBHOOK_FILTER)
      expect(store.get(webhookFilterAtom)).toEqual(NO_WEBHOOK_FILTER)
      expect(store.get(webhookPaginationAtom)).toEqual(INITIAL_WEBHOOK_PAGINATION)
      expect(saved(key)).toEqual(NO_WEBHOOK_FILTER)
      store.set(webhookPaginationAtom, page3)
      store.set(changeWebhookFilterAtom, () => NO_WEBHOOK_FILTER)
      expect(store.get(webhookPaginationAtom)).toEqual(page3)
    })

    test('既定（判定は一致）のままでも「条件をクリア」は効き、判定を「すべて」にして1ページ目へ戻す', () => {
      const store = prepare(INITIAL_WEBHOOK_FILTER)
      store.set(changeWebhookFilterAtom, () => NO_WEBHOOK_FILTER)
      expect(store.get(webhookFilterAtom)).toEqual(NO_WEBHOOK_FILTER)
      expect(store.get(webhookFilterAtom).verdict).toBeNull()
      expect(store.get(webhookPaginationAtom)).toEqual(INITIAL_WEBHOOK_PAGINATION)
    })
  })
})

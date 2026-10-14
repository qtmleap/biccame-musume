import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import {
  INITIAL_WEBHOOK_PAGINATION,
  nextWebhookPagination,
  parseWebhookPagination,
  previousWebhookPagination,
  type WebhookPagination
} from '@/atoms/webhook-pagination-atom'

const CURSOR_10 = '1000000000000000010'
const CURSOR_5 = '1000000000000000005'
const page1: WebhookPagination = INITIAL_WEBHOOK_PAGINATION
const page2: WebhookPagination = { cursor: CURSOR_10, previousCursors: [null] }
const page3: WebhookPagination = { cursor: CURSOR_5, previousCursors: [null, CURSOR_10] }

describe('Webhook受信履歴のページ位置の検証', () => {
  test.each([
    ['1ページ目', page1],
    ['2ページ目', page2],
    ['3ページ目', page3]
  ])('正しい保存値(%s)はそのまま使う', (_label, value) => {
    expect(parseWebhookPagination(value)).toEqual(value)
  })

  test.each([
    ['null', null],
    ['文字列', 'page2'],
    ['数値', 2],
    ['配列', []],
    ['空オブジェクト', {}],
    ['cursor が数値', { cursor: 10, previousCursors: [null] }],
    ['cursor が空文字', { cursor: '', previousCursors: [null] }],
    ['cursor が数字列でない', { cursor: 'abc', previousCursors: [null] }],
    ['cursor が21桁以上', { cursor: '1'.repeat(21), previousCursors: [null] }],
    ['cursor が無い', { previousCursors: [] }],
    ['previousCursors が無い', { cursor: null }],
    ['previousCursors が配列でない', { cursor: '10', previousCursors: 'null' }],
    ['previousCursors に数値が混ざる', { cursor: '10', previousCursors: [null, 5] }],
    ['previousCursors に数字列でない文字列が混ざる', { cursor: '10', previousCursors: [null, 'abc'] }],
    ['cursor があるのに戻り先が空', { cursor: '10', previousCursors: [] }],
    ['cursor が null なのに戻り先がある', { cursor: null, previousCursors: [null] }],
    ['戻り先の先頭が1ページ目(null)でない', { cursor: '10', previousCursors: ['5'] }],
    ['戻り先の途中に null がある', { cursor: '10', previousCursors: [null, null] }]
  ])('壊れた保存値(%s)は1ページ目に倒す', (_label, value) => {
    expect(parseWebhookPagination(value)).toEqual(INITIAL_WEBHOOK_PAGINATION)
  })

  test('次へ・前へで cursor と戻り先を1回で整合させて更新する', () => {
    const next = nextWebhookPagination(page1, CURSOR_10)
    expect(next).toEqual(page2)
    expect(nextWebhookPagination(next, CURSOR_5)).toEqual(page3)
    expect(previousWebhookPagination(page3)).toEqual(page2)
    expect(previousWebhookPagination(page2)).toEqual(page1)
    // 検証を通る値だけを作る。
    for (const value of [next, nextWebhookPagination(next, CURSOR_5), previousWebhookPagination(page3)]) {
      expect(parseWebhookPagination(value)).toEqual(value)
    }
  })

  test('1ページ目の前へは何も変えない', () => {
    expect(previousWebhookPagination(page1)).toBe(page1)
  })

  test('更新は元の値を書き換えない', () => {
    nextWebhookPagination(page2, CURSOR_5)
    previousWebhookPagination(page2)
    expect(page2).toEqual({ cursor: CURSOR_10, previousCursors: [null] })
  })
})

type AtomModule = typeof import('@/atoms/webhook-pagination-atom')

describe('Webhook受信履歴のページ位置の永続化 atom', () => {
  const key = 'biccame-admin-webhook-pagination'
  const session = new Map<string, string>()
  const local = new Map<string, string>()
  const fakeStorage = (data: Map<string, string>) => ({
    getItem: (name: string) => (data.has(name) ? String(data.get(name)) : null),
    setItem: (name: string, value: string) => data.set(name, value),
    removeItem: (name: string) => data.delete(name)
  })
  // 保存された JSON を読み戻す。未保存なら JSON として不正になり、テストが落ちる。
  const saved = () => JSON.parse(String(session.get(key)))
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

  const hadWindow = Reflect.has(globalThis, 'window')
  const originalWindow = Reflect.get(globalThis, 'window')
  beforeEach(() => {
    session.clear()
    local.clear()
    Reflect.set(globalThis, 'window', { sessionStorage: fakeStorage(session), localStorage: fakeStorage(local) })
  })
  afterEach(() => {
    if (hadWindow) Reflect.set(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  // getOnInit は atom の生成時(モジュール読込時)に保存値を読むので、テストごとに読み込み直して初期表示を再現する。
  let loads = 0
  const loadAtom = async () => {
    loads += 1
    const loaded: AtomModule = await import(`../workers/web/src/app/atoms/webhook-pagination-atom?load=${loads}`)
    return loaded.webhookPaginationAtom
  }

  test('保存が無ければ1ページ目', async () => {
    expect(createStore().get(await loadAtom())).toEqual(INITIAL_WEBHOOK_PAGINATION)
  })

  test('保存値を初期表示から読む(1ページ目を経由しない)', async () => {
    session.set(key, JSON.stringify(page3))
    expect(createStore().get(await loadAtom())).toEqual(page3)
  })

  test('書き込むと sessionStorage に保存され、読み込み直しても残る。localStorage は使わない', async () => {
    createStore().set(await loadAtom(), page2)
    expect(saved()).toEqual(page2)
    expect(local.size).toBe(0)
    expect(createStore().get(await loadAtom())).toEqual(page2)
  })

  test('関数形の更新で cursor と戻り先を一緒に保存する', async () => {
    const atom = await loadAtom()
    const store = createStore()
    store.set(atom, (previous) => nextWebhookPagination(previous, CURSOR_10))
    expect(store.get(atom)).toEqual(page2)
    expect(saved()).toEqual(page2)
    store.set(atom, previousWebhookPagination)
    expect(store.get(atom)).toEqual(page1)
    expect(saved()).toEqual(page1)
  })

  test.each([
    ['JSON として壊れている', '{"cursor":'],
    ['形が違う', JSON.stringify({ cursor: 10, previousCursors: [] })],
    ['整合しない', JSON.stringify({ cursor: '10', previousCursors: [] })],
    ['配列', '[]']
  ])('壊れた保存値(%s)は1ページ目に倒す', async (_label, raw) => {
    session.set(key, raw)
    expect(createStore().get(await loadAtom())).toEqual(INITIAL_WEBHOOK_PAGINATION)
  })

  test('sessionStorage が使えなくても落ちず、メモリ上で操作を続けられる', async () => {
    Reflect.set(globalThis, 'window', { sessionStorage: throwingStorage })
    const atom = await loadAtom()
    const store = createStore()
    expect(store.get(atom)).toEqual(INITIAL_WEBHOOK_PAGINATION)
    store.set(atom, page2)
    expect(store.get(atom)).toEqual(page2)
  })

  test('window が無い環境(SSR・テスト)でも1ページ目で動く', async () => {
    Reflect.deleteProperty(globalThis, 'window')
    const atom = await loadAtom()
    const store = createStore()
    expect(store.get(atom)).toEqual(INITIAL_WEBHOOK_PAGINATION)
    store.set(atom, page2)
    expect(store.get(atom)).toEqual(page2)
  })
})

/**
 * event-service の冪等性テスト。
 *
 * `@/lib/prisma` を mock.module で差し替えて、 createEvent が同一 UUID で 2 回呼ばれた際に
 * 2 度目は既存レコードを返し新規 create が走らないこと (= 冪等性) を確認する。
 *
 * NOTE: bun:test の mock.module はテストファイル全体に対してグローバルに適用されるため、
 *       本ファイルは event-service の冪等性確認に特化させる。
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Bindings } from '../../src/types/bindings'

// findUnique と create の呼ばれた回数を観測するためのカウンタ
let findUniqueCalls = 0
let createCalls = 0
let existingRow: unknown = null

const prismaMock = {
  event: {
    findUnique: async () => {
      findUniqueCalls++
      return existingRow
    },
    create: async (args: { data: { id: string } }) => {
      createCalls++
      // 作成後はその event が "存在する" 状態として記憶 (シンプルな in-memory mock)
      existingRow = {
        id: args.data.id,
        category: 'limited_card',
        title: 'mock',
        limitedQuantity: null,
        startDate: new Date('2026-01-01'),
        endDate: null,
        endedAt: null,
        isVerified: false,
        isPreliminary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        conditions: [],
        referenceUrls: [],
        stores: [],
        comments: []
      }
      return existingRow
    }
  }
}

mock.module('@/lib/prisma', () => ({
  getPrisma: () => prismaMock
}))

// mock を仕掛けた後に動的 import (静的 import だと mock 適用前に解決される)
const { createEvent } = await import('../../src/services/event-service')

const env = {} as Bindings

const baseEventRequest = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  category: 'limited_card' as const,
  title: 'テストイベント',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-01-31T00:00:00.000Z',
  endedAt: undefined,
  limitedQuantity: undefined,
  isVerified: false,
  isPreliminary: false,
  conditions: [{ uuid: '11111111-1111-1111-1111-111111111111', type: 'everyone' as const }],
  referenceUrls: [],
  stores: ['akiba' as const],
  shouldTweet: false
}

describe('createEvent — 冪等性', () => {
  beforeEach(() => {
    findUniqueCalls = 0
    createCalls = 0
    existingRow = null
  })

  test('初回呼び出しでは create が 1 回走る', async () => {
    await createEvent(env, baseEventRequest)
    expect(findUniqueCalls).toBe(1)
    expect(createCalls).toBe(1)
  })

  test('同一 UUID で 2 回呼んでも create は 1 回のみ', async () => {
    await createEvent(env, baseEventRequest)
    const callsAfterFirst = createCalls
    await createEvent(env, baseEventRequest)
    expect(createCalls).toBe(callsAfterFirst)
    expect(findUniqueCalls).toBe(2)
  })

  test('既存 event が存在する場合は findUnique の結果を transform して返す', async () => {
    // 1 回目で event を仕込む
    await createEvent(env, baseEventRequest)
    // 2 回目: 既存を返す
    const result = await createEvent(env, baseEventRequest)
    expect(result.uuid).toBe(baseEventRequest.uuid)
    expect(result.title).toBe('mock')
  })
})

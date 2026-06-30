/**
 * event-group-service の冪等性テスト。
 *
 * `@/lib/prisma` を mock.module で差し替えて、createEventGroup が同一 UUID で 2 回呼ばれた際に
 * 2 度目は既存レコードを返し新規 create が走らないこと (= 冪等性) を確認する。
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Bindings } from '../../src/types/bindings'

let findUniqueCalls = 0
let createCalls = 0
let existingRow: unknown = null

const prismaMock = {
  eventGroup: {
    findUnique: async () => {
      findUniqueCalls++
      return existingRow
    },
    create: async (args: { data: { id: string; title: string; sortOrder: number } }) => {
      createCalls++
      existingRow = {
        id: args.data.id,
        title: args.data.title,
        description: null,
        startDate: new Date('2026-06-30'),
        endDate: null,
        sortOrder: args.data.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { events: 0 }
      }
      return existingRow
    }
  }
}

mock.module('@/lib/prisma', () => ({
  getPrisma: () => prismaMock
}))

const { createEventGroup } = await import('../../src/services/event-group-service')

const env = {} as Bindings

const baseRequest = {
  uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: '11周年記念名刺',
  description: '11周年記念で全店舗で配布される名刺',
  startDate: '2026-06-30T00:00:00.000Z',
  endDate: undefined,
  sortOrder: 1
}

describe('createEventGroup — 冪等性', () => {
  beforeEach(() => {
    findUniqueCalls = 0
    createCalls = 0
    existingRow = null
  })

  test('初回呼び出しは create を実行する', async () => {
    const result = await createEventGroup(env, baseRequest)

    expect(findUniqueCalls).toBe(1)
    expect(createCalls).toBe(1)
    expect(result.uuid).toBe(baseRequest.uuid)
    expect(result.title).toBe(baseRequest.title)
    expect(result.eventCount).toBe(0)
  })

  test('同一 UUID で 2 回呼び出すと 2 度目は create が走らない', async () => {
    await createEventGroup(env, baseRequest)
    const second = await createEventGroup(env, baseRequest)

    expect(findUniqueCalls).toBe(2)
    expect(createCalls).toBe(1) // 2 回目は既存を返すので create は走らない
    expect(second.uuid).toBe(baseRequest.uuid)
  })
})

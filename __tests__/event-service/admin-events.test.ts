import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { PrismaClient } from '@/generated/prisma/client'
import * as prismaModule from '@/lib/prisma'
import { EVENT_LIST_SELECT, getAdminEvents, getEvents } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'
import { eventRow } from '../fixtures/event-announcement'

const env = {} as Bindings

const verifiedRow = { ...eventRow, id: '550e8400-e29b-41d4-a716-446655440001', title: '確認済み', isVerified: true }
const unverifiedRow = {
  ...eventRow,
  id: '550e8400-e29b-41d4-a716-446655440002',
  title: '未確認',
  isVerified: false
}
const rows = [verifiedRow, unverifiedRow]

// where.isVerified だけを解釈する findMany。 渡された引数は呼び出し履歴に残る。
const makeListPrisma = () => ({
  event: {
    findMany: mock(async (args: { where?: { isVerified?: boolean } }) =>
      rows.filter((row) => args.where?.isVerified === undefined || row.isVerified === args.where.isVerified)
    )
  }
})

let prisma: ReturnType<typeof makeListPrisma>
let prismaSpy: ReturnType<typeof spyOn>
beforeEach(() => {
  prisma = makeListPrisma()
  prismaSpy = spyOn(prismaModule, 'getPrisma').mockReturnValue(prisma as unknown as PrismaClient)
})
afterEach(() => prismaSpy.mockRestore())

describe('イベント一覧 — 確認状態', () => {
  test('getEvents は確認済みのイベントだけを返す', async () => {
    const events = await getEvents(env)
    expect(events.map((e) => e.uuid)).toEqual([verifiedRow.id])
    expect(events.every((e) => e.isVerified)).toBe(true)
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.event.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { isVerified: true } })
  })

  test('getAdminEvents は確認済みと未確認の両方を返す', async () => {
    const events = await getAdminEvents(env)
    expect(events.map((e) => e.uuid).sort()).toEqual([verifiedRow.id, unverifiedRow.id].sort())
    expect(events.filter((e) => !e.isVerified).map((e) => e.uuid)).toEqual([unverifiedRow.id])
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.event.findMany.mock.calls[0]?.[0]?.where).toBeUndefined()
  })

  test('どちらも同じ select と開始日降順で取得する', async () => {
    await getEvents(env)
    await getAdminEvents(env)
    const [publicArgs, adminArgs] = prisma.event.findMany.mock.calls.map(([args]) => args)
    expect(publicArgs).toMatchObject({ select: EVENT_LIST_SELECT, orderBy: { startDate: 'desc' } })
    expect(adminArgs).toMatchObject({ select: EVENT_LIST_SELECT, orderBy: { startDate: 'desc' } })
  })
})

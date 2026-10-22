import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { PrismaClient } from '@api/db/generated/prisma/client'
import * as prismaModule from '@api/db/prisma'
import { EVENT_LIST_SELECT, getAdminEvents, getAdminWebhookEvents, getEvents } from '@api/services/event-service'
import type { Bindings } from '@api/types/bindings'
import dayjs from 'dayjs'
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

type FindManyArgs = {
  where?: { isVerified?: boolean; id?: { in: string[] } }
  select?: unknown
  orderBy?: unknown
}

// select が ID だけの問い合わせ (並びを決める 1 回目) かどうか。
const isIdOnly = (args: FindManyArgs) => JSON.stringify(args.select) === JSON.stringify({ id: true })

// 確認状態と ID で絞り込み、渡された引数は呼び出し履歴に残す。
// ID だけの問い合わせには ID のみ、関連つきの本体の問い合わせには行全体を返す。
const makeListPrisma = () => ({
  event: {
    findMany: mock(async (args: FindManyArgs) => {
      const matched = rows.filter(
        (row) =>
          (args.where?.isVerified === undefined || row.isVerified === args.where.isVerified) &&
          (args.where?.id === undefined || args.where.id.in.includes(row.id))
      )
      return isIdOnly(args) ? matched.map(({ id }) => ({ id })) : matched
    })
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
    expect(prisma.event.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.event.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { isVerified: true } })
  })

  test('getAdminEvents は確認済みと未確認の両方を返す', async () => {
    const events = await getAdminEvents(env)
    expect(events.map((e) => e.uuid).sort()).toEqual([verifiedRow.id, unverifiedRow.id].sort())
    expect(events.filter((e) => !e.isVerified).map((e) => e.uuid)).toEqual([unverifiedRow.id])
    expect(prisma.event.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.event.findMany.mock.calls[0]?.[0]?.where).toBeUndefined()
  })

  test('Webhook由来IDだけをD1のバインド上限以内で取得し開始日降順に統合する', async () => {
    const registered = Array.from({ length: 129 }, (_, index) => ({
      ...verifiedRow,
      id: crypto.randomUUID(),
      startDate: dayjs('2026-01-01').add(index, 'day').toDate()
    }))
    prisma.event.findMany.mockImplementation(async (args) =>
      registered.filter((row) => args.where?.id?.in.includes(row.id))
    )
    const bindings = Object.assign(env, {
      DB: { prepare: () => ({ all: async () => ({ results: registered.map((row) => ({ id: row.id })) }) }) }
    })
    const events = await getAdminWebhookEvents(bindings)
    expect(events).toHaveLength(129)
    expect(prisma.event.findMany).toHaveBeenCalledTimes(3)
    expect(prisma.event.findMany.mock.calls.map(([args]) => args.where?.id?.in.length)).toEqual([50, 50, 29])
    expect(events.map((event) => event.uuid)).toEqual(registered.toReversed().map((row) => row.id))
  })

  test('どちらも ID だけを開始日降順で取り、関連つきの本体は同じ select で ID を分けて取得する', async () => {
    await getEvents(env)
    await getAdminEvents(env)
    const [publicIds, publicBody, adminIds, adminBody] = prisma.event.findMany.mock.calls.map(([args]) => args)
    expect(publicIds).toEqual({ where: { isVerified: true }, select: { id: true }, orderBy: { startDate: 'desc' } })
    expect(adminIds).toEqual({ where: undefined, select: { id: true }, orderBy: { startDate: 'desc' } })
    expect(publicBody).toEqual({ where: { id: { in: [verifiedRow.id] } }, select: EVENT_LIST_SELECT })
    expect(adminBody).toEqual({
      where: { id: { in: rows.map((row) => row.id) } },
      select: EVENT_LIST_SELECT
    })
  })

  test('ID だけの問い合わせが返した順に並べ、取得の間に消えたイベントは除く', async () => {
    const newer = { ...verifiedRow, id: crypto.randomUUID(), startDate: dayjs('2026-02-01').toDate() }
    const older = { ...verifiedRow, id: crypto.randomUUID(), startDate: dayjs('2026-01-01').toDate() }
    const vanished = crypto.randomUUID()
    prisma.event.findMany.mockImplementation(async (args) =>
      isIdOnly(args)
        ? [{ id: newer.id }, { id: vanished }, { id: older.id }]
        : [older, newer].filter((row) => args.where?.id?.in.includes(row.id))
    )
    const events = await getAdminEvents(env)
    expect(events.map((event) => event.uuid)).toEqual([newer.id, older.id])
  })

  test('100 件を超える一覧でも本体の問い合わせは 50 件ずつ逐次で、ID の問い合わせは 1 回', async () => {
    const many = Array.from({ length: 129 }, (_, index) => ({
      ...verifiedRow,
      id: crypto.randomUUID(),
      startDate: dayjs('2026-01-01').add(index, 'day').toDate()
    }))
    prisma.event.findMany.mockImplementation(async (args) =>
      isIdOnly(args)
        ? many.toReversed().map(({ id }) => ({ id }))
        : many.filter((row) => args.where?.id?.in.includes(row.id))
    )
    const events = await getAdminEvents(env)
    expect(events.map((event) => event.uuid)).toEqual(many.toReversed().map((row) => row.id))
    expect(prisma.event.findMany).toHaveBeenCalledTimes(4)
    expect(prisma.event.findMany.mock.calls.map(([args]) => args.where?.id?.in.length)).toEqual([undefined, 50, 50, 29])
  })
})

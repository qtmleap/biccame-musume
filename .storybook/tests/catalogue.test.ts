import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { discordDeliveryResultSchema } from '@biccame/shared/bot'
import { ChartsResponseSchema } from '@biccame/shared/event-detect/charts'
import {
  AccountsResponseSchema,
  EmulatedDetailResponseSchema,
  EmulatedResponseSchema,
  EventDetailResponseSchema,
  EventsResponseSchema,
  GapsResponseSchema,
  KeywordsResponseSchema,
  LabelResponseSchema,
  PostsResponseSchema,
  SummarySchema
} from '@biccame/shared/event-detect/viewer'
import { AdminBotStatusSchema } from '@biccame/shared/schemas/admin-bot.dto'
import { WebhookJobListSchema, WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import { adminResponses } from '../../workers/web/src/app/stories/admin-fixtures'
import coverage from '../catalogue/coverage.json'
import { inventory, sourceFiles } from '../catalogue/inventory'

test('every production route/component export has a catalogued meaningful story; support exports are classified', () => {
  const expected = inventory().flatMap(({ file, exports }) => exports.map(({ name, kind }) => ({ file, name, kind })))
  expect(coverage.entries.map(({ file, name, kind }) => ({ file, name, kind }))).toEqual(expected)
  for (const entry of coverage.entries) {
    if (entry.kind === 'component' || entry.kind === 'route')
      expect(entry.storyIds.length, `${entry.file}#${entry.name}`).toBeGreaterThan(0)
    else expect(entry.reason.length, `${entry.file}#${entry.name}`).toBeGreaterThan(0)
  }
})

test('aliased barrel re-exports retain the actual implementation story mapping', () => {
  for (const name of ['RouteResultCard', 'SelectedStoreList', 'StoreSelect']) {
    const barrel = coverage.entries.find(
      (entry) => entry.file === 'workers/web/src/app/components/route/index.ts' && entry.name === name
    )
    expect(barrel).toBeDefined()
    expect(barrel?.storyIds.length).toBeGreaterThan(0)
    expect(barrel?.reason).not.toContain('/@/')
  }
})

test('synthetic admin and local viewer responses satisfy their shared runtime contracts', () => {
  const contracts = [
    [AdminBotStatusSchema, adminResponses.getAdminBotStatus()],
    [AdminBotStatusSchema, adminResponses.checkAdminBotConnection()],
    [discordDeliveryResultSchema, adminResponses.testAdminBotNotification()],
    [WebhookJobListSchema, adminResponses.listAdminWebhookJobs()],
    [WebhookJobSchema, adminResponses.getAdminWebhookJob()],
    [WebhookJobSchema, adminResponses.retryAdminWebhookJob()],
    [WebhookJobSchema, adminResponses.resolveAdminWebhookJob()],
    [SummarySchema, adminResponses.getEventDetectSummary()],
    [AccountsResponseSchema, adminResponses.getEventDetectAccounts()],
    [ChartsResponseSchema, adminResponses.getEventDetectCharts()],
    [PostsResponseSchema, adminResponses.getEventDetectPosts()],
    [EventsResponseSchema, adminResponses.getEventDetectEvents()],
    [EventDetailResponseSchema, adminResponses.getEventDetectEvent()],
    [GapsResponseSchema, adminResponses.getEventDetectGaps()],
    [EmulatedResponseSchema, adminResponses.getEventDetectEmulated()],
    [EmulatedDetailResponseSchema, adminResponses.getEventDetectEmulatedEvent()],
    [KeywordsResponseSchema, adminResponses.getEventDetectKeywords()],
    [KeywordsResponseSchema, adminResponses.setEventDetectKeywords()],
    [LabelResponseSchema, adminResponses.setEventDetectLabel()],
    [LabelResponseSchema, adminResponses.deleteEventDetectLabel()]
  ] as const
  for (const [schema, response] of contracts) {
    const result = schema.safeParse(response)
    expect(result.success, result.success ? 'valid response' : result.error.message).toBe(true)
  }
})

test('source traversal preserves every real source file in stable order across opposite creation orders', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'storybook-inventory-order-'))
  try {
    const files = [...sourceFiles('workers/web/src/app/components'), ...sourceFiles('workers/web/src/app/routes')]
    const forward = join(temporary, 'forward')
    const reverse = join(temporary, 'reverse')
    for (const [root, ordered] of [
      [forward, files],
      [reverse, [...files].reverse()]
    ] as const)
      for (const file of ordered) {
        const target = join(root, file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, readFileSync(file))
      }
    const copiedFiles = (root: string) =>
      [
        ...sourceFiles(join(root, 'workers/web/src/app/components')),
        ...sourceFiles(join(root, 'workers/web/src/app/routes'))
      ].map((file) => relative(root, file))
    const first = copiedFiles(forward)
    const second = copiedFiles(reverse)
    expect([...first].sort()).toEqual([...files].sort())
    expect([...second].sort()).toEqual([...files].sort())
    for (const file of files) {
      expect(readFileSync(join(forward, file))).toEqual(readFileSync(file))
      expect(readFileSync(join(reverse, file))).toEqual(readFileSync(file))
    }
    expect(first).toEqual(second)
    expect(first).toEqual(files)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

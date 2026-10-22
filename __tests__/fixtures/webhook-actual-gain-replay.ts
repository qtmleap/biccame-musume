import { expect } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  detectionConfiguration,
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_MODEL_KEY,
  EVENT_DETECTION_THRESHOLDS_KEY
} from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { FieldThresholdsSchema } from '@biccame/shared/event-detect/detection'
import { DEFAULT_ITEM_COUNT_THRESHOLD } from '@biccame/shared/event-detect/extraction'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const JsonSchema = z.json()
type JsonValue = z.infer<typeof JsonSchema>
const sorted = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(sorted)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sorted(item)])
    )
  return value
}
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const bodyKey = (value: JsonValue) => sha(sorted(value))
const ExchangeSchema = z.object({
  stage: z.enum(['count', 'extract', 'judge']),
  requestFile: z.string().regex(/^[a-z0-9-]+\.json$/),
  responseFile: z.string().regex(/^[a-z0-9-]+\.json$/),
  requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  responseSha256: z.string().regex(/^[a-f0-9]{64}$/)
})
const ProfileSchema = z.object({
  model: z.literal('clef'),
  eventThreshold: z.literal(0.9),
  choiceThreshold: z.literal(0.9),
  ignoreThreshold: z.literal(0.5),
  fieldThresholds: FieldThresholdsSchema
})
const IndexSchema = z.object({
  id: z.string().nonempty(),
  sourceArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceArtifact: z.string().nonempty(),
  post: DetectPostSchema,
  profile: ProfileSchema,
  exchanges: z.array(ExchangeSchema).nonempty(),
  expected: z.object({
    candidates: z.number().int().positive(),
    registered: z.literal(false),
    discovery: z.literal('detected'),
    auditStatus: z.string().nonempty(),
    actions: z.array(z.enum(['create', 'update', 'end', 'review', 'none'])).nonempty()
  })
})

export const loadActualGainReplay = async (name: string) => {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid replay fixture name')
  const directory = resolve('__tests__/fixtures/webhook-actual-gains', name)
  const index = IndexSchema.safeParse(JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8')))
  if (!index.success) throw new Error(`Invalid replay fixture index: ${name}`)
  const entries = await Promise.all(
    index.data.exchanges.map(async (entry) => {
      const request = JsonSchema.safeParse(JSON.parse(await readFile(resolve(directory, entry.requestFile), 'utf8')))
      const response = JsonSchema.safeParse(JSON.parse(await readFile(resolve(directory, entry.responseFile), 'utf8')))
      if (!request.success || !response.success) throw new Error('Invalid replay exchange JSON')
      if (sha(request.data) !== entry.requestSha256 || sha(response.data) !== entry.responseSha256)
        throw new Error('Replay source hash mismatch')
      return { ...entry, request: request.data, response: response.data, used: 0 }
    })
  )
  const take = (stage: 'count' | 'extract' | 'judge', request: JsonValue) => {
    const key = bodyKey(request)
    const found = entries.find((entry) => entry.stage === stage && entry.used === 0 && bodyKey(entry.request) === key)
    if (found === undefined) throw new Error(`Unexpected actual replay request: ${stage}:${key}`)
    // オブジェクトのキー順だけを正規化し、本文・モデル・配列・全値を実保存と照合する。
    expect(sorted(request)).toEqual(sorted(found.request))
    const actualClef = ClefRequestSchema.safeParse(request)
    const recordedClef = ClefRequestSchema.safeParse(found.request)
    if (actualClef.success && recordedClef.success)
      expect(Object.keys(actualClef.data.questions)).toEqual(Object.keys(recordedClef.data.questions))
    found.used += 1
    return found.response
  }
  return {
    ...index.data,
    aiRun: async (model: string, raw: unknown) => {
      const request = ClefRequestSchema.safeParse(raw)
      if (!request.success) throw new Error('Invalid actual replay Clef request')
      expect(model).toBe(`@cf/cloudflare/${request.data.model}`)
      const response = ClefResponseSchema.safeParse(
        take(request.data.questions.distribution_item_count === undefined ? 'judge' : 'count', request.data)
      )
      if (!response.success) throw new Error('Invalid actual replay Clef response')
      return response.data
    },
    extractionFetcher: async (_url: string, init: RequestInit) => {
      if (typeof init.body !== 'string') throw new Error('Replay extraction body is missing')
      const request = JsonSchema.safeParse(JSON.parse(init.body))
      if (!request.success) throw new Error('Invalid replay extraction request')
      return new Response(JSON.stringify(take('extract', request.data)), {
        headers: { 'Content-Type': 'application/json' }
      })
    },
    assertComplete: () => expect(entries.map((entry) => entry.used)).toEqual(entries.map(() => 1))
  }
}

export const configureActualGainProfile = async (env: Bindings, profile: z.infer<typeof ProfileSchema>) => {
  await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, profile.model)
  await env.BICCAME_MUSUME_EVENTS.put(
    EVENT_DETECTION_THRESHOLDS_KEY,
    JSON.stringify({
      eventThreshold: profile.eventThreshold,
      choiceThreshold: profile.choiceThreshold,
      ignoreThreshold: profile.ignoreThreshold
    })
  )
  await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(profile.fieldThresholds))
  // 件数監査のしきい値は凍結プロファイルの外にあり、既定値のまま使われる。
  expect(await detectionConfiguration(env)).toEqual({ ...profile, itemCountThreshold: DEFAULT_ITEM_COUNT_THRESHOLD })
  expect(profile.fieldThresholds.category).toBe(0.85)
  expect(profile.fieldThresholds.status).toBe(0.8)
  for (const [key, value] of Object.entries(profile.fieldThresholds))
    if (key !== 'category' && key !== 'status') expect(value).toBe(0.9)
}

export const migrateActualGainDatabase = async (db: D1Database) => {
  const directories = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const directory of directories) {
    const sql = await readFile(`prisma/migrations/${directory}/migration.sql`, 'utf8')
    await db.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
  }
}

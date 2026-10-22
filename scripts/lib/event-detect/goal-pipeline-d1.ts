import { Database } from 'bun:sqlite'
import { resolve, sep } from 'node:path'
import { z } from 'zod'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import type { BenchmarkCase } from './benchmark-schema'
import { goalHash } from './goal-pipeline-module'

const parentSchema = z.object({
  post_id: z.string().nonempty(),
  post_json: z.string().nonempty(),
  status: z.string().nonempty(),
  extraction_json: z.union([z.string(), z.null()]),
  question_version: z.union([z.string(), z.null()]),
  event_id: z.union([z.string(), z.null()])
})
const childSchema = z.object({
  event_uuid: z.string().nonempty(),
  item: z.string().nonempty(),
  status: z.string().nonempty(),
  post_json: z.string().nonempty(),
  question_version: z.union([z.string(), z.null()]),
  event_id: z.union([z.string(), z.null()])
})
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    )
  return value
}

// 旧モデルの判断は正解ラベルにしない。保存状態・入力粒度の照合だけをread-onlyで行う。
export const readGoalD1References = (path: string, cases: BenchmarkCase[]) => {
  const file = resolve(path)
  if (!file.startsWith(resolve('.wrangler/state') + sep) || !file.endsWith('.sqlite'))
    throw new Error('Only the existing local D1 database may be inspected')
  const database = new Database(file, { readonly: true, strict: true })
  try {
    const parent = database.query(
      'SELECT post_id,post_json,status,extraction_json,question_version,event_id FROM webhook_event_jobs WHERE post_id=?'
    )
    const children = database.query(
      'SELECT event_uuid,item,status,post_json,question_version,event_id FROM webhook_event_candidates WHERE post_id=? ORDER BY created_at,event_uuid'
    )
    const rows = cases.map((sample) => {
      const value: unknown = parent.get(sample.post.id)
      if (value === null) return { id: sample.id, postId: sample.post.id, found: false }
      const parsed = parentSchema.safeParse(value)
      if (!parsed.success) throw new Error('Invalid local webhook reference')
      const stored = DetectPostSchema.safeParse(JSON.parse(parsed.data.post_json))
      if (!stored.success) throw new Error('Invalid stored local post')
      const candidates = z.array(childSchema).safeParse(children.all(sample.post.id))
      if (!candidates.success) throw new Error('Invalid stored candidate reference')
      const exact = goalHash(canonical(stored.data)) === goalHash(canonical(sample.post))
      return {
        id: sample.id,
        postId: sample.post.id,
        found: true,
        inputParity: exact ? 'exact' : stored.data.text === sample.post.text ? 'metadata-diff' : 'text-diff',
        currentInputHash: goalHash(canonical(sample.post)),
        storedInputHash: goalHash(canonical(stored.data)),
        oldStatus: parsed.data.status,
        oldVersion: parsed.data.question_version,
        oldEventId: parsed.data.event_id,
        oldExtraction: parsed.data.extraction_json === null ? null : JSON.parse(parsed.data.extraction_json),
        candidates: candidates.data.map((candidate) => ({
          item: candidate.item,
          oldStatus: candidate.status,
          oldVersion: candidate.question_version,
          linkedEventId: candidate.event_id,
          focusedInput: JSON.parse(candidate.post_json)
        })),
        note: 'Historical processing reference, not a ground-truth label or a new-model result'
      }
    })
    return { cases: cases.length, found: rows.filter((row) => row.found).length, rows }
  } finally {
    database.close()
  }
}

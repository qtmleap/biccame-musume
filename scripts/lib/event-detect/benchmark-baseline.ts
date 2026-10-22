import { Database } from 'bun:sqlite'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { DetectionResultSchema } from '@biccame/shared/event-detect/detection'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const rowSchema = z.object({
  postJson: z.string().nonempty(),
  resultJson: z.string().nonempty(),
  answersJson: z.string().nonempty(),
  requestsJson: z.string().nonempty()
})
const snapshotSchema = z.object({
  questionVersion: z.string().nonempty(),
  requests: z.array(ClefRequestSchema).nonempty()
})
const baselineSchema = z.object({
  post: DetectPostSchema,
  decision: DetectionResultSchema,
  response: ClefResponseSchema,
  snapshot: snapshotSchema
})

export const readBenchmarkBaselineSnapshot = async (path: string) => {
  const parsed = baselineSchema.safeParse(await Bun.file(path).json())
  if (!parsed.success) throw new Error('Invalid frozen benchmark baseline')
  return parsed.data
}

// 指定投稿だけを読み、履歴・判定結果・イベントには書き込まない。
export const readBenchmarkBaseline = (path: string, postId: string) => {
  const database = new Database(path, { readonly: true })
  try {
    const rows = database
      .query(`SELECT post_json AS postJson,result_json AS resultJson,answers_json AS answersJson,
        requests_json AS requestsJson FROM webhook_event_candidates WHERE post_id=? ORDER BY event_uuid`)
      .all(postId)
    if (rows.length !== 1) throw new Error('Benchmark baseline requires exactly one saved candidate')
    const row = rowSchema.safeParse(rows[0])
    if (!row.success) throw new Error('Saved benchmark baseline is incomplete')
    const post = DetectPostSchema.safeParse(JSON.parse(row.data.postJson))
    const result = DetectionResultSchema.safeParse(JSON.parse(row.data.resultJson))
    const response = ClefResponseSchema.safeParse({ answers: JSON.parse(row.data.answersJson) })
    const snapshot = snapshotSchema.safeParse(JSON.parse(row.data.requestsJson))
    if (!post.success || !result.success || !response.success || !snapshot.success)
      throw new Error('Invalid saved benchmark baseline')
    return { post: post.data, decision: result.data, response: response.data, snapshot: snapshot.data }
  } finally {
    database.close()
  }
}

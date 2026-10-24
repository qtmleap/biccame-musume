import { Database } from 'bun:sqlite'
import { DetectionResultSchema } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import type { BenchmarkCase } from './benchmark-schema'

const rowSchema = z.object({
  status: z.string().nonempty(),
  confidence: z.number().nullable(),
  questionVersion: z.string().nonempty().nullable(),
  resultJson: z.string().nonempty().nullable()
})

// 旧保存結果は版と対象範囲が混在するため、新版との対照実験とは呼ばない。
export const readBenchmarkCohortBaseline = (path: string, cases: BenchmarkCase[]) => {
  const database = new Database(path, { readonly: true })
  try {
    const rows = cases.map((sample) => {
      const raw: unknown = database
        .query(
          'SELECT status,confidence,question_version AS questionVersion,result_json AS resultJson FROM webhook_event_jobs WHERE post_id=?'
        )
        .get(sample.post.id)
      const row = rowSchema.safeParse(raw)
      if (!row.success)
        return { id: sample.id, expected: sample.expected.isEvent, status: 'missing', version: null, prediction: null }
      const parsed =
        row.data.resultJson === null ? null : DetectionResultSchema.safeParse(JSON.parse(row.data.resultJson))
      const status = parsed?.success ? parsed.data.status : row.data.status
      const prediction = status === 'registered' || status === 'register' ? true : status === 'ignored' ? false : null
      return { id: sample.id, expected: sample.expected.isEvent, status, version: row.data.questionVersion, prediction }
    })
    const versions = [...new Set(rows.flatMap((row) => (row.version === null ? [] : [row.version])))].sort()
    const tp = rows.filter((row) => row.expected && row.prediction === true).length
    const tn = rows.filter((row) => !row.expected && row.prediction === false).length
    const fp = rows.filter((row) => !row.expected && row.prediction === true).length
    const positive = rows.filter((row) => row.expected).length
    return {
      mode: 'historical-pipeline-context',
      total: rows.length,
      versions,
      tp,
      tn,
      fp,
      fn: positive - tp,
      abstained: rows.filter((row) => row.prediction === null).length,
      missing: rows.filter((row) => row.status === 'missing').length,
      statusCounts: Object.fromEntries(
        [...new Set(rows.map((row) => row.status))]
          .sort()
          .map((status) => [status, rows.filter((row) => row.status === status).length])
      ),
      rows,
      note: 'Historical versions, extraction scopes, thresholds and decision rules differ. This is not a paired live prompt-only accuracy comparison.'
    }
  } finally {
    database.close()
  }
}

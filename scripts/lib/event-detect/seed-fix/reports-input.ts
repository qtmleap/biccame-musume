import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'

/** seed --apply が書いたレポートのうち、対応付けに使う項目だけ */
const AppliedReportSchema = z.object({
  generatedAt: z.string().nonempty(),
  events: z.array(
    z.object({
      emulatedId: z.string().nonempty(),
      store: z.string().nonempty(),
      startDate: z.string().nonempty(),
      title: z.string().nonempty()
    })
  )
})

/** レポートの 1 行。generatedAt は seed がその行を INSERT した時刻（D1 の created_at と同じ） */
export type ReportEntry = {
  emulatedId: string
  store: string
  startDate: string
  title: string
  generatedAt: string
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** seed --apply が書いたレポート（--report の出力）を読む。無い・形が合わないときは止まる */
export const readAppliedReports = async (paths: readonly string[]): Promise<ReportEntry[]> => {
  const reports = await Promise.all(
    paths.map(async (path) => {
      if (!existsSync(path)) throw new Error(`${path}: not found`)
      const parsed = AppliedReportSchema.safeParse(parseJson(await readFile(path, 'utf8')))
      if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
      return parsed.data.events.map((entry): ReportEntry => ({ ...entry, generatedAt: parsed.data.generatedAt }))
    })
  )
  return reports.flat()
}

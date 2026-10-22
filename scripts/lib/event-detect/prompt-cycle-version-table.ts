import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { z } from 'zod'
import { BenchmarkCaseSchema } from './benchmark-schema'
import { promptCycleHash } from './prompt-cycle-evaluator'

const manifestSchema = z.object({
  evaluator: z.object({
    version: z.string().nonempty(),
    thresholds: z.object({
      eventThreshold: z.number(),
      ignoreThreshold: z.number(),
      fieldThreshold: z.number()
    })
  }),
  cases: z.array(BenchmarkCaseSchema)
})
const read = async (directory: string, file: string): Promise<unknown> =>
  JSON.parse(await readFile(join(directory, file), 'utf8'))

// 旧fnは保留込みのpositiveMisses。hardFNと保留を分離して同じ集合を比較する。
export const buildPromptCycleVersionTable = async (directories: string[]) => {
  if (directories.length === 0) throw new Error('Version table requires an arm')
  const manifests = await Promise.all(
    directories.map(async (directory) => {
      const parsed = manifestSchema.safeParse(await read(directory, 'manifest.json'))
      if (!parsed.success) throw new Error('Invalid version table manifest')
      return parsed.data
    })
  )
  const first = manifests[0]
  if (first === undefined) throw new Error('Missing version table baseline')
  if (
    manifests.some(
      (manifest) =>
        promptCycleHash(manifest.cases) !== promptCycleHash(first.cases) ||
        promptCycleHash(manifest.evaluator.thresholds) !== promptCycleHash(first.evaluator.thresholds)
    )
  )
    throw new Error('Version table requires identical cases, labels and thresholds')
  return await Promise.all(
    directories.map(async (directory, index) => {
      const manifest = manifests[index]
      if (manifest === undefined) throw new Error('Missing version manifest')
      const counts = { tp: 0, fp: 0, hardFN: 0, tn: 0, positiveHold: 0, negativeHold: 0, errors: 0 }
      for (const sample of manifest.cases) {
        const saved = z
          .object({
            id: z.string().nonempty(),
            response: z.union([ClefResponseSchema, z.null()]),
            error: z.union([z.string().nonempty(), z.null()])
          })
          .safeParse(await read(directory, `${sample.id}.json`))
        if (!saved.success || saved.data.id !== sample.id) throw new Error('Invalid version table checkpoint')
        const answer = saved.data.response?.answers.is_event
        if (saved.data.error !== null || answer?.type !== 'noul') {
          counts.errors += 1
          continue
        }
        if (answer.noul >= manifest.evaluator.thresholds.eventThreshold) {
          if (sample.expected.isEvent) counts.tp += 1
          else counts.fp += 1
        } else if (answer.noul < manifest.evaluator.thresholds.ignoreThreshold) {
          if (sample.expected.isEvent) counts.hardFN += 1
          else counts.tn += 1
        } else if (sample.expected.isEvent) counts.positiveHold += 1
        else counts.negativeHold += 1
      }
      const positives = manifest.cases.filter((sample) => sample.expected.isEvent).length
      const positiveMisses = positives - counts.tp
      return {
        version: manifest.evaluator.version,
        cases: manifest.cases.length,
        positives,
        ...counts,
        positiveMisses,
        legacyFn: positiveMisses,
        effectiveRecall: positives === 0 ? null : counts.tp / positives
      }
    })
  )
}

export const writePromptCycleVersionTable = async (directories: string[], markdownPath: string, csvPath: string) => {
  const rows = await buildPromptCycleVersionTable(directories)
  const header =
    '| Version | TP | FP | hard FN | TN | 陽性保留 | 陰性保留 | positiveMisses（旧fn） | effective recall | errors |'
  const markdown = [
    '# 同一開発集合のプロンプト版別比較',
    '',
    'hard FNは明確な陰性判定、保留は別欄。旧fnは保留・エラー込みのpositiveMissesとして保持する。effective recallは全陽性を分母にし、保留を除外しない。',
    '',
    header,
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map(
      (row) =>
        `| ${row.version} | ${row.tp} | ${row.fp} | ${row.hardFN} | ${row.tn} | ${row.positiveHold} | ${row.negativeHold} | ${row.positiveMisses} | ${row.effectiveRecall === null ? '—' : `${(row.effectiveRecall * 100).toFixed(2)}%`} | ${row.errors} |`
    ),
    '',
    'これは暫定注釈の開発集合。final holdoutの成績や採用承認ではない。',
    ''
  ].join('\n')
  const csv = [
    'version,cases,positives,tp,fp,hard_fn,tn,positive_hold,negative_hold,positive_misses,legacy_fn,effective_recall,errors',
    ...rows.map((row) =>
      [
        row.version,
        row.cases,
        row.positives,
        row.tp,
        row.fp,
        row.hardFN,
        row.tn,
        row.positiveHold,
        row.negativeHold,
        row.positiveMisses,
        row.legacyFn,
        row.effectiveRecall === null ? '' : row.effectiveRecall,
        row.errors
      ].join(',')
    ),
    ''
  ].join('\n')
  await writeFile(markdownPath, markdown, { flag: 'wx', mode: 0o600 })
  await writeFile(csvPath, csv, { flag: 'wx', mode: 0o600 })
  return rows
}

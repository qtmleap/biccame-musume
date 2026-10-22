import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadGoalCorpus } from './goal-pipeline-corpus'
import {
  auditExpandedCorpus,
  type CorpusProfile,
  D1_ANCHORED_PROFILE,
  EXPANDED_DATASET_REVISION,
  EXPANDED_PROFILE,
  ExpandedProvenanceSchema,
  type PriorCaseRow,
  RawCaseRowsSchema
} from './goal-pipeline-expanded-audit'
import { loadAnnotatedGoalCorpus, selectAnnotatedGoalCohort } from './goal-pipeline-goal-corpus'

export const PRIOR_CORPUS_DIRECTORY = 'scripts/data/event-detection-benchmark'
export const EXPANDED_CORPUS_DIRECTORY = `${PRIOR_CORPUS_DIRECTORY}/expanded-v2`
export const D1_ANCHORED_CORPUS_DIRECTORY = `${PRIOR_CORPUS_DIRECTORY}/d1-anchored-v1`

// 既存のA〜F350件とgoal236件。新規コーパスとの重複を見る比較対象で、中身は一切変更しない。
export const loadPriorCorpus = async (directory = PRIOR_CORPUS_DIRECTORY): Promise<PriorCaseRow[]> => {
  const legacy = await loadGoalCorpus(directory)
  const goal = await loadAnnotatedGoalCorpus(directory)
  return [...legacy.cases, ...goal.cases].map((sample) => ({
    id: sample.id,
    postId: sample.post.id,
    text: sample.post.text,
    group: sample.group
  }))
}

const readProvenance = async (directory: string) => {
  const raw = await readFile(join(directory, 'provenance.json'), 'utf8').catch(() => null)
  if (raw === null) throw new Error('Expanded corpus provenance.json is missing')
  const parsed = ExpandedProvenanceSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error('Invalid expanded corpus provenance')
  return parsed.data
}

// 凍結済みexpanded-v2も重複検査の比較対象に含める。内容は読むだけで変更しない。
export const loadPriorWithExpanded = async (priorDirectory = PRIOR_CORPUS_DIRECTORY): Promise<PriorCaseRow[]> => {
  const expanded = await loadAnnotatedGoalCorpus(`${priorDirectory}/expanded-v2`)
  const rows = expanded.cases.map((sample) => ({
    id: sample.id,
    postId: sample.post.id,
    text: sample.post.text,
    group: sample.group
  }))
  return [...(await loadPriorCorpus(priorDirectory)), ...rows]
}

const readExpanded = async (
  directory: string,
  priorDirectory: string,
  profile: CorpusProfile,
  withExpandedPrior: boolean
) => {
  if ((await readdir(directory).catch(() => null)) === null) throw new Error('Expanded corpus directory is missing')
  const corpus = await loadAnnotatedGoalCorpus(directory)
  const provenance = await readProvenance(directory)
  const rows = RawCaseRowsSchema.safeParse(corpus.rows)
  if (!rows.success) throw new Error('Invalid expanded corpus rows')
  const issues = auditExpandedCorpus({
    cases: corpus.cases,
    rows: rows.data,
    prior: withExpandedPrior ? await loadPriorWithExpanded(priorDirectory) : await loadPriorCorpus(priorDirectory),
    provenance,
    profile
  })
  return { corpus, provenance, issues }
}

// 問題を全件返す検査用の入口。CLIの読込は同じ検査を通し、1件でも問題があれば拒否する。
export const expandedCorpusIssues = async (
  directory = EXPANDED_CORPUS_DIRECTORY,
  priorDirectory = PRIOR_CORPUS_DIRECTORY,
  profile: CorpusProfile = EXPANDED_PROFILE,
  withExpandedPrior = false
) => (await readExpanded(directory, priorDirectory, profile, withExpandedPrior)).issues

// D1登録イベント起点セット。既存586件に加えてexpanded-v2の200件とも重複しないことを同じ検査で確かめる。
export const d1AnchoredCorpusIssues = async (
  directory = D1_ANCHORED_CORPUS_DIRECTORY,
  priorDirectory = PRIOR_CORPUS_DIRECTORY
) => expandedCorpusIssues(directory, priorDirectory, D1_ANCHORED_PROFILE, true)

// 巨大な原archiveやローカルD1は読まず、小さなprovenanceと旧コーパスとの照合だけで機械検証する。
export const loadExpandedGoalCorpus = async (
  directory = EXPANDED_CORPUS_DIRECTORY,
  priorDirectory = PRIOR_CORPUS_DIRECTORY
) => {
  const { corpus, provenance, issues } = await readExpanded(directory, priorDirectory, EXPANDED_PROFILE, false)
  if (issues.length > 0)
    throw new Error(`Invalid expanded corpus: ${issues.length} issues, first: ${issues.slice(0, 8).join(' | ')}`)
  return { ...corpus, provenance }
}

export type ExpandedCorpus = Awaited<ReturnType<typeof loadExpandedGoalCorpus>>

// 月×アカウントで陽性と陰性が揃うため、実在する組の数が選べる最大の偶数件になる。
export const expandedDefaultSize = (corpus: ExpandedCorpus) =>
  corpus.cases.filter((sample) => sample.expected.isEvent).length * 2

// 選定の仕組みは旧goalと同じで、datasetラベルだけ別revisionにする。凍結済み旧cohortには影響しない。
export const selectExpandedGoalCohort = (corpus: ExpandedCorpus, size: number, seed: string) => {
  const selected = selectAnnotatedGoalCohort(corpus.cases, size, seed, EXPANDED_DATASET_REVISION)
  return {
    ...selected,
    selection: {
      ...selected.selection,
      corpus: {
        annotationsSha256: corpus.provenance.annotationsSha256,
        sourceRecordsSha256: corpus.provenance.sourceRecordsSha256,
        priorCorpusCases: corpus.provenance.priorCorpusCases
      }
    }
  }
}

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  expandedCorpusIssues,
  expandedDefaultSize,
  loadExpandedGoalCorpus,
  loadPriorCorpus
} from '../scripts/lib/event-detect/goal-pipeline-expanded-corpus'
import {
  type FixtureRow,
  fixtureProvenance,
  fixtureRows,
  patchRow,
  withText,
  writeExpandedFixture
} from './fixtures/expanded-corpus'

const directories: string[] = []
afterAll(() => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))))

const PRIOR = 586
// 行を書き出し、provenanceは行から再計算する(digest検査以外の欠陥を単独で検出させるため)。
const issuesOf = async (rows: FixtureRow[], provenance = fixtureProvenance(rows, PRIOR)) => {
  const directory = await mkdtemp(join(tmpdir(), 'expanded-corpus-'))
  directories.push(directory)
  await writeExpandedFixture(directory, rows, provenance)
  return expandedCorpusIssues(directory)
}
const base = fixtureRows(6)
const replaceAt = (rows: FixtureRow[], index: number, row: FixtureRow) =>
  rows.map((item, at) => (at === index ? row : item))

describe('fixture corpus', () => {
  test('a consistent balanced fixture has no issues and loads with its real size', async () => {
    expect(await issuesOf(base)).toEqual([])
    const directory = await mkdtemp(join(tmpdir(), 'expanded-corpus-'))
    directories.push(directory)
    await writeExpandedFixture(directory, base, fixtureProvenance(base, PRIOR))
    const corpus = await loadExpandedGoalCorpus(directory)
    expect(corpus.cases).toHaveLength(12)
    expect(expandedDefaultSize(corpus)).toBe(12)
    expect(corpus.cases.filter((sample) => sample.expected.isEvent)).toHaveLength(6)
  })

  test('the prior corpus the audit compares against is the 586 existing cases', async () => {
    const prior = await loadPriorCorpus()
    expect(prior).toHaveLength(PRIOR)
    expect(new Set(prior.map((row) => row.id)).size).toBe(PRIOR)
  })

  test('missing directory and missing provenance are rejected instead of silently loading nothing', async () => {
    const missing = join(tmpdir(), 'expanded-corpus-does-not-exist')
    await expect(loadExpandedGoalCorpus(missing)).rejects.toThrow('directory is missing')
    const directory = await mkdtemp(join(tmpdir(), 'expanded-corpus-'))
    directories.push(directory)
    await writeExpandedFixture(directory, base, fixtureProvenance(base, PRIOR))
    await rm(join(directory, 'provenance.json'))
    await expect(loadExpandedGoalCorpus(directory)).rejects.toThrow('provenance.json is missing')
  })
})

describe('label and evidence defects', () => {
  const positive = base[0]
  const negative = base[1]
  if (positive === undefined || negative === undefined) throw new Error('fixture rows are missing')

  test('evidence that is not a verbatim substring of the post is rejected', async () => {
    const stage = { ...Object(positive.stageGold), items: [{ item: '限定配布物', evidence: ['本文にない根拠'] }] }
    const issues = await issuesOf(replaceAt(base, 0, patchRow(positive, { stageGold: stage })))
    expect(issues.some((issue) => issue.includes('evidence is not in the post'))).toBe(true)
  })

  test('a misspelled gold key is reported instead of silently vanishing from scoring', async () => {
    const expected = { ...Object(positive.expected), stors: ['kawasaki'] }
    const issues = await issuesOf(replaceAt(base, 0, patchRow(positive, { expected })))
    expect(issues).toContain(`${String(positive.id)}: unknown field $.expected.stors`)
  })

  test('a field that is neither confirmed nor listed as unannotated is rejected', async () => {
    const stage = { ...Object(positive.stageGold), unannotatedFields: ['conditions', 'startDate', 'category'] }
    const issues = await issuesOf(replaceAt(base, 0, patchRow(positive, { stageGold: stage })))
    expect(issues.some((issue) => issue.includes('category must be exactly one of confirmed or unannotated'))).toBe(
      true
    )
  })

  test('ready registration requires a new action and every field confirmed', async () => {
    const odd = base[2]
    if (odd === undefined) throw new Error('fixture rows are missing')
    const stage = { ...Object(odd.stageGold), registration: 'ready' }
    const issues = await issuesOf(replaceAt(base, 2, patchRow(odd, { stageGold: stage })))
    expect(issues.some((issue) => issue.includes('ready registration needs'))).toBe(true)
  })

  test('negatives that carry item evidence or an event action contradict their label', async () => {
    const stage = { ...Object(negative.stageGold), action: 'new', items: [{ item: 'x', evidence: ['営業'] }] }
    const issues = await issuesOf(replaceAt(base, 1, patchRow(negative, { stageGold: stage })))
    expect(issues.some((issue) => issue.includes('isEvent and stage action disagree'))).toBe(true)
    expect(issues.some((issue) => issue.includes('negative has items'))).toBe(true)
  })

  test('case ids, tags, observed D1 diagnostics and the status label are pinned', async () => {
    const renamed = patchRow(positive, { id: 'goal-positive-1', tags: ['goal-pipeline'] })
    const diagnostics = patchRow(negative, {
      observedD1: { ...Object(negative.observedD1), job: { id: 'job-1' } },
      expected: { ...Object(negative.expected), status: 'ignored' }
    })
    const issues = await issuesOf(replaceAt(replaceAt(base, 0, renamed), 1, diagnostics))
    expect(issues.some((issue) => issue.includes('id must be expanded-v2-<label>-<postId>'))).toBe(true)
    expect(issues.some((issue) => issue.includes('missing tag expanded-v2'))).toBe(true)
    expect(issues.some((issue) => issue.includes('observed D1 diagnostics must not carry jobs or candidates'))).toBe(
      true
    )
    expect(issues.some((issue) => issue.includes('status must stay unannotated'))).toBe(true)
  })
})

describe('matching and independence', () => {
  test('a month/account bucket with an unmatched positive is rejected', async () => {
    const issues = await issuesOf(base.filter((_, index) => index !== 1))
    expect(issues.some((issue) => issue.includes('unmatched month/account bucket'))).toBe(true)
  })

  test('a text copied from the prior corpus is rejected as an overlap and a near duplicate', async () => {
    const prior = await loadPriorCorpus()
    const copied = prior[0]
    const negative = base[1]
    if (copied === undefined || negative === undefined) throw new Error('fixture rows are missing')
    const issues = await issuesOf(replaceAt(base, 1, withText(negative, copied.text)))
    expect(issues.some((issue) => issue.includes('normalized text overlaps the prior corpus'))).toBe(true)
    expect(issues.some((issue) => issue.includes(`near duplicate of ${copied.id}`))).toBe(true)
  })

  test('two new cases that differ by one character are rejected as near duplicates of each other', async () => {
    const first = base[1]
    const second = base[3]
    if (first === undefined || second === undefined) throw new Error('fixture rows are missing')
    const text = String(Object(first.post).text)
    const issues = await issuesOf(replaceAt(base, 3, withText(second, `${text}。`)))
    expect(issues.some((issue) => issue.includes('near duplicate of'))).toBe(true)
  })
})

describe('provenance', () => {
  test('annotations that change without a new digest are detected', async () => {
    const positive = base[0]
    if (positive === undefined) throw new Error('fixture rows are missing')
    const provenance = fixtureProvenance(base, PRIOR)
    const edited = replaceAt(base, 0, patchRow(positive, { rationale: '後から書き換えた根拠' }))
    expect(await issuesOf(edited, provenance)).toContain('annotations digest mismatch')
  })

  test('source records that change without a new digest are detected', async () => {
    const provenance = fixtureProvenance(base, PRIOR)
    const row = base[0]
    if (row === undefined) throw new Error('fixture rows are missing')
    const moved = patchRow(row, { provenance: { ...Object(row.provenance), line: 99 } })
    expect(await issuesOf(replaceAt(base, 0, moved), provenance)).toContain('source records digest mismatch')
  })

  test('a post whose text hash or full-post hash disagrees with its provenance is rejected', async () => {
    const row = base[0]
    if (row === undefined) throw new Error('fixture rows are missing')
    const wrongHashes = patchRow(row, { provenance: { ...Object(row.provenance), textSha256: '0'.repeat(64) } })
    const issues = await issuesOf(replaceAt(base, 0, wrongHashes))
    expect(issues.some((issue) => issue.includes('text provenance hash mismatch'))).toBe(true)
  })

  test('counts that do not add up to the files are rejected', async () => {
    const provenance = {
      ...fixtureProvenance(base, PRIOR),
      cases: 14,
      positive: 8,
      negative: 6,
      sourceArchives: { '.cache/event-detect/posts.jsonl': 11 },
      priorCorpusCases: 5
    }
    const issues = await issuesOf(base, provenance)
    expect(issues).toContain('provenance case count differs from the files')
    expect(issues).toContain('provenance positive count differs from the files')
    expect(issues).toContain('provenance source archives do not account for every case')
    expect(issues).toContain('provenance prior corpus size differs from the prior files')
  })

  test('a provenance that does not match the schema is rejected', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'expanded-corpus-'))
    directories.push(directory)
    const broken = { ...fixtureProvenance(base, PRIOR), annotationStatus: 'human-reviewed' }
    await writeExpandedFixture(directory, base, broken)
    await expect(loadExpandedGoalCorpus(directory)).rejects.toThrow('Invalid expanded corpus provenance')
  })
})

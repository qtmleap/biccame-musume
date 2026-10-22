import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { benchmarkTextHash } from '../scripts/lib/event-detect/benchmark-corpus'
import {
  d1AnchoredCorpusIssues,
  expandedCorpusIssues,
  loadPriorWithExpanded
} from '../scripts/lib/event-detect/goal-pipeline-expanded-corpus'
import { D1_PRIOR, d1Provenance, d1Rows } from './fixtures/d1-anchored-corpus'
import { type FixtureRow, patchRow, writeExpandedFixture } from './fixtures/expanded-corpus'

const directories: string[] = []
afterAll(() => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))))

const issuesOf = async (rows: FixtureRow[], provenance: unknown = d1Provenance(rows)) => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-anchored-'))
  directories.push(directory)
  await writeExpandedFixture(directory, rows, provenance)
  return d1AnchoredCorpusIssues(directory)
}
const base = d1Rows(6)
const first = (index: number): FixtureRow => {
  const row = base[index]
  if (row === undefined) throw new Error('fixture rows are missing')
  return row
}
const replaceAt = (rows: FixtureRow[], index: number, row: FixtureRow) =>
  rows.map((item, at) => (at === index ? row : item))
const withReferences = (row: FixtureRow, referencedEvents: unknown[]) =>
  patchRow(row, { observedD1: { ...Object(row.observedD1), referencedEvents } })

describe('D1 anchored fixture corpus', () => {
  test('a consistent fixture passes and compares against the 586 prior and 200 expanded-v2 cases', async () => {
    expect(await issuesOf(base)).toEqual([])
    expect(await loadPriorWithExpanded()).toHaveLength(D1_PRIOR)
  })

  test('a positive without a D1 reference is rejected', async () => {
    const issues = await issuesOf(replaceAt(base, 0, withReferences(first(0), [])))
    expect(issues.some((issue) => issue.includes('positive has no D1 reference'))).toBe(true)
  })

  test('a negative that references a D1 event is rejected', async () => {
    const reference = Object(Object(first(0).observedD1).referencedEvents)[0]
    const issues = await issuesOf(replaceAt(base, 1, withReferences(first(1), [reference])))
    expect(issues.some((issue) => issue.includes('negative must not reference a D1 event'))).toBe(true)
  })

  test('a reference url that points at a different post is rejected', async () => {
    const reference = {
      ...Object(Object(first(0).observedD1).referencedEvents)[0],
      referenceUrl: 'https://x.com/Fixture_Store0/status/123'
    }
    const issues = await issuesOf(replaceAt(base, 0, withReferences(first(0), [reference])))
    expect(issues.some((issue) => issue.includes('reference url does not point at the post'))).toBe(true)
  })

  test('an unknown event origin is rejected instead of being silently trusted', async () => {
    const reference = { ...Object(Object(first(0).observedD1).referencedEvents)[0], origin: 'unverified' }
    const issues = await issuesOf(replaceAt(base, 0, withReferences(first(0), [reference])))
    expect(issues.some((issue) => issue.includes('invalid referenced D1 event'))).toBe(true)
  })
})

describe('shared D1 events', () => {
  test('positives that cite the same D1 event must share a template family tag', async () => {
    const reference = Object(Object(first(0).observedD1).referencedEvents)[0]
    const post = Object(first(2).post)
    const shared = {
      ...reference,
      referenceUrl: `https://x.com/${String(post.screenName)}/status/${String(post.id)}`
    }
    const issues = await issuesOf(replaceAt(base, 2, withReferences(first(2), [shared])))
    expect(issues.some((issue) => issue.includes('must carry the same template-family: tag'))).toBe(true)
    const tagged = (index: number) =>
      patchRow(first(index), { tags: [...Object(first(index).tags), 'template-family:x'] })
    const fixed = replaceAt(replaceAt(base, 0, tagged(0)), 2, tagged(2))
    const linked = replaceAt(fixed, 2, withReferences(tagged(2), [{ ...shared, referenceUrl: shared.referenceUrl }]))
    expect((await issuesOf(linked)).some((issue) => issue.includes('must carry the same'))).toBe(false)
  })
})

describe('D1 anchored provenance', () => {
  test('the dataset revision must match the profile', async () => {
    const issues = await issuesOf(base, { ...d1Provenance(base), datasetRevision: 'annotated-expanded-v2' })
    expect(issues).toContain('provenance dataset revision differs from the profile')
  })

  test('a missing d1Anchoring record is a defect for this profile', async () => {
    const rest = Object.fromEntries(Object.entries(d1Provenance(base)).filter(([key]) => key !== 'd1Anchoring'))
    expect(await issuesOf(base, rest)).toContain('provenance d1Anchoring is missing')
  })

  test('event origins that do not account for every reference are rejected', async () => {
    const provenance = d1Provenance(base)
    const broken = {
      ...provenance,
      d1Anchoring: { ...provenance.d1Anchoring, selectedEventOrigins: { 'manual-or-seed': 1 } }
    }
    const issues = await issuesOf(base, broken)
    expect(issues).toContain('provenance selected event origins do not account for every D1 reference')
  })

  test('a template family naming an unknown case is rejected', async () => {
    const provenance = d1Provenance(base)
    const families = [{ family: 'x', caseIds: ['d1-anchored-v1-positive-1', 'd1-anchored-v1-positive-2'] }]
    const broken = { ...provenance, d1Anchoring: { ...provenance.d1Anchoring, templateFamilies: families } }
    const issues = await issuesOf(base, broken)
    expect(issues.some((issue) => issue.includes('template family x: unknown case'))).toBe(true)
  })

  test('the default expanded-v2 profile is unchanged and rejects the D1 revision label', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'd1-anchored-'))
    directories.push(directory)
    await writeExpandedFixture(directory, base, d1Provenance(base))
    const issues = await expandedCorpusIssues(directory)
    expect(issues).toContain('provenance dataset revision differs from the profile')
    expect(issues.some((issue) => issue.includes('id must be expanded-v2-<label>-<postId>'))).toBe(true)
  })

  test('texts copied from the expanded-v2 corpus are rejected as overlaps', async () => {
    const prior = await loadPriorWithExpanded()
    const expandedOnly = prior.find((row) => row.id.startsWith('expanded-v2-'))
    const negative = first(1)
    if (expandedOnly === undefined) throw new Error('expanded-v2 rows are missing')
    const post = { ...Object(negative.post), text: expandedOnly.text }
    const copied = patchRow(negative, { post })
    const issues = await issuesOf(replaceAt(base, 1, copied))
    expect(issues.some((issue) => issue.includes('normalized text overlaps the prior corpus'))).toBe(true)
    expect(benchmarkTextHash(expandedOnly.text)).toBe(benchmarkTextHash(String(post.text)))
  })
})

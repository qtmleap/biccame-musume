import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BenchmarkCase } from '../scripts/lib/event-detect/benchmark-schema'
import { writePromptCycleVersionTable } from '../scripts/lib/event-detect/prompt-cycle-version-table'

const cases: BenchmarkCase[] = Array.from({ length: 100 }, (_, index) => ({
  id: `table-${index}`,
  source: 'synthetic',
  description: '採点表の単体テスト',
  post: {
    id: String(index),
    screenName: 'test',
    kind: 'original',
    text: '単体テスト',
    url: 'https://example.com/post',
    createdAt: '2026-10-20T00:00:00Z',
    media: []
  },
  expected: {
    isEvent: index < 50,
    status: null,
    category: null,
    stores: null,
    characterIds: null,
    startDate: null,
    conditions: null
  },
  rationale: 'モデル性能ではなく分類計数を検証',
  tags: ['unit-control'],
  group: `table-${index}`,
  reviewStatus: 'provisional'
}))

test('version table separates hard false negatives from held positives without changing legacy fn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cycle-version-table-'))
  const arm = join(root, 'arm')
  try {
    await mkdir(arm)
    await writeFile(
      join(arm, 'manifest.json'),
      JSON.stringify({
        evaluator: {
          version: 'test-version',
          sha256: 'test-hash',
          thresholds: { eventThreshold: 0.9, ignoreThreshold: 0.5, fieldThreshold: 0.9 }
        },
        cases
      })
    )
    await Promise.all(
      cases.map(async (sample, index) => {
        const probability =
          index < 10 || (index >= 50 && index < 70)
            ? 0.95
            : (index >= 10 && index < 30) || (index >= 70 && index < 80)
              ? 0.7
              : 0.2
        await writeFile(
          join(arm, `${sample.id}.json`),
          JSON.stringify({
            id: sample.id,
            error: null,
            response: { answers: { is_event: { type: 'noul', noul: probability } } }
          })
        )
      })
    )
    const rows = await writePromptCycleVersionTable([arm], join(root, 'table.md'), join(root, 'table.csv'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tp: 10,
      fp: 20,
      hardFN: 20,
      tn: 20,
      positiveHold: 20,
      negativeHold: 10,
      positiveMisses: 40,
      legacyFn: 40,
      effectiveRecall: 0.2,
      errors: 0
    })
    expect(await readFile(join(root, 'table.md'), 'utf8')).toContain('hard FN')
    expect(await readFile(join(root, 'table.csv'), 'utf8')).toContain('positive_misses,legacy_fn')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

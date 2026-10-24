import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BenchmarkCase } from '../scripts/lib/event-detect/benchmark-schema'
import { comparePromptCycleArms } from '../scripts/lib/event-detect/prompt-cycle-compare'
import { loadPromptCycleEvaluator, type PromptCycleEvaluator } from '../scripts/lib/event-detect/prompt-cycle-evaluator'
import { runPromptCycleArm } from '../scripts/lib/event-detect/prompt-cycle-run'

const cases = (): BenchmarkCase[] =>
  Array.from({ length: 100 }, (_, index) => ({
    id: `cycle-case-${index}`,
    source: 'synthetic',
    description: '実行制御の単体テスト',
    post: {
      id: String(900000000000000000n + BigInt(index)),
      screenName: 'test',
      kind: 'original',
      text: 'テスト入力',
      url: 'https://example.com/post',
      createdAt: '2026-10-20T00:00:00Z',
      media: []
    },
    expected: {
      isEvent: false,
      status: null,
      category: null,
      stores: null,
      characterIds: null,
      startDate: null,
      conditions: null
    },
    rationale: '外部モデルの品質評価ではなく予算と再開の検証',
    tags: ['unit-control'],
    group: `unit-${index}`,
    reviewStatus: 'provisional'
  }))
const evaluator: PromptCycleEvaluator = {
  version: 'test-v1',
  sha256: 'frozen-test-hash',
  thresholds: { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 },
  requests: (post) => [
    { model: 'clef', state: post.text, questions: { is_event: { type: 'noul', instructions: 'テスト' } } }
  ],
  evaluate: () => ({
    decision: { status: 'ignored', confidence: 0, reasons: ['not_distribution_event'] },
    draft: { stores: [], characterIds: [], conditions: [] }
  })
}
const response = { answers: { is_event: { type: 'noul' as const, noul: 0 } } }

test('cycle records every call before sending and resumes without another call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-cycle-test-'))
  const calls: string[] = []
  const input = {
    root,
    arm: 'development',
    cases: cases(),
    evaluator,
    reuseDirectory: null,
    maxCalls: 800,
    concurrency: 2,
    maxDurationMs: 30_000,
    run: async () => {
      calls.push('call')
      return response
    }
  }
  try {
    const first = await runPromptCycleArm(input)
    expect(first.total).toBe(100)
    expect(first.errors).toBe(0)
    expect(first.globalCalls).toBe(100)
    expect(calls).toHaveLength(100)
    const second = await runPromptCycleArm({
      ...input,
      run: async () => {
        throw new Error('Resume must not send')
      }
    })
    expect(second.errors).toBe(0)
    expect(second.globalCalls).toBe(100)
    expect(second.event.fp).toBe(0)
    const marker = JSON.parse(await readFile(join(root, 'calls/0001.json'), 'utf8'))
    expect(marker.arm).toBe('development')
    await expect(
      runPromptCycleArm({ ...input, evaluator: { ...evaluator, sha256: 'different-source' } })
    ).rejects.toThrow('manifest changed')
    const checkpoint = join(root, 'development/cycle-case-0.json')
    const saved = await readFile(checkpoint, 'utf8')
    expect(saved).toContain('"model": "clef"')
    await writeFile(checkpoint, saved.replace('"model": "clef"', '"model": "clef-flash"'))
    await expect(runPromptCycleArm(input)).rejects.toThrow('request or model differs')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('cycle rejects unsafe paths and unbounded budgets before any call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-cycle-guard-'))
  const input = {
    root,
    arm: 'valid',
    cases: cases(),
    evaluator,
    reuseDirectory: null,
    maxCalls: 800,
    concurrency: 2,
    maxDurationMs: 30_000,
    run: async () => response
  }
  try {
    await expect(runPromptCycleArm({ ...input, arm: '../escape' })).rejects.toThrow('Unsafe cycle arm')
    await expect(runPromptCycleArm({ ...input, maxCalls: 801 })).rejects.toThrow('Invalid cycle budget')
    await expect(runPromptCycleArm({ ...input, concurrency: 3 })).rejects.toThrow('Invalid cycle concurrency')
    await expect(runPromptCycleArm({ ...input, maxDurationMs: Number.NaN })).rejects.toThrow('Invalid cycle deadline')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('paired cycle gate requires complete recall improvement without added false positives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-cycle-pair-'))
  const samples = cases().map((sample, index) => ({
    ...sample,
    post: { ...sample.post, text: index % 2 === 0 ? 'positive' : 'negative' },
    expected: { ...sample.expected, isEvent: index % 2 === 0 }
  }))
  const input = {
    root,
    cases: samples,
    evaluator,
    reuseDirectory: null,
    maxCalls: 800,
    concurrency: 2,
    maxDurationMs: 30_000
  }
  try {
    await runPromptCycleArm({ ...input, arm: 'before', run: async () => response })
    await runPromptCycleArm({
      ...input,
      arm: 'after',
      run: async (request) => ({
        answers: {
          is_event: { type: 'noul', noul: request.state === 'positive' ? 0.99 : 0.01 }
        }
      })
    })
    const result = await comparePromptCycleArms(
      join(root, 'before'),
      join(root, 'after'),
      join(root, 'comparison.json')
    )
    expect(result.before.event.recall).toBe(0)
    expect(result.after.event.recall).toBe(1)
    expect(result.after.event.fp).toBe(0)
    expect(result.gate.passed).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test('frozen evaluator rejects source hash and dependency changes before importing code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-cycle-loader-'))
  const file = join(root, 'frozen.mjs')
  const source = "throw new Error('Unverified module was executed')"
  const metadata = { version: 'test-v1', sha256: 'wrong', externalDependencies: { zod: '0', dayjs: '0' } }
  try {
    await writeFile(file, source)
    await writeFile(join(root, 'frozen.meta.json'), JSON.stringify(metadata))
    await expect(loadPromptCycleEvaluator(file)).rejects.toThrow('hash does not match')
    await writeFile(
      join(root, 'frozen.meta.json'),
      JSON.stringify({ ...metadata, sha256: createHash('sha256').update(source).digest('hex') })
    )
    await expect(loadPromptCycleEvaluator(file)).rejects.toThrow('dependency version changed')
    await expect(loadPromptCycleEvaluator(join(root, 'mutable.ts'))).rejects.toThrow('frozen module bundle')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('each arm stops at 200 calls even when an evaluator produces extra batches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-cycle-arm-cap-'))
  const sent: number[] = []
  const expanded: PromptCycleEvaluator = {
    ...evaluator,
    requests: (post) =>
      Array.from({ length: 3 }, () => evaluator.requests(post)[0]).filter((request) => request !== undefined)
  }
  try {
    const summary = await runPromptCycleArm({
      root,
      arm: 'arm-cap',
      cases: cases(),
      evaluator: expanded,
      reuseDirectory: null,
      maxCalls: 800,
      concurrency: 2,
      maxDurationMs: 30_000,
      run: async () => {
        sent.push(1)
        return response
      }
    })
    expect(sent).toHaveLength(200)
    expect(summary.globalCalls).toBe(200)
    expect(summary.errors).toBeGreaterThan(0)
    expect(summary.completed + summary.errors).toBe(100)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

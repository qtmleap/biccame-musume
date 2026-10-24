import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGoalPhaseBudget } from '../scripts/lib/event-detect/goal-pipeline-budget'

const attempt = { stage: 'judge', inputHash: 'fixture', moduleSha256: 'fixture', caseId: 'fixture' }

test('phase budget counts smoke, persists reservations, rejects concurrent process and stops at 1200', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goal-phase-budget-'))
  try {
    const first = await createGoalPhaseBudget(directory, 18)
    try {
      expect(first.used()).toBe(18)
      await expect(createGoalPhaseBudget(directory, 18)).rejects.toThrow()
      await first.reserve(attempt)
      expect(first.used()).toBe(19)
    } finally {
      await first.close()
    }
    const resumed = await createGoalPhaseBudget(directory, 18)
    try {
      expect(resumed.used()).toBe(19)
      for (const _index of Array.from({ length: 1181 })) await resumed.reserve(attempt)
      expect(resumed.used()).toBe(1200)
      await expect(resumed.reserve(attempt)).rejects.toThrow('Global pipeline phase budget exhausted')
      expect((await readFile(join(directory, 'phase-live-attempts.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(
        1182
      )
    } finally {
      await resumed.close()
    }
  } finally {
    await rm(directory, { recursive: true })
  }
})

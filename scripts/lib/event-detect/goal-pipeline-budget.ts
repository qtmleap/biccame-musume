import { appendFile, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const entrySchema = z.object({
  sequence: z.number().int().positive(),
  stage: z.string().nonempty(),
  inputHash: z.string().nonempty(),
  moduleSha256: z.string().nonempty(),
  caseId: z.string().nonempty()
})
export type GoalPhaseAttempt = Omit<z.infer<typeof entrySchema>, 'sequence'>

// armや出力先を変更しても、同phaseの試行上限と送信前記録を共有する。
export const createGoalPhaseBudget = async (root: string, smokeCalls: number) => {
  if (!Number.isInteger(smokeCalls) || smokeCalls < 0 || smokeCalls > 20) throw new Error('Invalid smoke call budget')
  const lockPath = join(root, '.phase-run.lock')
  const lock = await open(lockPath, 'wx', 0o600)
  const ledgerPath = join(root, 'phase-live-attempts.jsonl')
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, smokeCalls }))
    const raw = (await Bun.file(ledgerPath).exists()) ? await readFile(ledgerPath, 'utf8') : ''
    const rows = raw
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const parsed = entrySchema.safeParse(JSON.parse(line))
        if (!parsed.success) throw new Error('Invalid global phase ledger')
        return parsed.data
      })
    if (rows.some((row, index) => row.sequence !== index + smokeCalls + 1))
      throw new Error('Global phase ledger sequence mismatch')
    const state = { used: smokeCalls + rows.length }
    if (state.used > 1200) throw new Error('Saved phase budget exceeds limit')
    return {
      used: () => state.used,
      reserve: async (attempt: GoalPhaseAttempt) => {
        if (state.used >= 1200) throw new Error('Global pipeline phase budget exhausted')
        state.used += 1
        await appendFile(ledgerPath, JSON.stringify({ sequence: state.used, ...attempt }) + '\n', { mode: 0o600 })
      },
      close: async () => {
        await lock.close()
        await unlink(lockPath)
      }
    }
  } catch (error) {
    await lock.close()
    await unlink(lockPath)
    throw error
  }
}

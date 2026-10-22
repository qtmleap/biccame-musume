import { appendFile, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import dayjs from 'dayjs'
import { z } from 'zod'

// この測定専用の台帳。既存の phase-live-attempts.jsonl・スモーク結果・承認ファイル・1200上限とは共有しない。
export const D1_GOLD_CALL_LIMIT = 450
export const D1_GOLD_LEDGER_FILE = 'live-attempts.jsonl'

const entrySchema = z.object({
  sequence: z.number().int().positive(),
  at: z.iso.datetime(),
  stage: z.string().nonempty(),
  caseId: z.string().nonempty(),
  inputHash: z.string().nonempty(),
  moduleSha256: z.string().nonempty()
})
export type D1GoldAttempt = Omit<z.infer<typeof entrySchema>, 'sequence' | 'at'>

// 送信前に1行ずつ追記する。出力先ごとに排他ロックを取り、別プロセスの同時送信と上限の二重消費を防ぐ。
export const openD1GoldLedger = async (directory: string, limit: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > D1_GOLD_CALL_LIMIT) throw new Error('Invalid D1 gold call limit')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lockPath = join(directory, '.run.lock')
  const lock = await open(lockPath, 'wx', 0o600)
  const release = async () => {
    await lock.close()
    await unlink(lockPath)
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }))
    const ledgerPath = join(directory, D1_GOLD_LEDGER_FILE)
    const raw = (await Bun.file(ledgerPath).exists()) ? await readFile(ledgerPath, 'utf8') : ''
    const rows = raw
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const parsed = entrySchema.safeParse(JSON.parse(line))
        if (!parsed.success) throw new Error('Invalid D1 gold ledger')
        return parsed.data
      })
    if (rows.some((row, index) => row.sequence !== index + 1)) throw new Error('D1 gold ledger sequence mismatch')
    if (rows.length > limit) throw new Error('Saved D1 gold calls exceed the limit')
    const state = { used: rows.length }
    // 並列の2本が同時に reserve しても、台帳の行が番号順に並ぶよう、追記は1本の連鎖で直列化する。
    const queue: { tail: Promise<void> } = { tail: Promise.resolve() }
    return {
      used: () => state.used,
      limit,
      remaining: () => limit - state.used,
      reserve: async (attempt: D1GoldAttempt) => {
        if (state.used >= limit) throw new Error('D1 gold call budget exhausted')
        // 番号は同期的に確保し、書き込みの完了を待ってから送信へ進む。
        state.used += 1
        const entry = { sequence: state.used, at: dayjs().toISOString(), ...attempt }
        const write = queue.tail.then(async () => {
          await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
        })
        queue.tail = write.catch(() => undefined)
        await write
      },
      close: release
    }
  } catch (error) {
    await release()
    throw error
  }
}
export type D1GoldLedger = Awaited<ReturnType<typeof openD1GoldLedger>>

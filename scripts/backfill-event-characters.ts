/**
 * 対象ビッカメ娘が空のイベントに、開催店舗の娘を明示で書き込むバックフィル。
 *
 * Usage:
 *   bun run events:backfill-characters [local-staging|remote-staging|remote-production] [--apply]
 *   (remote-* は CLOUDFLARE_API_TOKEN が要るので、badges:seed と同じく .env を読み込んだシェルで実行する)
 *
 * 既定は dry-run（読み取りのみ）。--apply を付けたときだけ書く。
 * deployment.yaml では実行されない。手で、dry-run の件数を確認してから --apply する。
 *
 * 書き込み:
 *   - 対象は event_characters が 1 件も無いイベント。event_stores.store_key のうち StoreKey として有効なものを娘にする。
 *   - events には触れない（updated_at・character_id は変えない）。
 *   - イベントごとに 1 文。NOT EXISTS のガードで、すでに娘のあるイベントは書き換えず、再実行しても増えない。
 *   - 全文を 1 ファイルにして wrangler d1 execute --file で流す。ローカルは db.batch、リモートは import API で、
 *     どちらも失敗すると元の状態に戻る。仮に途中で止まっても、1 文ごとに全部入る／入らないなので再実行できる。
 *   - 一時ファイルは .wrangler/tmp/ に作り、終わったら消す。
 */

import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { $ } from 'bun'
import dayjs from 'dayjs'
import { z } from 'zod'
import {
  buildBackfillStatements,
  countInsertRows,
  describePlan,
  EventStoreRowSchema,
  groupEventRows,
  planEventCharacterBackfill,
  READ_EVENTS_SQL
} from './lib/backfill-event-characters'

const TargetEnvSchema = z.enum(['local-staging', 'remote-staging', 'remote-production'])
type TargetEnv = z.infer<typeof TargetEnvSchema>

const USAGE = 'Usage: bun run events:backfill-characters [local-staging|remote-staging|remote-production] [--apply]'
const TMP_DIR = resolve('.wrangler/tmp')
const WRANGLER = ['bun', 'wrangler', '--config', 'workers/web/wrangler.toml', 'd1', 'execute']

const D1ReadResultSchema = z.array(z.object({ results: z.array(EventStoreRowSchema) }))

const getWranglerArgs = (env: TargetEnv): string[] => {
  const envName = env === 'remote-production' ? 'production' : 'staging'
  const dbName = env === 'remote-production' ? 'biccame-musume-prod' : 'biccame-musume-dev'
  const locationFlag = env === 'local-staging' ? '--local' : '--remote'
  return [
    dbName,
    locationFlag,
    `--env=${envName}`,
    ...(env === 'local-staging' ? ['--persist-to=.wrangler/state'] : [])
  ]
}

const parseArgs = () => {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith('--'))
  const positional = args.filter((arg) => !arg.startsWith('--'))
  const unknownFlag = flags.find((flag) => flag !== '--apply')
  const env = TargetEnvSchema.safeParse(positional.length === 0 ? 'local-staging' : positional[0])
  if (unknownFlag !== undefined || positional.length > 1 || !env.success) {
    console.error(USAGE)
    process.exit(1)
  }
  return { targetEnv: env.data, apply: flags.includes('--apply') }
}

/** events の id・title、event_stores の store_key、event_characters の件数だけを読む。 */
const readEvents = async (wranglerArgs: string[]) => {
  const result = await $`${WRANGLER} ${wranglerArgs} --json --command ${READ_EVENTS_SQL}`.quiet()
  const parsed = D1ReadResultSchema.safeParse(JSON.parse(result.stdout.toString()))
  if (!parsed.success) throw new Error(`Unexpected D1 read result: ${parsed.error.message}`)
  return groupEventRows(parsed.data.flatMap((entry) => entry.results))
}

const executeFile = async (wranglerArgs: string[], file: string) => {
  const child = Bun.spawn([...WRANGLER, ...wranglerArgs, `--file=${file}`], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit'
  })
  const code = await child.exited
  if (code !== 0) throw new Error(`wrangler d1 execute exited with code ${code}`)
}

const main = async (): Promise<void> => {
  const { targetEnv, apply } = parseArgs()
  const wranglerArgs = getWranglerArgs(targetEnv)
  console.log(`Backfill event_characters on ${targetEnv} (${apply ? 'APPLY' : 'dry-run'})`)
  console.log(`  wrangler: ${wranglerArgs.join(' ')}`)
  if (targetEnv === 'remote-production') {
    console.log(
      '  Reading from the PRODUCTION database (read-only SELECT). It reads events.id/title, event_stores.store_key'
    )
    console.log(`  and the per-event count of event_characters only: ${READ_EVENTS_SQL}`)
  }

  const events = await readEvents(wranglerArgs)
  const plan = planEventCharacterBackfill(events)
  for (const line of describePlan(plan, events.length)) console.log(line)

  if (!apply) {
    console.log('Dry-run: nothing was written. Re-run with --apply to write.')
    return
  }
  if (plan.inserts.length === 0) {
    console.log('Nothing to write.')
    return
  }

  const statements = buildBackfillStatements(plan.inserts, {
    now: toD1DateTime(dayjs()),
    newId: () => crypto.randomUUID()
  })
  mkdirSync(TMP_DIR, { recursive: true })
  const tmpFile = resolve(TMP_DIR, `backfill-event-characters-${Date.now()}.sql`)
  const cleanup = () => rmSync(tmpFile, { force: true })
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })
  try {
    await Bun.write(tmpFile, `${statements.join('\n')}\n`)
    await executeFile(wranglerArgs, tmpFile)
  } finally {
    cleanup()
  }

  const after = planEventCharacterBackfill(await readEvents(wranglerArgs))
  console.log(`Done. Planned rows: ${countInsertRows(plan)} across ${plan.inserts.length} events.`)
  console.log(`  Remaining targets after apply (expected 0): ${after.inserts.length}`)
  if (after.inserts.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})

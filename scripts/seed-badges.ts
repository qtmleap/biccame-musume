/**
 * Badge seed script — upserts all auto-generated badges from BADGE_REGISTRY into the D1 `badges` table.
 *
 * Usage:
 *   source .env && bun run badges:seed [local-staging|remote-staging|remote-production]
 *
 * IMPORTANT: Must be run with `source .env &&` prefix so that CLOUDFLARE_API_TOKEN is available
 * to wrangler. See project memory: feedback_wrangler_source_env.md
 *
 * Upsert policy:
 *   - On insert: write all fields.
 *   - On conflict (code already exists, non-special):
 *       Overwrite ALL display & structural fields from the registry
 *       (name / description / hint / icon_name / rarity / sort_order /
 *        category / sub_category / condition_meta).
 *       is_hidden は admin の表示制御なので保持する。
 *   - Rows with category='special' (admin-created) are never touched.
 *   - category='special' rows not in the registry are preserved.
 */

import { $ } from 'bun'
import { BADGE_REGISTRY } from '../src/data/badges/registry'

type TargetEnv = 'local-staging' | 'remote-staging' | 'remote-production'

function getWranglerArgs(env: TargetEnv): string[] {
  const envName = env === 'remote-production' ? 'production' : 'staging'
  const dbName = env === 'remote-production' ? 'biccame-musume-prod' : 'biccame-musume-dev'
  const locationFlag = env === 'local-staging' ? '--local' : '--remote'
  return [dbName, locationFlag, `--env=${envName}`]
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

async function execSql(args: string[], sql: string): Promise<void> {
  await $`bun wrangler d1 execute ${args} --command ${sql}`.quiet()
}

async function execSqlFile(args: string[], file: string): Promise<void> {
  await $`bun wrangler d1 execute ${args} --file=${file}`.quiet()
}

async function main(): Promise<void> {
  const targetEnv = (process.argv[2] ?? 'local-staging') as TargetEnv
  if (!['local-staging', 'remote-staging', 'remote-production'].includes(targetEnv)) {
    console.error('Usage: bun run badges:seed [local-staging|remote-staging|remote-production]')
    process.exit(1)
  }

  const args = getWranglerArgs(targetEnv)
  console.log(`Seeding badges to ${targetEnv} (${BADGE_REGISTRY.length} entries in registry)`)

  // Fetch existing badge codes from the DB to compute insert vs update counts.
  let existingCodes = new Set<string>()
  try {
    const result = await $`bun wrangler d1 execute ${args} --json --command "SELECT code FROM badges;"`.quiet()
    const parsed = JSON.parse(result.stdout.toString()) as Array<{ results?: Array<{ code?: string }> }>
    existingCodes = new Set(
      (parsed[0]?.results ?? []).map((r) => r.code).filter((c): c is string => typeof c === 'string')
    )
  } catch {
    console.log('  No existing badges found (table may be empty).')
  }

  // Write upsert SQL to a temp file to avoid shell-quoting issues with large payloads.
  const tmpFile = `/tmp/seed-badges-${Date.now()}.sql`
  const lines: string[] = []

  let insertCount = 0
  let updateCount = 0

  for (const badge of BADGE_REGISTRY) {
    const meta = escapeSql(JSON.stringify(badge.conditionMeta))
    const name = escapeSql(badge.name)
    const description = escapeSql(badge.description)
    const hint = escapeSql(badge.hint)
    const iconName = escapeSql(badge.iconName)
    const code = escapeSql(badge.code)

    if (!existingCodes.has(badge.code)) {
      // INSERT path
      lines.push(
        `INSERT INTO badges (code, category, sub_category, name, description, hint, rarity, icon_name, sort_order, condition_meta, is_hidden, created_at, updated_at) ` +
          `VALUES ('${code}', '${badge.category}', '${badge.subCategory}', '${name}', '${description}', '${hint}', '${badge.rarity}', '${iconName}', ${badge.sortOrder}, '${meta}', 0, datetime('now'), datetime('now'));`
      )
      insertCount++
    } else {
      // UPDATE path — registry を真とし、is_hidden 以外の全フィールドを上書き
      lines.push(
        `UPDATE badges SET category='${badge.category}', sub_category='${badge.subCategory}', name='${name}', description='${description}', hint='${hint}', rarity='${badge.rarity}', icon_name='${iconName}', sort_order=${badge.sortOrder}, condition_meta='${meta}', updated_at=datetime('now') WHERE code='${code}' AND category != 'special';`
      )
      updateCount++
    }
  }

  await Bun.write(tmpFile, lines.join('\n'))

  try {
    await execSqlFile(args, tmpFile)
  } finally {
    await $`rm -f ${tmpFile}`.quiet()
  }

  console.log(`Done.`)
  console.log(`  Inserted: ${insertCount}`)
  console.log(`  Updated (registry overwrite): ${updateCount}`)
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})

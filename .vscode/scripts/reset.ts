/**
 * Prismaマイグレーションをリセットし、リモートD1に適用するスクリプト
 *
 * 使用方法:
 *   bun run scripts/reset.ts [local-dev|remote-dev|remote-prod]
 *
 * 対象:
 *   - local-dev: wrangler --local --env=dev (ローカルwrangler D1 dev環境)
 *   - remote-dev: wrangler --remote --env=dev (リモートD1 dev環境)
 *   - remote-prod: wrangler --remote --env=prod (リモートD1 prod環境)
 *
 * 実行内容:
 * 1. prisma/migrationsの全削除
 * 2. prisma migrate dev --create-only --name initでマイグレーション作成
 * 3. 選択した環境にマイグレーション適用（リセット含む）
 */

import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import dayjs from 'dayjs'

type TargetEnv = 'local-dev' | 'remote-dev' | 'remote-prod'

/**
 * マイグレーションディレクトリ名を生成する（YYYYMMDDHHMMSS形式、5分単位、秒は00固定）
 */
function generateMigrationDirName(): string {
  const now = dayjs()
  const roundedMinute = Math.floor(now.minute() / 5) * 5
  return now.minute(roundedMinute).format('YYYYMMDDHHmm00')
}

const MIGRATIONS_DIR = 'prisma/migrations'

/**
 * 環境に応じたデータベース名を取得
 */
function getDatabaseName(env: TargetEnv): string {
  return env === 'remote-prod' ? 'biccame-musume-prod' : 'biccame-musume-dev'
}

/**
 * wranglerでD1データベースをリセットしてマイグレーションを適用する
 */
async function resetAndMigrateD1(env: TargetEnv, migrationSqlPath: string): Promise<void> {
  const databaseName = getDatabaseName(env)
  const isLocal = env === 'local-dev'
  const envName = env === 'remote-prod' ? 'prod' : 'dev'
  const baseArgs = isLocal ? [databaseName, '--local', `--env=${envName}`] : [databaseName, '--remote', `--env=${envName}`]

  // Cloudflare内部テーブル（削除対象から除外）
  const excludeTables = new Set(['_cf_METADATA', '_cf_KV', 'd1_migrations'])

  console.log(`\nResetting ${env} D1...`)

  // テーブル一覧を取得
  let tablesResult
  try {
    tablesResult =
      await $`bun wrangler d1 execute ${baseArgs} --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`.quiet()
  } catch (error) {
    console.error(`  Failed to fetch table list: ${error}`)
    if (!isLocal) {
      console.error('\n  Network error may have occurred. You can:')
      console.error('  1. Retry the command')
      console.error('  2. Try using local-dev environment instead')
      console.error('  3. Check your internet connection')
    }
    throw error
  }
  const tablesOutput = tablesResult.stdout.toString()

  let tables: string[] = []
  try {
    const parsed = JSON.parse(tablesOutput) as Array<{ results?: Array<{ name?: string }> }>
    tables =
      parsed[0]?.results
        ?.map((r) => r.name)
        .filter((name): name is string => typeof name === 'string' && !excludeTables.has(name)) ?? []
  } catch (error) {
    console.log(`  Failed to parse table list: ${error}`)
    console.log(`  Raw output: ${tablesOutput}`)
    throw new Error(`Failed to reset ${env} D1: could not parse table list`)
  }

  if (tables.length > 0) {
    console.log(`  Tables to drop: ${tables.join(', ')}`)

    // 各テーブルを削除
    for (const table of tables) {
      try {
        await $`bun wrangler d1 execute ${baseArgs} --command ${`DROP TABLE IF EXISTS "${table}";`}`.quiet()
      } catch (error) {
        console.log(`  Warning: failed to drop table "${table}": ${error}`)
      }
    }
    console.log(`  Done: dropped ${tables.length} table(s)`)
  } else {
    console.log('  No tables found, skipping')
  }

  // _prisma_migrationsテーブルも削除（存在する場合）
  await $`bun wrangler d1 execute ${baseArgs} --command "DROP TABLE IF EXISTS _prisma_migrations;"`.quiet()

  console.log(`\nApplying migration to ${env} D1...`)
  console.log(`  File: ${migrationSqlPath}`)

  const maxRetries = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`  Retry attempt ${attempt}/${maxRetries}...`)
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
      await $`bun wrangler d1 execute ${baseArgs} --file=${migrationSqlPath}`
      console.log(`  Done: ${env} D1 migration applied`)
      return
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        console.log(`  Attempt ${attempt} failed, retrying...`)
      }
    }
  }

  console.error(`  Failed to apply migration after ${maxRetries} attempts: ${lastError}`)
  if (!isLocal) {
    console.error('\n  Network error may have occurred. You can:')
    console.error('  1. Retry the command manually')
    console.error('  2. Try using local-dev environment instead')
    console.error('  3. Check your internet connection')
  }
  throw lastError
}

async function main(): Promise<void> {
  const targetEnv = process.argv[2] as TargetEnv | undefined

  if (!targetEnv || !['local-dev', 'remote-dev', 'remote-prod'].includes(targetEnv)) {
    console.error('Usage: bun run scripts/reset.ts [local-dev|remote-dev|remote-prod]')
    console.error('')
    console.error('  local-dev:   wrangler --local --env=dev (ローカルwrangler D1 dev環境)')
    console.error('  remote-dev:  wrangler --remote --env=dev (リモートD1 dev環境)')
    console.error('  remote-prod: wrangler --remote --env=prod (リモートD1 prod環境)')
    process.exit(1)
  }

  console.log(`Starting Prisma migration reset script (target: ${targetEnv})\n`)

  // Step 1: prisma/migrations ディレクトリを削除
  console.log('Step 1: Remove prisma/migrations')
  if (existsSync('prisma/migrations')) {
    await $`rm -rf prisma/migrations`
    console.log('  Done: removed prisma/migrations')
  } else {
    console.log('  Skipped: prisma/migrations does not exist')
  }

  // Step 2: マイグレーション作成
  console.log('\nStep 2: Create Prisma migration')
  await $`bunx prisma migrate dev --create-only --name init`

  // 作成されたマイグレーションディレクトリをリネーム
  const createdDirs = readdirSync(MIGRATIONS_DIR).filter(
    (name) => name.endsWith('_init') && existsSync(join(MIGRATIONS_DIR, name, 'migration.sql'))
  )

  if (createdDirs.length === 0) {
    throw new Error('Migration directory not found')
  }

  const oldDirName = createdDirs[createdDirs.length - 1]
  const newDirName = generateMigrationDirName()
  const oldPath = join(MIGRATIONS_DIR, oldDirName)
  const newPath = join(MIGRATIONS_DIR, newDirName)

  renameSync(oldPath, newPath)
  console.log(`  Renamed: ${oldDirName} -> ${newDirName}`)

  // マイグレーションSQLファイルのパスを取得
  const migrationSqlPath = join(MIGRATIONS_DIR, newDirName, 'migration.sql')
  console.log(`\nMigration SQL file: ${migrationSqlPath}`)

  // 環境に応じてマイグレーション適用
  console.log(`\nStep 3: Apply to Cloudflare D1 (${targetEnv})`)
  await resetAndMigrateD1(targetEnv, migrationSqlPath)

  console.log('\nAll steps completed successfully!')
}

main().catch((error) => {
  console.error('\nError occurred:')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

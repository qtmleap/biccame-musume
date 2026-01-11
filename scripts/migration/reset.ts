/**
 * Prismaマイグレーションをリセットし、ローカル・リモートD1に適用するスクリプト
 *
 * 使用方法:
 *   bun run scripts/reset.ts [local|dev|prod]
 *
 * 対象:
 *   - local: prisma/dev.db (ローカルSQLite)
 *   - dev: --env=dev --remote (開発環境D1)
 *   - prod: --env=prod --remote (本番環境D1)
 *
 * 実行内容:
 * 1. prisma/migrationsの全削除
 * 2. prisma/dev.dbの削除
 * 3. prisma migrate dev --name initでマイグレーション作成＆ローカルDB反映
 * 4. 選択した環境にマイグレーション適用（リセット含む）
 */

import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import dayjs from 'dayjs'

type TargetEnv = 'local' | 'dev' | 'prod'

/**
 * マイグレーションディレクトリ名を生成する（YYYYMMDDHHMMSS形式、5分単位、秒は00固定）
 */
function generateMigrationDirName(): string {
  const now = dayjs()
  const roundedMinute = Math.floor(now.minute() / 5) * 5
  return now.minute(roundedMinute).format('YYYYMMDDHHmm00')
}

const DATABASE_NAME = 'biccame-musume'
const MIGRATIONS_DIR = 'prisma/migrations'

/**
 * wranglerでD1データベースをリセットしてマイグレーションを適用する
 */
async function resetAndMigrateD1(env: 'dev' | 'prod', migrationSqlPath: string): Promise<void> {
  const baseArgs = [DATABASE_NAME, `--env=${env}`, '--remote']

  // Cloudflare内部テーブル（削除対象から除外）
  const excludeTables = new Set(['_cf_METADATA', '_cf_KV', 'd1_migrations'])

  console.log(`\nResetting ${env} remote D1...`)

  // テーブル一覧を取得
  const tablesResult =
    await $`bun wrangler d1 execute ${baseArgs} --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`.quiet()
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
    throw new Error(`Failed to reset ${env} remote D1: could not parse table list`)
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

  console.log(`\nApplying migration to ${env} remote D1...`)
  console.log(`  File: ${migrationSqlPath}`)
  await $`bun wrangler d1 execute ${baseArgs} --file=${migrationSqlPath}`

  console.log(`  Done: ${env} remote D1 migration applied`)
}

async function main(): Promise<void> {
  const targetEnv = process.argv[2] as TargetEnv | undefined

  if (!targetEnv || !['local', 'dev', 'prod'].includes(targetEnv)) {
    console.error('Usage: bun run scripts/reset.ts [local|dev|prod]')
    console.error('')
    console.error('  local: prisma/dev.db (ローカルSQLite)')
    console.error('  dev:   --env=dev --remote (開発環境D1)')
    console.error('  prod:  --env=prod --remote (本番環境D1)')
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

  // Step 2: prisma/dev.db を削除
  console.log('\nStep 2: Remove prisma/dev.db')
  if (existsSync('prisma/dev.db')) {
    await $`rm -f prisma/dev.db`
    console.log('  Done: removed prisma/dev.db')
  } else {
    console.log('  Skipped: prisma/dev.db does not exist')
  }

  // Step 3: マイグレーション作成
  console.log('\nStep 3: Create Prisma migration')
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
  if (targetEnv === 'local') {
    console.log('\nStep 4: Apply Prisma migration to local DB')
    await $`bunx prisma migrate dev`
    console.log('  Done: migration applied to local DB')
  } else {
    console.log(`\nStep 4: Apply to Cloudflare D1 (${targetEnv})`)
    await resetAndMigrateD1(targetEnv, migrationSqlPath)
  }

  console.log('\nAll steps completed successfully!')
}

main().catch((error) => {
  console.error('\nError occurred:')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

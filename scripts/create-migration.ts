#!/usr/bin/env bun
/**
 * Prisma スキーマの変更から D1 用のマイグレーション SQL を生成する。
 *
 * Usage:
 *   bun run migrate:new <name>
 *   例: bun run migrate:new add_event_character
 *
 * 生成後は `bun run migrate:apply:local` で適用する。
 *
 * 差分の起点には --from-migrations (コミット済みマイグレーション履歴の再生結果) を使う。
 * ローカル D1 の実状態を起点にすると、手で d1 execute した痕跡が差分に混入する上、
 * fresh clone や CI では .wrangler/state が無くて動かない。履歴起点なら DB 不要で、
 * 全マイグレーション適用済みの任意の DB (staging / production) に対して正しい SQL になる。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import dayjs from 'dayjs'

const MIGRATIONS_DIR = 'prisma/migrations'

const name = process.argv[2]
if (!name) {
  console.error('マイグレーション名を指定してください: bun run migrate:new <name>')
  process.exit(1)
}
if (!/^[a-z0-9_]+$/.test(name)) {
  console.error(`マイグレーション名は英小文字・数字・アンダースコアのみ使えます: ${name}`)
  process.exit(1)
}

const dir = join(MIGRATIONS_DIR, `${dayjs().format('YYYYMMDDHHmmss')}_${name}`)
const output = join(dir, 'migration.sql')

// --from-migrations は migrations ディレクトリ配下を走査するため、先に出力先を作ると
// migration.sql の無い不正な履歴とみなされて P3015 で落ちる。一旦別の場所へ出してから配置する
const tmpOutput = join('node_modules', '.cache', `prisma-migration-${process.pid}.sql`)
mkdirSync(join('node_modules', '.cache'), { recursive: true })

const result = spawnSync(
  'bunx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-migrations',
    `./${MIGRATIONS_DIR}`,
    '--to-schema',
    './prisma/schema.prisma',
    '--config',
    './prisma/prisma.config.ts',
    '--script',
    '--output',
    tmpOutput
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] }
)

if (result.status !== 0) {
  rmSync(tmpOutput, { force: true })
  process.exit(result.status === null ? 1 : result.status)
}

const sql = readFileSync(tmpOutput, 'utf8')
if (sql.includes('This is an empty migration')) {
  rmSync(tmpOutput, { force: true })
  console.log('スキーマとマイグレーション履歴に差分はありません。')
  process.exit(0)
}

mkdirSync(dir, { recursive: true })
writeFileSync(output, sql)
rmSync(tmpOutput, { force: true })

console.log(`\n${output}\n`)
console.log(sql)

if (sql.includes('PRAGMA foreign_keys=OFF')) {
  console.warn(
    [
      '警告: テーブル再定義 (RedefineTables) が含まれています。',
      'D1 は PRAGMA foreign_keys=OFF を無視するため、DROP TABLE で子テーブルが',
      'CASCADE 削除される恐れがあります。PRAGMA defer_foreign_keys=ON が',
      '先頭にあることを必ず確認してから適用してください。'
    ].join('\n')
  )
}

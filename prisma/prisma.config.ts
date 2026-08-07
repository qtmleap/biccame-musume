import path from 'node:path'
import { listLocalDatabases } from '@prisma/adapter-d1'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI 用の datasource URL を決める。
 *
 * Prisma 7 では CLI から D1 へ直接接続する手段がない (URL スキームに d1 が無く、
 * config の adapter フィールドも 7 で削除された)。そのため migrate diff の比較対象には
 * miniflare がローカルに持っている SQLite 実体を直接指す。適用は wrangler が行う。
 *
 * listLocalDatabases() は process.cwd() 基準で .wrangler/state を readdirSync するため、
 * リポジトリルートから実行する必要があり、ディレクトリが無いと throw する。
 * CI では .wrangler/state が存在しないので必ず捕捉してフォールバックする
 * (prisma generate は datasource に接続しないため、到達不能な URL でも支障はない)。
 */
const resolveDatasourceUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  try {
    // metadata.sqlite は miniflare の管理用。戻り値は readdir 順で未ソートなので名前で除外する
    const [localD1] = listLocalDatabases().filter((file) => path.basename(file) !== 'metadata.sqlite')
    if (localD1) {
      return `file:${localD1}`
    }
  } catch {
    // .wrangler/state 未生成 (CI / fresh clone)
  }
  return `file:${path.join(__dirname, 'shadow.db')}`
}

export default defineConfig({
  schema: path.join(__dirname, 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'migrations')
  },
  datasource: {
    url: resolveDatasourceUrl()
  }
})

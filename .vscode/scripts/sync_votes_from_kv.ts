#!/usr/bin/env bun
/**
 * KVの投票データをローカルDBに同期するスクリプト
 *
 * 使い方:
 * bun .vscode/scripts/sync_votes_from_kv.ts [環境]
 *
 * 環境: local (デフォルト) / dev / prod
 */

import { $ } from 'bun'

type KVKey = {
  name: string
  metadata?: {
    count?: number
  }
}

/**
 * 環境別のKVネームスペースID
 */
const KV_NAMESPACE_IDS = {
  local: '97c756ffdc3e4e2596946a57092d9b2d',
  dev: '97c756ffdc3e4e2596946a57092d9b2d',
  prod: '04dd77043cc240b2b8bbbd7f0adfd67d'
} as const

type Environment = keyof typeof KV_NAMESPACE_IDS

/**
 * ローカルのwrangler.tomlからD1データベース名を取得
 */
const getLocalDatabaseName = async (): Promise<string> => {
  const wranglerToml = await Bun.file('wrangler.toml').text()
  const match = wranglerToml.match(/database_name\s*=\s*"([^"]+)"/)
  if (!match) {
    throw new Error('wrangler.tomlからdatabase_nameを取得できませんでした')
  }
  return match[1]
}

/**
 * wrangler kv key listの結果を取得
 */
const fetchKVKeys = async (namespaceId: string, env: Environment): Promise<KVKey[]> => {
  console.log(`🔍 ${env}環境のKVから投票データを取得中...`)

  const remoteFlag = env === 'local' ? '' : '--remote'
  const envFlag = env === 'local' ? '' : `--env=${env}`

  const cmd = `bun wrangler kv key list --namespace-id=${namespaceId} ${envFlag} ${remoteFlag}`.trim()
  const result = await $`${{ raw: cmd }}`.quiet()

  const output = result.stdout.toString()
  try {
    return JSON.parse(output) as KVKey[]
  } catch {
    console.error('KVキー一覧の取得に失敗しました')
    return []
  }
}

/**
 * KVキーから投票カウント情報を抽出
 */
const parseCountKey = (key: string): { year: string; characterId: string } | null => {
  // count:2024:character_id の形式
  const match = key.match(/^count:(\d+):(.+)$/)
  if (!match) return null
  return {
    year: match[1],
    characterId: match[2]
  }
}

/**
 * ローカルD1にデータを投入
 */
const insertVotesToLocalD1 = async (
  databaseName: string,
  voteCounts: Map<string, { characterId: string; year: number; count: number }>
): Promise<void> => {
  console.log('🚀 ローカルD1にデータを投入中...')

  const entries = Array.from(voteCounts.values())
  if (entries.length === 0) {
    console.log('  投入するデータがありません')
    return
  }

  // バッチ処理（1回に100件ずつ）
  const batchSize = 100
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)

    const values = batch
      .map((item) => `('${item.characterId}', ${item.year}, ${item.count}, datetime('now'), datetime('now'))`)
      .join(', ')

    const sql = `INSERT OR REPLACE INTO vote_counts (character_id, year, count, created_at, updated_at) VALUES ${values};`

    try {
      await $`bun wrangler d1 execute ${databaseName} --command=${sql} --local`.quiet()
      console.log(`  ✓ ${i + batch.length}/${entries.length}件を投入完了`)
    } catch (error) {
      console.error(`  ✗ バッチ ${i}-${i + batch.length} の投入に失敗:`, error)
      throw error
    }
  }

  console.log(`✅ 合計 ${entries.length}件の投票データを同期しました`)
}

/**
 * メイン処理
 */
const main = async () => {
  // 引数から環境を取得
  const args = process.argv.slice(2)
  const envArg = args[0] || 'local'

  if (!['local', 'dev', 'prod'].includes(envArg)) {
    console.error('❌ 環境はlocal, dev, prodのいずれかを指定してください')
    process.exit(1)
  }

  const env = envArg as Environment
  const namespaceId = KV_NAMESPACE_IDS[env]

  console.log(`\n📦 ${env}環境のKVからローカルD1に投票データを同期します\n`)

  // KVからデータを取得
  const kvKeys = await fetchKVKeys(namespaceId, env)
  console.log(`📊 取得したKVキー数: ${kvKeys.length}`)

  // カウントデータのみを抽出
  const countData = kvKeys
    .map((item) => {
      const parsed = parseCountKey(item.name)
      if (!parsed) return null
      return {
        characterId: parsed.characterId,
        count: item.metadata?.count || 0,
        year: parsed.year
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  console.log(`📈 投票カウントデータ: ${countData.length}件`)

  if (countData.length === 0) {
    console.log('⚠️  同期するデータがありません')
    return
  }

  // 年度とキャラクターIDで一意にキーを作成
  const mergedCounts = countData.reduce((acc, item) => {
    const key = `${item.characterId}:${item.year}`
    const existing = acc.get(key)
    if (existing) {
      existing.count += item.count
    } else {
      acc.set(key, {
        characterId: item.characterId,
        year: Number.parseInt(item.year, 10),
        count: item.count
      })
    }
    return acc
  }, new Map<string, { characterId: string; year: number; count: number }>())

  console.log(`🔢 マージ後のデータ数: ${mergedCounts.size}件`)

  // ローカルD1データベース名を取得
  const databaseName = await getLocalDatabaseName()
  console.log(`💾 ローカルD1データベース: ${databaseName}`)

  // ローカルD1に投入
  await insertVotesToLocalD1(databaseName, mergedCounts)

  console.log('\n✨ 同期が完了しました\n')
}

main().catch((error) => {
  console.error('❌ エラーが発生しました:', error)
  process.exit(1)
})

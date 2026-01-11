/**
 * KVからD1に投票データを移行するスクリプト
 */
import { $ } from 'bun'

type KVKey = {
  name: string
  metadata?: {
    count?: number
  }
  expiration?: number
}

/**
 * wrangler kv key listの結果をパース
 */
const fetchKVKeys = async (namespaceId: string, env: string): Promise<KVKey[]> => {
  const result = await $`bunx wrangler kv key list --namespace-id=${namespaceId} --env=${env} --remote`.json()
  return result as KVKey[]
}

/**
 * KVキーから投票カウントを抽出
 */
const parseCountKey = (key: string): { year: string; characterId: string } | null => {
  const match = key.match(/^count:(\d+):(.+)$/)
  if (!match) return null
  return {
    year: match[1],
    characterId: match[2]
  }
}

/**
 * D1にデータを投入
 */
const insertVotesToD1 = async (
  databaseName: string,
  env: string,
  voteCounts: Map<string, { characterId: string; year: number; count: number }>
): Promise<void> => {
  console.log('🚀 D1にデータを投入中...')

  const entries = Array.from(voteCounts.values())
  if (entries.length === 0) return

  const values = entries
    .map((item) => `('${item.characterId}', ${item.year}, ${item.count}, datetime('now'), datetime('now'))`)
    .join(', ')

  const sql = `INSERT OR REPLACE INTO vote_counts (character_id, year, count, created_at, updated_at) VALUES ${values};`

  try {
    await $`bunx wrangler d1 execute ${databaseName} --command=${sql} --env=${env} --remote`.quiet()
    console.log(`  ✓ ${entries.length}件を投入完了`)
  } catch (error) {
    console.error('  ✗ 投入に失敗:', error)
    throw error
  }
}

/**
 * メイン処理
 */
const main = async () => {
  const env = process.env.CLOUDFLARE_ENV || 'dev'
  const namespaceId = env === 'prod' ? '04dd77043cc240b2b8bbbd7f0adfd67d' : '97c756ffdc3e4e2596946a57092d9b2d'

  console.log(`🔄 ${env}環境のKVから投票データを取得中...`)

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

  // 年度とキャラクターIDで一意にキーを作成（年度別に分離管理）
  const mergedCounts = countData.reduce((acc, item) => {
    const key = `${item.characterId}:${item.year}`
    const existing = acc.get(key)
    if (existing) {
      existing.count += item.count
    } else {
      acc.set(key, { characterId: item.characterId, year: Number.parseInt(item.year, 10), count: item.count })
    }
    return acc
  }, new Map<string, { characterId: string; year: number; count: number }>())

  console.log(`🎯 年度別ユニークデータ数: ${mergedCounts.size}`)

  if (mergedCounts.size === 0) {
    console.log('⚠️  投票データが見つかりませんでした')
    return
  }

  // D1に投入
  await insertVotesToD1('biccame-musume', env, mergedCounts)

  console.log(`\n✅ 完了！${mergedCounts.size}件の投票データをD1に移行しました`)
}

main().catch(console.error)

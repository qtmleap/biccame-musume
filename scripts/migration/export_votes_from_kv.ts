/**
 * KVから投票データをエクスポートしてJSONファイルに保存するスクリプト
 */
import { writeFile } from 'node:fs/promises'
import dayjs from 'dayjs'

// wranglerコマンドで取得したKVデータをパースする想定
// 実行方法:
// 1. bunx wrangler kv key list --namespace-id=<VOTES_NAMESPACE_ID> --env=prod --remote > votes_keys.json
// 2. 各キーの値を取得してこのスクリプトで処理

interface VoteData {
  key: string
  value: string
  metadata?: {
    count?: number
  }
}

interface ExportedVote {
  characterId: string
  ipAddress: string
  timestamp: string
}

interface ExportedVoteCount {
  characterId: string
  count: number
}

interface ExportResult {
  votes: ExportedVote[]
  voteCounts: ExportedVoteCount[]
  exportedAt: string
}

/**
 * KVキーから投票データを抽出
 */
const parseVoteKey = (key: string): { type: 'vote' | 'count'; characterId?: string; ipAddress?: string } => {
  // vote:キャラID:IPアドレス:日付 の形式を想定
  if (key.startsWith('vote:')) {
    const parts = key.split(':')
    if (parts.length >= 3) {
      return {
        type: 'vote',
        characterId: parts[1],
        ipAddress: parts[2]
      }
    }
  }

  // count:キャラID の形式を想定
  if (key.startsWith('count:')) {
    const characterId = key.replace('count:', '')
    return {
      type: 'count',
      characterId
    }
  }

  return { type: 'vote' }
}

/**
 * メイン処理（手動でKVデータを渡す形式）
 */
const _exportVotesFromKV = async (kvData: VoteData[]): Promise<void> => {
  const votes: ExportedVote[] = []
  const voteCounts: ExportedVoteCount[] = []

  for (const item of kvData) {
    const parsed = parseVoteKey(item.key)

    if (parsed.type === 'vote' && parsed.characterId && parsed.ipAddress) {
      votes.push({
        characterId: parsed.characterId,
        ipAddress: parsed.ipAddress,
        timestamp: item.value // ISO形式のタイムスタンプを想定
      })
    } else if (parsed.type === 'count' && parsed.characterId) {
      const count = item.metadata?.count || Number.parseInt(item.value, 10) || 0
      voteCounts.push({
        characterId: parsed.characterId,
        count
      })
    }
  }

  const result: ExportResult = {
    votes,
    voteCounts,
    exportedAt: dayjs().toISOString()
  }

  const outputPath = `./scripts/exported_votes_${dayjs().format('YYYYMMDD_HHmmss')}.json`
  await writeFile(outputPath, JSON.stringify(result, null, 2))

  console.log(`✅ エクスポート完了: ${outputPath}`)
  console.log(`  投票履歴: ${votes.length}件`)
  console.log(`  投票集計: ${voteCounts.length}キャラクター`)
}

// サンプル使用例
console.log('KVデータをエクスポートするには以下を実行:')
console.log('1. bunx wrangler kv key list --namespace-id=<VOTES_NAMESPACE_ID> --env=prod --remote')
console.log('2. 各キーの値を取得してこのスクリプトに渡す')

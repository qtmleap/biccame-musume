/**
 * 本番環境のKVデータをローカル環境に同期するスクリプト
 *
 * 対象KV:
 * - VOTES: 投票データ
 * - BICCAME_MUSUME_EVENTS: イベントデータ
 */

import { $ } from 'bun'

type KvNamespace = {
  binding: string
  namespaceId: string
}

const PROD_KV_NAMESPACES: KvNamespace[] = [
  { binding: 'VOTES', namespaceId: '04dd77043cc240b2b8bbbd7f0adfd67d' },
  { binding: 'BICCAME_MUSUME_EVENTS', namespaceId: 'ef49185c58d04a0790e7c68394d78089' }
]

type KvKey = {
  name: string
}

/**
 * KVネームスペースのキー一覧を取得する
 */
async function listKeys(namespaceId: string): Promise<string[]> {
  const result = await $`bun wrangler kv key list --namespace-id=${namespaceId} --env=prod --remote`.quiet()
  const output = result.stdout.toString()

  try {
    const keys = JSON.parse(output) as KvKey[]
    return keys.map((k) => k.name)
  } catch {
    console.log(`  Failed to parse key list: ${output}`)
    return []
  }
}

/**
 * KVからキーの値を取得する
 */
async function getValue(namespaceId: string, key: string): Promise<string> {
  const result = await $`bun wrangler kv key get ${key} --namespace-id=${namespaceId} --env=prod --remote`.quiet()
  return result.stdout.toString()
}

/**
 * ローカルKVにキーと値を書き込む
 */
async function putLocalValue(binding: string, key: string, value: string): Promise<void> {
  await $`bun wrangler kv key put ${key} ${value} --binding=${binding} --local`.quiet()
}

/**
 * KVネームスペースを同期する
 */
async function syncNamespace(namespace: KvNamespace): Promise<void> {
  console.log(`\nSyncing ${namespace.binding}...`)

  const keys = await listKeys(namespace.namespaceId)
  console.log(`  Found ${keys.length} key(s)`)

  if (keys.length === 0) {
    console.log('  No keys to sync')
    return
  }

  for (const key of keys) {
    try {
      const value = await getValue(namespace.namespaceId, key)
      await putLocalValue(namespace.binding, key, value)
      console.log(`  Synced: ${key}`)
    } catch (error) {
      console.log(`  Failed to sync: ${key} - ${error}`)
    }
  }

  console.log(`  Done: synced ${keys.length} key(s)`)
}

async function main(): Promise<void> {
  console.log('Starting KV sync from production to local')

  for (const namespace of PROD_KV_NAMESPACES) {
    await syncNamespace(namespace)
  }

  console.log('\nAll KV namespaces synced successfully!')
}

main().catch((error) => {
  console.error('\nError occurred:')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

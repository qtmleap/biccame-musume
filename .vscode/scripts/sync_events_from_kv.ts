#!/usr/bin/env bun
/**
 * KVのイベントデータをD1データベースに同期するスクリプト
 *
 * 使い方:
 * bun .vscode/scripts/sync_events_from_kv.ts [環境]
 *
 * 環境: dev / prod (デフォルト: prod)
 */

import { $ } from 'bun'
import type { Event } from '@/schemas/event.dto'
import { STORE_NAME_LABELS } from '@/locales/app.content'

/**
 * 店舗名からキーへの逆マッピング
 */
const STORE_NAME_TO_KEY = Object.fromEntries(
  Object.entries(STORE_NAME_LABELS).map(([key, name]) => [name, key])
) as Record<string, string>

/**
 * 環境別のKVネームスペースID (BICCAME_MUSUME_EVENTS)
 */
const KV_NAMESPACE_IDS = {
  dev: 'ef49185c58d04a0790e7c68394d78089', // TODO: dev環境のIDを設定
  prod: 'ef49185c58d04a0790e7c68394d78089'
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
 * wrangler kv key getでイベントデータを取得
 */
const fetchEventsFromKV = async (namespaceId: string, env: Environment): Promise<Event[]> => {
  console.log(`🔍 ${env}環境のKVからイベントデータを取得中...`)

  const cmd = `bun wrangler kv key get events:list --namespace-id=${namespaceId} --env=${env} --remote`
  const result = await $`${{ raw: cmd }}`.quiet()

  const output = result.stdout.toString()
  try {
    return JSON.parse(output) as Event[]
  } catch {
    console.error('イベントデータの取得に失敗しました')
    return []
  }
}

/**
 * D1にイベントデータを投入
 */
const insertEventsToD1 = async (databaseName: string, events: Event[], env: Environment): Promise<void> => {
  console.log(`🚀 ローカルD1にイベントデータを投入中...`)

  if (events.length === 0) {
    console.log('  投入するデータがありません')
    return
  }

  // ローカルD1に投入
  const localFlag = '--local'

  // 既存のイベントを削除
  await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command "DELETE FROM events;"`.quiet()
  await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command "DELETE FROM event_conditions;"`.quiet()
  await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command "DELETE FROM event_reference_urls;"`.quiet()
  await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command "DELETE FROM event_stores;"`.quiet()

  console.log(`  ${events.length}件のイベントを投入します`)

  // バッチ処理（1回に10件ずつ）
  const batchSize = 10
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize)

    // イベント本体を投入
    const eventValues = batch
      .map((event) => {
        const name = event.name.replace(/'/g, "''")
        const category = event.category
        const startDate = event.startDate
        const endDate = event.endDate || 'NULL'
        const endedAt = event.endedAt || 'NULL'
        const limitedQuantity = event.limitedQuantity || 'NULL'
        const createdAt = event.createdAt || new Date().toISOString()
        const updatedAt = event.updatedAt || new Date().toISOString()

        return `('${event.id}', '${name}', '${category}', '${startDate}', ${endDate === 'NULL' ? 'NULL' : `'${endDate}'`}, ${endedAt === 'NULL' ? 'NULL' : `'${endedAt}'`}, ${limitedQuantity}, '${createdAt}', '${updatedAt}')`
      })
      .join(', ')

    const eventSql = `INSERT INTO events (id, name, category, start_date, end_date, ended_at, limited_quantity, created_at, updated_at) VALUES ${eventValues};`
    await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command ${eventSql}`.quiet()

    // 各イベントの関連データを投入
    for (const event of batch) {
      // 配布条件
      if (event.conditions && event.conditions.length > 0) {
        const conditionValues = event.conditions
          .map((condition) => {
            const id = crypto.randomUUID()
            const purchaseAmount = condition.purchaseAmount || 'NULL'
            const quantity = condition.quantity || 'NULL'
            const now = new Date().toISOString()
            return `('${id}', '${event.id}', '${condition.type}', ${purchaseAmount}, ${quantity}, '${now}', '${now}')`
          })
          .join(', ')

        const conditionSql = `INSERT INTO event_conditions (id, event_id, type, purchase_amount, quantity, created_at, updated_at) VALUES ${conditionValues};`
        await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command ${conditionSql}`.quiet()
      }

      // 対象店舗
      if (event.stores && event.stores.length > 0) {
        const storeValues = event.stores
          .map((store) => {
            const id = crypto.randomUUID()
            const now = new Date().toISOString()
            // 店舗名をキーに変換（既にキーの場合はそのまま、店舗名の場合は変換）
            const storeKey = STORE_NAME_TO_KEY[store] || store
            return `('${id}', '${event.id}', '${storeKey}', '${now}', '${now}')`
          })
          .join(', ')

        const storeSql = `INSERT INTO event_stores (id, event_id, store_key, created_at, updated_at) VALUES ${storeValues};`
        await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command ${storeSql}`.quiet()
      }

      // 参考URL
      if (event.referenceUrls && event.referenceUrls.length > 0) {
        const urlValues = event.referenceUrls
          .map((ref) => {
            const id = crypto.randomUUID()
            const url = ref.url.replace(/'/g, "''")
            const now = new Date().toISOString()
            return `('${id}', '${event.id}', '${ref.type}', '${url}', '${now}', '${now}')`
          })
          .join(', ')

        const urlSql = `INSERT INTO event_reference_urls (id, event_id, type, url, created_at, updated_at) VALUES ${urlValues};`
        await $`bun wrangler d1 execute ${databaseName} ${localFlag} --command ${urlSql}`.quiet()
      }
    }

    console.log(`  ${Math.min(i + batchSize, events.length)}/${events.length}件 投入完了`)
  }

  console.log('✅ イベントデータの投入が完了しました')
}

/**
 * メイン処理
 */
const main = async () => {
  // 引数から環境を取得（デフォルトはprod）
  const args = process.argv.slice(2)
  const env: Environment = (args[0] as Environment) || 'prod'

  if (env !== 'dev' && env !== 'prod') {
    console.error(`❌ 無効な環境: ${env}`)
    console.log('利用可能な環境: dev, prod')
    process.exit(1)
  }

  console.log(`🚀 ${env}環境のKVからローカルD1にイベントデータを同期します\n`)

  const namespaceId = KV_NAMESPACE_IDS[env]
  const databaseName = await getLocalDatabaseName()

  console.log(`📦 データベース: ${databaseName}`)
  console.log(`🔑 KVネームスペースID: ${namespaceId}\n`)

  // KVからイベントデータを取得
  const events = await fetchEventsFromKV(namespaceId, env)
  console.log(`✅ ${events.length}件のイベントを取得しました\n`)

  // D1にデータを投入
  await insertEventsToD1(databaseName, events, env)

  console.log('\n🎉 同期完了！')
}

main().catch((error) => {
  console.error('❌ エラーが発生しました:', error)
  process.exit(1)
})

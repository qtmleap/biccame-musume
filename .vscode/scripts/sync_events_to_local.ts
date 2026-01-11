#!/usr/bin/env bun
/**
 * リモートD1のイベントデータをローカルD1に同期するスクリプト
 *
 * 使い方:
 * bun .vscode/scripts/sync_events_to_local.ts [環境]
 *
 * 環境: dev / prod (デフォルト: prod)
 */

import { $ } from 'bun'

type Environment = 'dev' | 'prod'

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
 * リモートD1からイベントデータを取得
 */
const fetchEventsFromRemoteD1 = async (databaseName: string, env: Environment): Promise<any[]> => {
  console.log(`🔍 ${env}環境のD1からイベントデータを取得中...`)

  const envFlag = `--env=${env}`

  // イベント一覧を取得
  const eventsSql = 'SELECT * FROM events ORDER BY start_date DESC;'
  const eventsResult =
    await $`bun wrangler d1 execute ${databaseName} ${envFlag} --remote --command ${eventsSql} --json`.quiet()
  const eventsOutput = eventsResult.stdout.toString()
  const eventsData = JSON.parse(eventsOutput)
  const events = eventsData[0]?.results || []

  console.log(`  ${events.length}件のイベントを取得しました`)

  // 各イベントの関連データを取得
  const eventsWithDetails = []
  for (const event of events) {
    // 配布条件を取得
    const conditionsSql = `SELECT * FROM event_conditions WHERE event_id = '${event.id}';`
    const conditionsResult =
      await $`bun wrangler d1 execute ${databaseName} ${envFlag} --remote --command ${conditionsSql} --json`.quiet()
    const conditionsOutput = conditionsResult.stdout.toString()
    const conditionsData = JSON.parse(conditionsOutput)
    const conditions = conditionsData[0]?.results || []

    // 対象店舗を取得
    const storesSql = `SELECT * FROM event_stores WHERE event_id = '${event.id}';`
    const storesResult =
      await $`bun wrangler d1 execute ${databaseName} ${envFlag} --remote --command ${storesSql} --json`.quiet()
    const storesOutput = storesResult.stdout.toString()
    const storesData = JSON.parse(storesOutput)
    const stores = storesData[0]?.results || []

    // 参考URLを取得
    const urlsSql = `SELECT * FROM event_reference_urls WHERE event_id = '${event.id}';`
    const urlsResult =
      await $`bun wrangler d1 execute ${databaseName} ${envFlag} --remote --command ${urlsSql} --json`.quiet()
    const urlsOutput = urlsResult.stdout.toString()
    const urlsData = JSON.parse(urlsOutput)
    const urls = urlsData[0]?.results || []

    eventsWithDetails.push({
      event,
      conditions,
      stores,
      urls
    })
  }

  return eventsWithDetails
}

/**
 * ローカルD1にイベントデータを投入
 */
const insertEventsToLocalD1 = async (databaseName: string, eventsWithDetails: any[]): Promise<void> => {
  console.log('🚀 ローカルD1にイベントデータを投入中...')

  if (eventsWithDetails.length === 0) {
    console.log('  投入するデータがありません')
    return
  }

  // 既存のイベントを削除
  await $`bun wrangler d1 execute ${databaseName} --local --command "DELETE FROM events;"`.quiet()
  await $`bun wrangler d1 execute ${databaseName} --local --command "DELETE FROM event_conditions;"`.quiet()
  await $`bun wrangler d1 execute ${databaseName} --local --command "DELETE FROM event_reference_urls;"`.quiet()
  await $`bun wrangler d1 execute ${databaseName} --local --command "DELETE FROM event_stores;"`.quiet()

  console.log(`  ${eventsWithDetails.length}件のイベントを投入します`)

  // バッチ処理（1回に10件ずつ）
  const batchSize = 10
  for (let i = 0; i < eventsWithDetails.length; i += batchSize) {
    const batch = eventsWithDetails.slice(i, i + batchSize)

    // イベント本体を投入
    const eventValues = batch
      .map(({ event }) => {
        const name = event.name.replace(/'/g, "''")
        const category = event.category
        const startDate = event.start_date
        const endDate = event.end_date || 'NULL'
        const endedAt = event.ended_at || 'NULL'
        const limitedQuantity = event.limited_quantity || 'NULL'
        const createdAt = event.created_at
        const updatedAt = event.updated_at

        return `('${event.id}', '${name}', '${category}', '${startDate}', ${endDate === 'NULL' ? 'NULL' : `'${endDate}'`}, ${endedAt === 'NULL' ? 'NULL' : `'${endedAt}'`}, ${limitedQuantity}, '${createdAt}', '${updatedAt}')`
      })
      .join(', ')

    const eventSql = `INSERT INTO events (id, name, category, start_date, end_date, ended_at, limited_quantity, created_at, updated_at) VALUES ${eventValues};`
    await $`bun wrangler d1 execute ${databaseName} --local --command ${eventSql}`.quiet()

    // 各イベントの関連データを投入
    for (const { event, conditions, stores, urls } of batch) {
      // 配布条件
      if (conditions.length > 0) {
        const conditionValues = conditions
          .map((condition: any) => {
            const purchaseAmount = condition.purchase_amount || 'NULL'
            const quantity = condition.quantity || 'NULL'
            return `('${condition.id}', '${event.id}', '${condition.type}', ${purchaseAmount}, ${quantity}, '${condition.created_at}', '${condition.updated_at}')`
          })
          .join(', ')

        const conditionSql = `INSERT INTO event_conditions (id, event_id, type, purchase_amount, quantity, created_at, updated_at) VALUES ${conditionValues};`
        await $`bun wrangler d1 execute ${databaseName} --local --command ${conditionSql}`.quiet()
      }

      // 対象店舗
      if (stores.length > 0) {
        const storeValues = stores
          .map((store: any) => `('${store.id}', '${event.id}', '${store.store_key}', '${store.created_at}', '${store.updated_at}')`)
          .join(', ')

        const storeSql = `INSERT INTO event_stores (id, event_id, store_key, created_at, updated_at) VALUES ${storeValues};`
        await $`bun wrangler d1 execute ${databaseName} --local --command ${storeSql}`.quiet()
      }

      // 参考URL
      if (urls.length > 0) {
        const urlValues = urls
          .map((ref: any) => {
            const url = ref.url.replace(/'/g, "''")
            return `('${ref.id}', '${event.id}', '${ref.type}', '${url}', '${ref.created_at}', '${ref.updated_at}')`
          })
          .join(', ')

        const urlSql = `INSERT INTO event_reference_urls (id, event_id, type, url, created_at, updated_at) VALUES ${urlValues};`
        await $`bun wrangler d1 execute ${databaseName} --local --command ${urlSql}`.quiet()
      }
    }

    console.log(`  ${Math.min(i + batchSize, eventsWithDetails.length)}/${eventsWithDetails.length}件 投入完了`)
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

  console.log(`🚀 ${env}環境からローカルD1にイベントデータを同期します\n`)

  const databaseName = await getLocalDatabaseName()

  console.log(`📦 データベース: ${databaseName}\n`)

  // リモートD1からイベントデータを取得
  const eventsWithDetails = await fetchEventsFromRemoteD1(databaseName, env)
  console.log(`✅ ${eventsWithDetails.length}件のイベントを取得しました\n`)

  // ローカルD1にデータを投入
  await insertEventsToLocalD1(databaseName, eventsWithDetails)

  console.log('\n🎉 同期完了！')
}

main().catch((error) => {
  console.error('❌ エラーが発生しました:', error)
  process.exit(1)
})

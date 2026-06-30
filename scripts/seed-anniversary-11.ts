/**
 * 11周年記念キャンペーン用 EventGroup + 紐付く Event を D1 に投入する seed スクリプト。
 *
 * Usage:
 *   source .env && bun run anniversary:seed [local-staging|remote-staging|remote-production]
 *
 * 仕様:
 *   - EventGroup 2 件: 名刺 (anniversary-11-cards) / 缶バッジ (anniversary-11-badges)
 *   - 各物理店舗ごとに、上記 2 グループそれぞれに属する Event を 1 件ずつ生成
 *   - EventGroup の slug を unique キーとして INSERT OR IGNORE、Event の id は
 *     UUID v5 で `<slug>:<storeKey>` から決定論的に生成し INSERT OR IGNORE
 *   - 同一スクリプトを複数回流しても重複追加されない冪等性を確保
 *   - event_stores も同様に決定論 UUID で紐付け
 *   - すべて isVerified=true で投入（公開対象）
 */

import { $ } from 'bun'
import { v5 as uuidv5 } from 'uuid'
import { PHYSICAL_STORE_KEYS } from '../src/data/badges/store-exclusion'
import { STORE_NAME_LABELS } from '../src/locales/app.content'
import type { StoreKey } from '../src/schemas/store.dto'

type TargetEnv = 'local-staging' | 'remote-staging' | 'remote-production'

// 固定 namespace UUID（11周年キャンペーン専用）
// この値は決して変えない。変えると次回 seed で別 UUID になり重複が増える。
const ANNIVERSARY_NAMESPACE = 'b00c8a11-1111-4d11-8d11-b1ccame00011a'

type GroupSpec = {
  slug: string
  title: string
  description: string
  itemType: 'card' | 'badge'
  sortOrder: number
  eventCategory: 'limited_card' | 'other'
  eventTitle: (storeName: string) => string
}

const GROUPS: GroupSpec[] = [
  {
    slug: 'anniversary-11-cards',
    title: 'ビッカメ娘11周年記念名刺',
    description: '11周年を記念して全店舗で配布される店舗限定の特別名刺をコンプリートしよう。',
    itemType: 'card',
    sortOrder: 1,
    eventCategory: 'limited_card',
    eventTitle: (name) => `11周年記念名刺 - ${name}`
  },
  {
    slug: 'anniversary-11-badges',
    title: 'ビッカメ娘11周年記念缶バッジ',
    description: '11周年を記念して全店舗で配布される店舗限定の特別缶バッジをコンプリートしよう。',
    itemType: 'badge',
    sortOrder: 2,
    eventCategory: 'other',
    eventTitle: (name) => `11周年記念缶バッジ - ${name}`
  }
]

const getWranglerArgs = (env: TargetEnv): string[] => {
  const envName = env === 'remote-production' ? 'production' : 'staging'
  const dbName = env === 'remote-production' ? 'biccame-musume-prod' : 'biccame-musume-dev'
  const locationFlag = env === 'local-staging' ? '--local' : '--remote'
  return [dbName, locationFlag, `--env=${envName}`]
}

const escapeSql = (value: string): string => value.replace(/'/g, "''")

const storeLabel = (key: StoreKey): string => STORE_NAME_LABELS[key] ?? key

const startDateIso = new Date().toISOString()

const buildSql = (): string => {
  const lines: string[] = []
  lines.push('-- 11周年記念キャンペーン seed (auto-generated)')
  lines.push('PRAGMA defer_foreign_keys = TRUE;')

  for (const group of GROUPS) {
    const groupId = uuidv5(`group:${group.slug}`, ANNIVERSARY_NAMESPACE)
    lines.push(
      `INSERT OR IGNORE INTO event_groups (id, slug, title, description, item_type, start_date, end_date, sort_order, created_at, updated_at) VALUES (` +
        `'${groupId}', ` +
        `'${escapeSql(group.slug)}', ` +
        `'${escapeSql(group.title)}', ` +
        `'${escapeSql(group.description)}', ` +
        `'${group.itemType}', ` +
        `'${startDateIso}', ` +
        `NULL, ` +
        `${group.sortOrder}, ` +
        `CURRENT_TIMESTAMP, ` +
        `CURRENT_TIMESTAMP);`
    )

    for (const storeKey of PHYSICAL_STORE_KEYS) {
      const eventId = uuidv5(`event:${group.slug}:${storeKey}`, ANNIVERSARY_NAMESPACE)
      const eventStoreId = uuidv5(`event-store:${group.slug}:${storeKey}`, ANNIVERSARY_NAMESPACE)
      const title = group.eventTitle(storeLabel(storeKey))
      lines.push(
        `INSERT OR IGNORE INTO events (id, category, title, start_date, end_date, ended_at, limited_quantity, is_verified, is_preliminary, group_id, created_at, updated_at) VALUES (` +
          `'${eventId}', ` +
          `'${group.eventCategory}', ` +
          `'${escapeSql(title)}', ` +
          `'${startDateIso}', ` +
          `NULL, ` +
          `NULL, ` +
          `NULL, ` +
          `1, ` +
          `0, ` +
          `'${groupId}', ` +
          `CURRENT_TIMESTAMP, ` +
          `CURRENT_TIMESTAMP);`
      )
      lines.push(
        `INSERT OR IGNORE INTO event_stores (id, event_id, store_key, created_at, updated_at) VALUES (` +
          `'${eventStoreId}', ` +
          `'${eventId}', ` +
          `'${escapeSql(storeKey)}', ` +
          `CURRENT_TIMESTAMP, ` +
          `CURRENT_TIMESTAMP);`
      )
    }
  }

  return lines.join('\n') + '\n'
}

const main = async (): Promise<void> => {
  const targetEnv = (process.argv[2] ?? 'local-staging') as TargetEnv
  if (!['local-staging', 'remote-staging', 'remote-production'].includes(targetEnv)) {
    console.error('Usage: bun run anniversary:seed [local-staging|remote-staging|remote-production]')
    process.exit(1)
  }

  console.log(
    `Seeding ${GROUPS.length} groups × ${PHYSICAL_STORE_KEYS.length} stores ` +
      `= ${GROUPS.length * PHYSICAL_STORE_KEYS.length} events to ${targetEnv}`
  )

  const tmpFile = `/tmp/seed-anniversary-11-${Date.now()}.sql`
  await Bun.write(tmpFile, buildSql())

  const args = getWranglerArgs(targetEnv)
  try {
    await $`bun wrangler d1 execute ${args} --file=${tmpFile}`
    console.log('✓ Seed completed')
  } catch (err) {
    console.error('✗ Seed failed:', err)
    process.exit(1)
  }
}

await main()

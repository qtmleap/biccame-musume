/**
 * Badge backfill script — evaluates all badges for all existing users and awards
 * any newly earned badges. Idempotent: the UNIQUE(user_id, badge_code) constraint
 * silently prevents duplicate inserts via INSERT OR IGNORE.
 *
 * Usage:
 *   source .env && bun run badges:backfill [local-staging|remote-staging|remote-production]
 *
 * IMPORTANT: Must be run with `source .env &&` prefix so that CLOUDFLARE_API_TOKEN is available
 * to wrangler. See project memory: feedback_wrangler_source_env.md
 */

import { $ } from 'bun'
import { storeKeyToBadgeArea } from '../src/data/badges/area-mapping'
import type { BadgeArea } from '../src/data/badges/area-mapping'
import { PHYSICAL_STORE_KEYS } from '../src/data/badges/store-exclusion'
import type { BadgeSubCategory } from '../src/data/badges/registry'

type TargetEnv = 'local-staging' | 'remote-staging' | 'remote-production'

function getWranglerArgs(env: TargetEnv): string[] {
  const envName = env === 'remote-production' ? 'production' : 'staging'
  const dbName = env === 'remote-production' ? 'biccame-musume-prod' : 'biccame-musume-dev'
  const locationFlag = env === 'local-staging' ? '--local' : '--remote'
  return [dbName, locationFlag, `--env=${envName}`]
}

async function queryJson<T>(args: string[], sql: string): Promise<T[]> {
  const result = await $`bun wrangler d1 execute ${args} --json --command ${sql}`.quiet()
  const parsed = JSON.parse(result.stdout.toString()) as Array<{ results?: T[] }>
  return parsed[0]?.results ?? []
}

// Evaluate a single badge for a single user using SQL logic.
// Returns true if the condition is met.
async function evaluateBadgeForUser(
  args: string[],
  userId: string,
  subCategory: BadgeSubCategory,
  conditionMeta: Record<string, unknown>
): Promise<boolean> {
  const uid = userId.replace(/'/g, "''")

  switch (subCategory) {
    case 'visit': {
      const storeKey = String(conditionMeta.storeKey ?? '').replace(/'/g, "''")
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM user_stores WHERE user_id='${uid}' AND store_key='${storeKey}' AND status='visited';`
      )
      return (rows[0]?.c ?? 0) > 0
    }

    case 'area_any': {
      const region = String(conditionMeta.region ?? '') as BadgeArea
      const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === region)
        .map((k) => `'${k}'`)
        .join(',')
      if (!storeKeys) return false
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM user_stores WHERE user_id='${uid}' AND store_key IN (${storeKeys}) AND status='visited';`
      )
      return (rows[0]?.c ?? 0) >= 1
    }

    case 'area_complete': {
      const region = String(conditionMeta.region ?? '') as BadgeArea
      const storeKeysInArea = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === region)
      if (storeKeysInArea.length === 0) return false
      const storeKeysSql = storeKeysInArea.map((k) => `'${k}'`).join(',')
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(DISTINCT store_key) as c FROM user_stores WHERE user_id='${uid}' AND store_key IN (${storeKeysSql}) AND status='visited';`
      )
      return (rows[0]?.c ?? 0) >= storeKeysInArea.length
    }

    case 'count': {
      const count = Number(conditionMeta.count ?? 0)
      const allKeys = PHYSICAL_STORE_KEYS.map((k) => `'${k}'`).join(',')
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(DISTINCT store_key) as c FROM user_stores WHERE user_id='${uid}' AND store_key IN (${allKeys}) AND status='visited';`
      )
      return (rows[0]?.c ?? 0) >= count
    }

    case 'event_count': {
      const count = Number(conditionMeta.count ?? 0)
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM user_events WHERE user_id='${uid}' AND status='completed';`
      )
      return (rows[0]?.c ?? 0) >= count
    }

    case 'event_clear_at_store': {
      const storeKey = String(conditionMeta.storeKey ?? '').replace(/'/g, "''")
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM user_events ue ` +
          `JOIN event_stores es ON ue.event_id = es.event_id ` +
          `WHERE ue.user_id='${uid}' AND ue.status='completed' AND es.store_key='${storeKey}';`
      )
      return (rows[0]?.c ?? 0) >= 1
    }

    case 'event_clear_area_any': {
      const region = String(conditionMeta.region ?? '') as BadgeArea
      const storeKeys = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === region)
        .map((k) => `'${k}'`)
        .join(',')
      if (!storeKeys) return false
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM user_events ue ` +
          `JOIN event_stores es ON ue.event_id = es.event_id ` +
          `WHERE ue.user_id='${uid}' AND ue.status='completed' AND es.store_key IN (${storeKeys});`
      )
      return (rows[0]?.c ?? 0) >= 1
    }

    case 'event_clear_area_complete': {
      const region = String(conditionMeta.region ?? '') as BadgeArea
      const storeKeysInArea = PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === region)
      if (storeKeysInArea.length === 0) return false
      // Check each store individually
      for (const sk of storeKeysInArea) {
        const skEsc = sk.replace(/'/g, "''")
        const rows = await queryJson<{ c: number }>(
          args,
          `SELECT COUNT(*) as c FROM user_events ue ` +
            `JOIN event_stores es ON ue.event_id = es.event_id ` +
            `WHERE ue.user_id='${uid}' AND ue.status='completed' AND es.store_key='${skEsc}';`
        )
        if ((rows[0]?.c ?? 0) === 0) return false
      }
      return true
    }

    case 'event_clear_count': {
      const count = Number(conditionMeta.count ?? 0)
      const allKeys = PHYSICAL_STORE_KEYS.map((k) => `'${k}'`).join(',')
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(DISTINCT es.store_key) as c FROM user_events ue ` +
          `JOIN event_stores es ON ue.event_id = es.event_id ` +
          `WHERE ue.user_id='${uid}' AND ue.status='completed' AND es.store_key IN (${allKeys});`
      )
      return (rows[0]?.c ?? 0) >= count
    }

    case 'event_clear_all': {
      const allKeys = PHYSICAL_STORE_KEYS.map((k) => `'${k}'`).join(',')
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(DISTINCT es.store_key) as c FROM user_events ue ` +
          `JOIN event_stores es ON ue.event_id = es.event_id ` +
          `WHERE ue.user_id='${uid}' AND ue.status='completed' AND es.store_key IN (${allKeys});`
      )
      return (rows[0]?.c ?? 0) >= PHYSICAL_STORE_KEYS.length
    }

    case 'vote_total': {
      const count = Number(conditionMeta.count ?? 0)
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM votes WHERE user_id='${uid}';`
      )
      return (rows[0]?.c ?? 0) >= count
    }

    case 'vote_unique': {
      const count = Number(conditionMeta.count ?? 0)
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(DISTINCT character_id) as c FROM votes WHERE user_id='${uid}';`
      )
      return (rows[0]?.c ?? 0) >= count
    }

    case 'vote_devotion': {
      const count = Number(conditionMeta.count ?? 0)
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT MAX(cnt) as c FROM (SELECT COUNT(*) as cnt FROM votes WHERE user_id='${uid}' GROUP BY character_id);`
      )
      return (rows[0]?.c ?? 0) >= count
    }

    case 'vote_all_biccame': {
      // Read biccame musume IDs from characters.json
      const chars = (await import('../public/characters.json', { with: { type: 'json' } })) as {
        default: Array<{ id: string; character: { is_biccame_musume?: boolean } }>
      }
      const biccameIds = chars.default.filter((c) => c.character.is_biccame_musume === true).map((c) => c.id)
      if (biccameIds.length === 0) return false
      const idsSql = biccameIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(DISTINCT character_id) as c FROM votes WHERE user_id='${uid}' AND character_id IN (${idsSql});`
      )
      return (rows[0]?.c ?? 0) >= biccameIds.length
    }

    case 'special_multi_store_clear': {
      const storeKeys = (conditionMeta.storeKeys as string[] | undefined) ?? []
      for (const sk of storeKeys) {
        const skEsc = sk.replace(/'/g, "''")
        const rows = await queryJson<{ c: number }>(
          args,
          `SELECT COUNT(*) as c FROM user_events ue ` +
            `JOIN event_stores es ON ue.event_id = es.event_id ` +
            `WHERE ue.user_id='${uid}' AND ue.status='completed' AND es.store_key='${skEsc}';`
        )
        if ((rows[0]?.c ?? 0) === 0) return false
      }
      return storeKeys.length > 0
    }

    case 'special_event_id': {
      const eventId = String(conditionMeta.eventId ?? '').replace(/'/g, "''")
      const rows = await queryJson<{ c: number }>(
        args,
        `SELECT COUNT(*) as c FROM user_events WHERE user_id='${uid}' AND event_id='${eventId}' AND status='completed';`
      )
      return (rows[0]?.c ?? 0) >= 1
    }

    default: {
      const _exhaustive: never = subCategory
      throw new Error(`Unknown badge subCategory: ${_exhaustive}`)
    }
  }
}

async function main(): Promise<void> {
  const targetEnv = (process.argv[2] ?? 'local-staging') as TargetEnv
  if (!['local-staging', 'remote-staging', 'remote-production'].includes(targetEnv)) {
    console.error('Usage: bun run badges:backfill [local-staging|remote-staging|remote-production]')
    process.exit(1)
  }

  const args = getWranglerArgs(targetEnv)

  console.log(`Starting badge backfill on ${targetEnv}...`)

  // Fetch all users
  const users = await queryJson<{ id: string }>(args, 'SELECT id FROM users;')
  console.log(`  Found ${users.length} users`)

  // Fetch all non-hidden badges
  const badges = await queryJson<{
    code: string
    sub_category: string
    condition_meta: string
  }>(args, "SELECT code, sub_category, condition_meta FROM badges WHERE is_hidden = 0;")
  console.log(`  Found ${badges.length} badges to evaluate`)

  let totalAwarded = 0

  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    if (!user) continue
    const userId = user.id

    // Fetch already-earned badge codes for this user
    const earned = await queryJson<{ badge_code: string }>(
      args,
      `SELECT badge_code FROM user_badges WHERE user_id='${userId.replace(/'/g, "''")}';`
    )
    const earnedSet = new Set(earned.map((e) => e.badge_code))

    let awardedThisUser = 0

    for (const badge of badges) {
      if (earnedSet.has(badge.code)) continue

      let meta: Record<string, unknown> = {}
      try {
        meta = JSON.parse(badge.condition_meta) as Record<string, unknown>
      } catch {
        console.warn(`  Warning: could not parse condition_meta for badge ${badge.code}`)
        continue
      }

      const earned = await evaluateBadgeForUser(args, userId, badge.sub_category as BadgeSubCategory, meta)

      if (earned) {
        const uidEsc = userId.replace(/'/g, "''")
        const codeEsc = badge.code.replace(/'/g, "''")
        // INSERT OR IGNORE is idempotent — UNIQUE constraint prevents duplicates silently.
        await $`bun wrangler d1 execute ${args} --command ${`INSERT OR IGNORE INTO user_badges (id, user_id, badge_code, earned_at) VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), '${uidEsc}', '${codeEsc}', datetime('now'));`}`.quiet()
        awardedThisUser++
        totalAwarded++
      }
    }

    console.log(`[${i + 1}/${users.length}] user_id=${userId} awarded=${awardedThisUser}`)
  }

  console.log(`\nBackfill complete.`)
  console.log(`  Total users processed: ${users.length}`)
  console.log(`  Total badges awarded:  ${totalAwarded}`)
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})

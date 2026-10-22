import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { judgeAcsta } from '../seed'
import { readGold, writeAtomic } from '../store'
import { chain } from './common'
import type { AcstaSqlRun } from './run-types'
import type { CategoryRow } from './snapshot'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 本番の確認済みイベント（gold.json）のうち、acsta の規則（judgeAcsta）に当たるものの UPDATE 文を作る。実行はしない。
 * 1 行 1 件で、WHERE に category = 'other' を入れる（再実行しても変わらない。D1 のリモート実行は BEGIN / COMMIT を受け付けないので書かない）。
 * 先頭のコメントに件数・生成日時・元データを書く。
 */
export const buildAcstaProductionSql = (
  events: readonly { uuid: string; title: string; category: string }[],
  meta: { generatedAt: string; source: string; fetchedAt: string }
) => {
  const rows = events
    .filter((event) => judgeAcsta(event.title, event.category) === 'convert')
    .map(({ uuid, title }) => ({ id: uuid, title }))
    .sort((a, b) => chain(a.title.localeCompare(b.title), a.id.localeCompare(b.id)))
  for (const row of rows) if (!UUID_PATTERN.test(row.id)) throw new Error(`not a uuid: ${row.id}`)
  const text = `${[
    '-- 本番 D1: 題がアクスタ（アクスタ・アクリルスタンド。アクキー・キーホルダーを含まない）で category が other のイベントを acsta にする',
    `-- 件数: ${rows.length}`,
    `-- 生成日時: ${meta.generatedAt}`,
    `-- 元データ: gold.json（${meta.source} の公開 API から ${meta.fetchedAt} に取った確認済みイベント）`,
    "-- 1 行 1 件。WHERE に category = 'other' があるので、再実行しても変わらない（冪等）",
    ...rows.map(
      (row) =>
        `UPDATE events SET category='acsta', updated_at='${toD1DateTime(meta.generatedAt)}' WHERE id='${row.id}' AND category='other';`
    )
  ].join('\n')}\n`
  return { rows, text }
}

/** SQL を書き、ローカル D1 の同じ id の行と照合する */
export const writeAcstaSql = async (
  path: string,
  goldPath: string,
  now: string,
  local: readonly CategoryRow[]
): Promise<AcstaSqlRun> => {
  const gold = await readGold(goldPath)
  const { rows, text } = buildAcstaProductionSql(gold.events, {
    generatedAt: now,
    source: gold.source,
    fetchedAt: gold.fetchedAt
  })
  await writeAtomic(path, text)
  const localById = new Map(local.map((row) => [row.id, row] as const))
  const matched = rows.map((row) => {
    const found = localById.get(row.id)
    return { ...row, local: found === undefined ? null : { isVerified: found.isVerified, category: found.category } }
  })
  const sqlIds = new Set(rows.map((row) => row.id))
  return {
    path,
    source: gold.source,
    fetchedAt: gold.fetchedAt,
    goldEvents: gold.events.length,
    count: rows.length,
    rows: matched,
    match: {
      verified: matched.filter((row) => row.local !== null && row.local.isVerified).length,
      unverified: matched.filter((row) => row.local !== null && !row.local.isVerified).length,
      absent: matched.filter((row) => row.local === null).length
    },
    localVerifiedNotInSql: local
      .filter(
        (row) =>
          row.isVerified &&
          !sqlIds.has(row.id) &&
          (row.category === 'other' || row.category === 'acsta') &&
          judgeAcsta(row.title, 'other') === 'convert'
      )
      .map(({ id, title, category }) => ({ id, title, category }))
  }
}

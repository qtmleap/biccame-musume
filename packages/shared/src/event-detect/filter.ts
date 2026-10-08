import type { DetectPost } from './post'

/**
 * 配布イベントの投稿に現れる語。LLM に渡す前の機械的な絞り込みに使う。
 *
 * D1 の参考 URL が指す投稿（2025-10〜2026-10 の 389 件）を取りこぼさず、通過件数を
 * 増やす語を足さない方針で選んだ。「プレゼント」「限定」「税込」は正解を 1 件も増やさずに
 * 通過件数だけを 700〜3,400 件増やすため入れていない。
 */
export const KEYWORD_GROUPS = {
  item: [
    '名刺',
    'アクキー',
    'アクリルキーホルダー',
    'アクスタ',
    'アクリルスタンド',
    '缶バッジ',
    '缶バッチ',
    'ステッカー',
    'ポストカード',
    'ギフトカード',
    'ノベルティ',
    '千社札',
    'マグネット'
  ],
  give: ['配布', '配り', 'お渡し', 'もらえる', '貰える', 'ゲット', '先着', '整理券'],
  condition: ['円以上', 'ご提示'],
  end: ['終了', '完売', '完配', '無くなり', 'なくなり', '品切れ'],
  start: ['開始', 'スタート', '予告', '企画', 'イベント']
} as const

export type KeywordGroup = keyof typeof KEYWORD_GROUPS

export type KeywordHit = { keyword: string; group: KeywordGroup }

export const KEYWORDS: readonly KeywordHit[] = Object.entries(KEYWORD_GROUPS).flatMap(([group, keywords]) =>
  keywords.map((keyword) => ({ keyword, group: toGroup(group) }))
)

function toGroup(value: string): KeywordGroup {
  if (value === 'item' || value === 'give' || value === 'condition' || value === 'end' || value === 'start')
    return value
  throw new Error(`Unknown keyword group: ${value}`)
}

/**
 * 除外理由。判定はこの並び順で行い、最初に当たった理由だけを返す。
 * - retweet: 他人の告知を拡散しただけで、その店舗のイベントではない
 * - reply_to_other: 他アカウントへの返信。自分の告知への追記（自己リプライ）は残す
 * - non_store_account: 店舗アカウント以外の投稿（リストに入っている個人アカウント）
 * - no_keyword: 配布に関わる語を含まない
 */
export const DROP_REASONS = ['retweet', 'reply_to_other', 'non_store_account', 'no_keyword'] as const

export type DropReason = (typeof DROP_REASONS)[number]

/**
 * 比較用に本文を正規化する。全角英数と半角カナを NFKC で揃え、URL と空白を除く。
 */
export const normalizeText = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, '')

/**
 * 正規化済みの本文に含まれる語を返す。disabled に含まれる語は数えない。
 */
export const matchKeywords = (normalized: string, disabled: ReadonlySet<string> = new Set()): KeywordHit[] =>
  KEYWORDS.filter((hit) => !disabled.has(hit.keyword) && normalized.includes(hit.keyword))

/**
 * 日付や当日・翌日を示す表現。告知・開始・終了の投稿はほぼ必ず日付を伴う。
 */
const DATE_PATTERN = /\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}日\(|本日|明日|今日|最終日/

export const hasDateExpression = (normalized: string): boolean => DATE_PATTERN.test(normalized)

/**
 * 景品・配布方法（または購入条件）・日付が揃った投稿。登録漏れ候補の抽出に使う。
 */
export const isStrongSignal = (hits: readonly KeywordHit[], normalized: string): boolean =>
  hits.some((hit) => hit.group === 'item') &&
  hits.some((hit) => hit.group === 'give' || hit.group === 'condition') &&
  hasDateExpression(normalized)

/**
 * 語の判定より前に決まる除外理由。storeAccounts は小文字の screen_name。
 */
export const structuralDropReason = (
  post: Pick<DetectPost, 'kind' | 'screenName' | 'replyTo'>,
  storeAccounts: ReadonlySet<string>
): Exclude<DropReason, 'no_keyword'> | undefined => {
  if (post.kind === 'retweet') return 'retweet'
  if (post.replyTo && post.replyTo.screenName.toLowerCase() !== post.screenName.toLowerCase()) return 'reply_to_other'
  if (!storeAccounts.has(post.screenName.toLowerCase())) return 'non_store_account'
  return undefined
}

export type Verdict = {
  /** 除外理由。通過した場合は undefined */
  reason: DropReason | undefined
  hits: KeywordHit[]
  strong: boolean
}

/**
 * 1 件の投稿を判定する。
 */
export const classifyPost = (
  post: Pick<DetectPost, 'kind' | 'screenName' | 'replyTo' | 'text'>,
  options: { storeAccounts: ReadonlySet<string>; disabled?: ReadonlySet<string> }
): Verdict => {
  const normalized = normalizeText(post.text)
  const hits = matchKeywords(normalized, options.disabled)
  const structural = structuralDropReason(post, options.storeAccounts)
  const reason = structural ? structural : hits.length === 0 ? 'no_keyword' : undefined
  return { reason, hits, strong: reason === undefined && isStrongSignal(hits, normalized) }
}

/**
 * 同じ文面の投稿をまとめるためのキー。複数店舗が同じ告知を同時に投稿する場合や、
 * 同じ店舗が同じ告知を繰り返す場合に一致する。LLM の呼び出しはこの単位で 1 回にできる。
 */
export const dedupKey = (text: string): string => normalizeText(text)

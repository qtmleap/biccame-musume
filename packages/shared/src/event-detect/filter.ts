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
 * キーワードを含んでいても、ビッカメ娘と関係ない投稿に現れる語（逆方向のフィルタ）。
 * 商品の販売・トレカ・家電売場・メーカーの販促など、店舗アカウントが日常的に投稿する話題。
 *
 * D1 に登録済みのイベントは直近 1 年ぶん揃っている前提で、キーワードを通過したのに
 * 近くに D1 のイベントが無い投稿から選んだ。正解 385 件を 1 件も落とさず、
 * 通過投稿 13,115 件のうち 5,531 件を除く（2026-10-08 時点のアーカイブ）。
 * 「フェア」「抽選」はビッカメ娘のイベントでも使われるので、RESCUE_KEYWORDS と組み合わせて使う。
 */
export const EXCLUDE_GROUPS = {
  sales: [
    '発売',
    '予約',
    '受付',
    '抽選販売',
    '当選',
    '入荷',
    '販売中',
    '価格',
    '製品',
    '新製品',
    'お品切れ',
    '品切れ',
    'ご本人様'
  ],
  games: [
    'カードゲーム',
    'ポケモン',
    'ポケカ',
    'デッキ',
    '拡張パック',
    'ブースター',
    'MEGA',
    'ワンピースカード',
    '遊戯王',
    'Switch',
    'Nintendo',
    '任天堂',
    'ソフト',
    'ゲーミング',
    'eスポーツ',
    '大会'
  ],
  appliances: [
    '家電',
    'スマホ',
    'iPhone',
    'PC',
    'ドライヤー',
    'イヤホン',
    'カメラコーナー',
    'おもちゃコーナー',
    'ゲームコーナー',
    '家電コーナー',
    'リフォーム',
    '携帯',
    '相談',
    '取り扱い',
    'サービス'
  ],
  promotion: [
    '体験会',
    '体験イベント',
    'お試し',
    '試聴',
    '実演',
    '試食',
    'メーカー',
    'セール',
    'お買い得',
    '特価',
    'キャッシュバック',
    'クーポン',
    'キャンペーン',
    '抽選',
    'ガラポン',
    '景品',
    '無料',
    '週末',
    'フェア',
    'グッズ',
    'POPUP',
    '撮影会',
    'サイン会',
    'ガンプラ',
    'フィギュア'
  ]
} as const

export type ExcludeGroup = keyof typeof EXCLUDE_GROUPS

export type ExcludeHit = { keyword: string; group: ExcludeGroup }

export const EXCLUDE_KEYWORDS: readonly ExcludeHit[] = Object.entries(EXCLUDE_GROUPS).flatMap(([group, keywords]) =>
  keywords.map((keyword) => ({ keyword, group: toExcludeGroup(group) }))
)

function toExcludeGroup(value: string): ExcludeGroup {
  if (value === 'sales' || value === 'games' || value === 'appliances' || value === 'promotion') return value
  throw new Error(`Unknown exclude group: ${value}`)
}

/**
 * ビッカメ娘のノベルティに固有の語。これを含む投稿は除外語があっても除外しない。
 * このほかにキャラクター名（○○たん）も救済語として扱う（buildRescueTerms）。
 */
export const RESCUE_KEYWORDS = [
  'ビッカメ娘',
  'ビッ旅',
  // キャラクターの誕生記念（爆誕記念ポストカード・爆誕祭など）。2020〜2025 年の投稿で除外語に落ちていた
  '爆誕',
  // アキバたんの月替わり配布物。セール告知と同じ投稿に書かれることがある
  'ポストカードカレンダー',
  '名刺',
  'アクキー',
  'アクリルキーホルダー',
  'アクスタ',
  'アクリルスタンド',
  '缶バッジ',
  '缶バッチ',
  'ノベルティ'
] as const

/**
 * 除外理由。判定はこの並び順で行い、最初に当たった理由だけを返す。
 * - retweet: 他人の告知を拡散しただけで、その店舗のイベントではない
 * - reply_to_other: 他アカウントへの返信。自分の告知への追記（自己リプライ）は残す
 * - non_store_account: 店舗アカウント以外の投稿（リストに入っている個人アカウント）
 * - no_keyword: 配布に関わる語を含まない
 * - excluded_keyword: 除外語を含み、救済語（ビッカメ娘固有の語・キャラ名）を含まない
 */
export const DROP_REASONS = [
  'retweet',
  'reply_to_other',
  'non_store_account',
  'no_keyword',
  'excluded_keyword'
] as const

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
 * 正規化済みの本文に含まれる除外語を返す。disabled に含まれる語は数えない。
 */
export const matchExcludes = (normalized: string, disabled: ReadonlySet<string> = new Set()): ExcludeHit[] =>
  EXCLUDE_KEYWORDS.filter((hit) => !disabled.has(hit.keyword) && normalized.includes(hit.keyword))

/**
 * 救済語の一覧。キャラクター名は「○○たん」のものだけを使う（「ビックカメラ」「ナイセン」などは除く）。
 */
export const buildRescueTerms = (characterNames: readonly string[]): string[] => [
  ...new Set([
    ...RESCUE_KEYWORDS,
    ...characterNames.map(normalizeText).filter((name) => name.endsWith('たん') && name.length >= 3)
  ])
]

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
): Exclude<DropReason, 'no_keyword' | 'excluded_keyword'> | undefined => {
  if (post.kind === 'retweet') return 'retweet'
  if (post.replyTo && post.replyTo.screenName.toLowerCase() !== post.screenName.toLowerCase()) return 'reply_to_other'
  if (!storeAccounts.has(post.screenName.toLowerCase())) return 'non_store_account'
  return undefined
}

export type Verdict = {
  /** 除外理由。通過した場合は undefined */
  reason: DropReason | undefined
  hits: KeywordHit[]
  /** 構造で落ちていない投稿だけ数える */
  excludeHits: ExcludeHit[]
  rescueHits: string[]
  /** 強シグナル。除外語の判定より前（キーワードを通過した時点）で決める */
  strong: boolean
}

export type ClassifyOptions = {
  storeAccounts: ReadonlySet<string>
  /** buildRescueTerms の結果 */
  rescueTerms: readonly string[]
  disabled?: ReadonlySet<string>
  disabledExcludes?: ReadonlySet<string>
}

/**
 * 1 件の投稿を判定する。
 */
export const classifyPost = (
  post: Pick<DetectPost, 'kind' | 'screenName' | 'replyTo' | 'text'>,
  options: ClassifyOptions
): Verdict => {
  const normalized = normalizeText(post.text)
  const hits = matchKeywords(normalized, options.disabled)
  const structural = structuralDropReason(post, options.storeAccounts)
  if (structural) return { reason: structural, hits, excludeHits: [], rescueHits: [], strong: false }
  const excludeHits = matchExcludes(normalized, options.disabledExcludes)
  const rescueHits = options.rescueTerms.filter((term) => normalized.includes(term))
  const strong = hits.length > 0 && isStrongSignal(hits, normalized)
  const reason =
    hits.length === 0
      ? 'no_keyword'
      : excludeHits.length > 0 && rescueHits.length === 0
        ? 'excluded_keyword'
        : undefined
  return { reason, hits, excludeHits, rescueHits, strong }
}

/**
 * 同じ文面の投稿をまとめるためのキー。複数店舗が同じ告知を同時に投稿する場合や、
 * 同じ店舗が同じ告知を繰り返す場合に一致する。LLM の呼び出しはこの単位で 1 回にできる。
 */
export const dedupKey = (text: string): string => normalizeText(text)

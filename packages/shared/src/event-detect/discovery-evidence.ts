import { detectionCharacters } from './associations'
import { accounts } from './detection-context'
import { normalizeText } from './filter'
import type { DetectPost } from './post'

export type DiscoveryEvidenceProof = {
  code: string
  policy: 'character-subject-operation-v1'
  strength: 'explicit' | 'model-only'
  source: 'post' | 'quoted' | 'focus-evidence'
  sourceIndex: number
  sourceText: string
  start: number
  end: number
  quote: string
  normalizedSpan: { text: string; start: number; end: number }
  relation: string
  operation: string
}

type EvidenceSource = Pick<DiscoveryEvidenceProof, 'source' | 'sourceIndex' | 'sourceText'>
type EvidenceRule = {
  code: string
  strength: DiscoveryEvidenceProof['strength']
  relation: string
}

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const names = detectionCharacters
  .map((entry) => normalizeText(entry.name))
  .toSorted((a, b) => b.length - a.length)
  .map(escapePattern)
  .join('|')
const character = `(?:${names})`
const subjects = `${character}(?:[と&＆×・]${character}){0,4}`
const objects =
  '(?:名刺(?!サイズ|入れ|ケース|ホルダー|印刷)|アクキー|アクリルキーホルダ[ー―−ｰ]|アクスタ|アクリルスタンド|缶バッ[ジチ]|ステッカー|ポストカード|ギフトカード|ノベルティ|コースター|プレート)'
const design = '(?:デザイン|絵柄|イラスト|ver\\.?|バージョン|版|仕様)'
const edition =
  '(?:新しい|新作|新規|新|通常|限定|記念|コラボ|擬人化記念|(?:擬人化)?\\d+周年(?:記念)?|誕生日(?:記念)?|爆誕\\d+周年(?:記念)?|ハロウィン|バレンタイン|クリスマス|お正月|春|夏|秋|冬)'
const singleObject = `${objects}(?:${edition}){0,2}(?:${design})?`
const decoratedObject = `${singleObject}(?:[と&＆+＋・]${singleObject}){0,3}(?:セット)?`
const operation =
  '(?:配布|配り|配っ|お渡し|発行|販売|頒布|提供|プレゼント|残り|残数|完売|終了|撤去|展示|展開|開催|実施|受付)'
// 関係と操作の間には助詞・日時・数量などだけを許し、別の商品や述語を飛び越えない。
const bridge =
  '(?:(?:を|も|が|は|の|に|で|から|より|として|につき|について|本日|明日|今日|ただいま|現在|今週|今月|新たに|新しく|数量限定|限定|先着|税込|税抜|以上|以下|購入|ご購入|お買い上げ|入金|チャージ|名様|個|枚|名|様|円|まで|なくなり次第|なくなり|次第)|[0-9年月日/()（）.:〜～」』】－-]){0,45}'
const rules: readonly EvidenceRule[] = [
  {
    code: 'named_character_object',
    strength: 'explicit',
    relation: `${subjects}(?:との|の)?${edition}{0,3}(?:(?:${design})(?:の)?)?${edition}{0,2}${decoratedObject}`
  },
  {
    code: 'named_character_object',
    strength: 'explicit',
    relation: `${objects}${edition}{0,2}(?:#)?${subjects}${design}`
  },
  {
    code: 'named_character_object',
    strength: 'explicit',
    relation: `${subjects}(?:を描いた|が描かれた|が印刷された|をあしらった|がプリントされた)${edition}{0,2}${decoratedObject}`
  },
  {
    code: 'character_display_operation',
    strength: 'explicit',
    relation: `${character}(?:(?:の)?(?:等身大)?(?:パネル|ポスター|ポスパネ)|エリアの(?:キャラ)?(?:パネル|ポスター|ポスパネ))`
  },
  {
    code: 'explicit_character_anniversary_event',
    strength: 'explicit',
    relation: `${subjects}(?:の)?(?:擬人化)?(?:\\d+周年(?:記念)?|誕生日|記念)(?:イベント|フェア|撮影会|お渡し会)`
  },
  {
    code: 'explicit_own_object',
    strength: 'model-only',
    relation: `(?:私|わたし|僕|ぼく|うち|本人)(?:の)?${edition}{0,2}(?:名刺(?!サイズ|入れ|ケース|ホルダー|印刷)|アクキー|アクスタ)`
  },
  {
    code: 'official_card_distribution',
    strength: 'model-only',
    relation: '(?:当店の|こちらの|今月の|通常の|新しい|冬|春|夏|秋)名刺(?!サイズ|入れ|ケース|ホルダー|印刷)'
  }
]

const normalized = (text: string) => normalizeText(text).replaceAll(',', '')
const officialAccount = (screenName: string | undefined) =>
  screenName !== undefined && accounts.some((account) => account.screenName.toLowerCase() === screenName.toLowerCase())
const sourcesOf = (post: DetectPost): EvidenceSource[] => {
  if (post.extractionContext !== undefined) {
    const context = post.extractionContext
    // 抽出item名や参考原文の他物品ではなく、原文に実在する対象の根拠だけを使う。
    return context.evidence.flatMap((text, sourceIndex) =>
      context.originalText.includes(text) ||
      (officialAccount(context.quotedScreenName) && context.quotedText?.includes(text))
        ? [{ source: 'focus-evidence' as const, sourceIndex, sourceText: text }]
        : []
    )
  }
  return [
    { source: 'post', sourceIndex: 0, sourceText: post.text },
    ...(post.quoted?.text !== undefined && officialAccount(post.quoted.screenName)
      ? [{ source: 'quoted' as const, sourceIndex: 0, sourceText: post.quoted.text }]
      : [])
  ]
}

const proofsOf = (source: EvidenceSource, rule: EvidenceRule): DiscoveryEvidenceProof[] =>
  [...source.sourceText.matchAll(/[^。!?！？、；;]+/g)].flatMap((clause) => {
    const quote = clause[0]
    const text = normalized(quote)
    if (clause.index === undefined) return []
    const separator = source.sourceText[clause.index + quote.length]
    if (separator === '?' || separator === '？') return []
    const actionPattern = rule.code === 'character_display_operation' ? '(?:展示|展開|撤去|終了|入替|更新)' : operation
    const patterns = [
      new RegExp(`(?<relation>${rule.relation})${bridge}(?<operation>${actionPattern})`, 'giu'),
      new RegExp(
        `(?<operation>${actionPattern})(?:する|される|予定|いたします|します)(?:対象は|ものは|のは)(?<relation>${rule.relation})`,
        'giu'
      )
    ]
    return patterns.flatMap((pattern) =>
      [...text.matchAll(pattern)].flatMap((match) => {
        const relation = match.groups?.relation
        const action = match.groups?.operation
        if (relation === undefined || action === undefined || clause.index === undefined || match.index === undefined)
          return []
        const remainder = text.slice(match.index + match[0].length)
        if (
          /^(?:しません|していません|しない|されません|できません|いたしません|する予定はありません|予定はありません|予定はございません|はありません|はございません)/.test(
            remainder
          )
        )
          return []
        const reversed = match[0].startsWith(action)
        const remainingCount = /残り|残数/.test(action) && /^(?:[0-9]|は[0-9])/.test(remainder)
        const asserted =
          reversed ||
          remainingCount ||
          /^(?:$|中|開始|終了|予定|します|しました|する|しております|いた|して|され|させ|てい|ちゃい|始め|致し|のお知らせ|が決定|を開始|を実施|は(?:本日|明日|今日|終了|撤去))/.test(
            remainder
          )
        if (!asserted) return []
        return [
          {
            ...source,
            code: rule.code,
            policy: 'character-subject-operation-v1' as const,
            strength: rule.strength,
            start: clause.index,
            end: clause.index + quote.length,
            quote,
            normalizedSpan: { text: match[0], start: match.index, end: match.index + match[0].length },
            relation,
            operation: action
          }
        ]
      })
    )
  })

/** 支持する句・関係・操作を原文へ戻せる形で返す。弱い自己言及はモデル確認専用。 */
export const groundedDiscoveryProof = (post: DetectPost): DiscoveryEvidenceProof[] => {
  if (!officialAccount(post.screenName)) return []
  return sourcesOf(post).flatMap((source) => rules.flatMap((rule) => proofsOf(source, rule)))
}

/** 既存の表示コードは維持し、検証済みの関係・操作があるときだけ根拠を付ける。 */
export const groundedDiscoveryEvidence = (post: DetectPost): string[] => {
  const proof = groundedDiscoveryProof(post)
  if (proof.length === 0) return []
  return ['canonical_official_account', ...new Set(proof.map((entry) => entry.code)), 'explicit_event_operation']
}

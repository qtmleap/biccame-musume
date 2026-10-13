import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import type { ClefQuestion } from './clef'
import { normalizeText } from './filter'
import type { DetectPost } from './post'

dayjs.extend(customParseFormat)
dayjs.extend(utc)

// 日付候補の解釈を変更したため、旧CLIキャッシュとは分ける。
export const QUESTION_VERSION = 'v2'
export type StoreAccount = { storeId: string; name: string; screenName: string }

const jst = (iso: string) => dayjs.utc(iso).utcOffset(9 * 60)
export const jstDate = (iso: string) => jst(iso).format('YYYY-MM-DD')
export const jstWeekday = (iso: string) => '日月火水木金土'[jst(iso).day()]

/** 投稿本文は指示ではなく判定対象データとして渡す。 */
export const buildState = (post: DetectPost, accounts: readonly StoreAccount[]): string => {
  const own = accounts.filter((account) => account.screenName.toLowerCase() === post.screenName.toLowerCase())
  const author = own.length > 0 ? own.map((account) => `${account.name}（${account.storeId}）`).join('・') : '店舗以外'
  const lines = [
    `投稿日: ${jstDate(post.createdAt)}（${jstWeekday(post.createdAt)}）`,
    `投稿者: @${post.screenName} / ${author}`,
    `画像: ${post.media.length} 枚（画像の内容は含まれない）`,
    '本文:',
    post.text
  ]
  if (post.quoted?.text)
    lines.push('', `引用元 @${post.quoted.screenName ? post.quoted.screenName : '不明'}:`, post.quoted.text)
  return lines.join('\n')
}

export const STATUS_CRITERIA = {
  announce: '配布開始前の告知（明日から・○日から・予告）',
  start: '配布開始の案内（本日から・配布開始しました）',
  ongoing: '配布継続中の案内（まだあります・配布中・残りわずか）',
  end: '配布終了の案内（配布終了・なくなりました・完売・本日まで）',
  none: '配布イベントの状態は伝えていない'
} as const

export const CATEGORY_CRITERIA = {
  limited_card: '期間限定・数量限定・記念の名刺',
  regular_card: '通年配布の通常名刺',
  ackey: 'アクリルキーホルダー（アクキー）',
  other: 'アクスタ・缶バッジ・ステッカー・ポストカードなど名刺とアクキー以外',
  none: '配布物の話ではない'
} as const

export const baseQuestions = (): Record<string, ClefQuestion> => ({
  is_event: {
    type: 'noul',
    instructions:
      'この投稿は、ビッカメ娘（ビックカメラの店舗擬人化キャラクター）の名刺・アクリルキーホルダー・アクリルスタンド・缶バッジなどのノベルティを配布するイベントについての投稿ですか？ ビッカメ娘と関係ない商品の購入特典やメーカーのキャンペーンは含みません。'
  },
  status: {
    type: 'choice',
    instructions: 'この投稿が伝えている配布イベントの状態はどれですか？',
    criteria: { ...STATUS_CRITERIA }
  },
  category: {
    type: 'choice',
    instructions: 'この投稿で配布されるものは主にどれですか？',
    criteria: { ...CATEGORY_CRITERIA }
  }
})

export const storeCandidates = (
  post: DetectPost,
  accounts: readonly StoreAccount[],
  storeNames: Map<string, string[]>
) => {
  const text = normalizeText(post.text)
  const own = accounts.filter((account) => account.screenName.toLowerCase() === post.screenName.toLowerCase())
  const mentioned = [...storeNames.entries()]
    .filter(([, names]) => names.some((name) => text.includes(normalizeText(name))))
    .map(([id]) => id)
  return [...new Set([...own.map((account) => account.storeId), ...mentioned])]
}

const validDate = (year: number, month: number, day: number) => {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return dayjs.utc(value, 'YYYY-MM-DD', true).isValid() ? value : undefined
}

/** 明示された年を優先し、年のない月日は投稿日に近い有効な日付だけを候補にする。 */
export const dateCandidates = (post: DetectPost): string[] => {
  const text = normalizeText(post.quoted?.text ? `${post.text}\n${post.quoted.text}` : post.text)
  const posted = jst(post.createdAt)
  const found = [...text.matchAll(/(?<!\d)(?:(\d{4})(?:\/|年))?(\d{1,2})(?:\/|月)(\d{1,2})(?:日)?(?!\d)/g)].flatMap(
    (match) => {
      const month = Number(match[2])
      const day = Number(match[3])
      const explicitYear = match[1]
      if (explicitYear) {
        const date = validDate(Number(explicitYear), month, day)
        return date ? [date] : []
      }
      const candidates = [posted.year() - 1, posted.year(), posted.year() + 1]
        .map((year) => validDate(year, month, day))
        .filter((date): date is string => date !== undefined)
        .sort(
          (a, b) =>
            Math.abs(dayjs.utc(`${a}T00:00:00+09:00`).valueOf() - posted.valueOf()) -
            Math.abs(dayjs.utc(`${b}T00:00:00+09:00`).valueOf() - posted.valueOf())
        )
      const nearest = candidates[0]
      return nearest ? [nearest] : []
    }
  )
  const relative = [
    ...(/本日|今日/.test(text) ? [posted.format('YYYY-MM-DD')] : []),
    ...(/明日/.test(text) ? [posted.add(1, 'day').format('YYYY-MM-DD')] : [])
  ]
  return [...new Set([...found, ...relative])].sort()
}

export const quantityCandidates = (post: DetectPost): number[] => {
  const text = normalizeText(post.text).replace(/,/g, '')
  return [
    ...new Set(
      [...text.matchAll(/(?<!\d)(\d{1,6})(?:個|枚|名|人|セット|点|本)/g)]
        .map((match) => Number(match[1]))
        .filter((quantity) => quantity > 0)
    )
  ].sort((a, b) => a - b)
}

const labelOf = (labels: Map<string, string>, store: string) => {
  const label = labels.get(store)
  return label ? label : store
}
const dateKey = (date: string) => `d${date.replace(/-/g, '')}`
const quantityKey = (quantity: number) => `q${quantity}`
export const keyToDate = (key: string) =>
  /^d\d{8}$/.test(key) ? `${key.slice(1, 5)}-${key.slice(5, 7)}-${key.slice(7, 9)}` : undefined
export const keyToQuantity = (key: string) => (/^q\d+$/.test(key) ? Number(key.slice(1)) : undefined)

/** 候補なしの項目は質問しない。本文に存在しない値はモデルに生成させない。 */
export const valueQuestions = (post: DetectPost, stores: string[], storeLabels: Map<string, string>) => {
  const dates = dateCandidates(post).slice(0, 254)
  const quantities = quantityCandidates(post).slice(0, 254)
  const questions: Record<string, ClefQuestion> = {}
  if (stores.length >= 1) {
    questions.store = {
      type: 'choice',
      instructions:
        'この配布イベントを開催する店舗はどれですか？ 本文に店舗の記載があればその店舗、記載が無ければ投稿者の店舗を選んでください。',
      criteria: {
        ...Object.fromEntries(stores.slice(0, 254).map((store) => [store, labelOf(storeLabels, store)])),
        none: '本文に複数の店舗が書かれていて特定できない、または投稿者が店舗以外で本文にも店舗がない'
      }
    }
  }
  if (dates.length >= 1) {
    const candidates = Object.fromEntries(
      dates.map((date) => [dateKey(date), `${date}（${jstWeekday(`${date}T03:00:00Z`)}）`])
    )
    questions.start_date = {
      type: 'choice',
      instructions: '配布の開始日はどれですか？',
      criteria: { ...candidates, none: '本文に書かれていない' }
    }
    // 終了日は「なくなり次第終了」のように日付で終わりが決まらない告知が多いため、none を「終了日の記載なし」として明示する。
    questions.end_date = {
      type: 'choice',
      instructions:
        '配布の終了日（終了予定日）はどれですか？ 終了日が書かれていない場合や、『なくなり次第終了』『無くなり次第終了』のように日付で終わりが決まらない場合は、日付ではなく『終了日の記載なし』を選んでください。開始日を終了日として選ばないでください。',
      criteria: {
        ...candidates,
        none: '終了日の記載なし（『なくなり次第終了』など日付で終わりが決まらない場合を含む）'
      }
    }
  }
  if (quantities.length >= 1) {
    questions.quantity = {
      type: 'choice',
      instructions: '配布数（先着・限定の個数）はどれですか？',
      criteria: {
        ...Object.fromEntries(quantities.map((quantity) => [quantityKey(quantity), `${quantity}`])),
        none: '本文に書かれていない'
      }
    }
  }
  return { questions, dates, quantities }
}

import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { type DetectPostKind, DetectPostKindSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { dayjs } from '../../../workers/bot/src/timeline/utils/dayjs'
import { parseStatusUrl } from './gold'
import { type CallStats, endpointFromEnv, JUDGE_MODEL, type JudgeEndpoint } from './judge'
import { GapCategorySchema, GapStatusSchema } from './schema'
import {
  bodyCandidateIds,
  buildTitleTarget,
  pickBodies,
  runTitles,
  TITLE_MAX_LENGTH,
  TITLE_VERSION,
  type TitleCategory,
  type TitleProgress,
  type TitleRun,
  type TitleTarget,
  titleCost,
  titleExamples,
  titleSystem
} from './seed-title'
import { EMULATED_FILE, readGold, readJsonLines, readJudgements, readStoreNames, writeAtomic } from './store'

// seed: emulate が作った LLM イベントのうち Clef の判定も通ったものを、ローカル D1 にイベントとして作る。
// 書き込み先はローカル D1（.wrangler/state 配下の SQLite）だけで、INSERT のみ。既存の行は更新も削除もしない。
// 本番・staging の D1 には触れない（wrangler は使わず、SQLite のファイルを直接開く）。
// すでに作った自動作成分の直しは seed-fix.ts（seed --fix）。ここの規則（参考 URL・配布数・終了日の推定）を同じ形で当てる。

const JST_OFFSET_MS = 9 * 3_600_000
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * JST の暦日（YYYY-MM-DD）→ その日の JST 0 時を表す UTC の ISO（前日 15:00:00.000Z）。
 * 日付計算は UTC のエポックミリ秒で行い、実行環境のタイムゾーンに依存させない。存在しない日付は undefined。
 */
export const jstDayToUtcIso = (day: string) => {
  const match = DAY_PATTERN.exec(day)
  if (!match) return undefined
  const utcMidnight = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  // 2026-02-30 のように翌月へ繰り上がる日付は、往復すると元の文字列に戻らない
  if (dayjs(utcMidnight).toISOString().slice(0, 10) !== day) return undefined
  return dayjs(utcMidnight - JST_OFFSET_MS).toISOString()
}

/** --since / --before に使う暦日（YYYY-MM-DD）。暦として正しくなければ止まる */
export const assertDay = (name: string, raw: string) => {
  if (jstDayToUtcIso(raw) === undefined) throw new Error(`${name} must be a calendar date (YYYY-MM-DD): ${raw}`)
  return raw
}

/** 期間の既定の下限。D1 の既存イベントは 2023 年以降に集中している（--all-years で外す） */
export const DEFAULT_SEED_SINCE = '2023-01-01'

/** ISO 日時（Z 付きでも +00:00 でも）→ JST の暦日（YYYY-MM-DD）。読めなければ undefined */
export const jstDayOf = (iso: string) => {
  const time = Date.parse(iso)
  return Number.isNaN(time)
    ? undefined
    : dayjs(time + JST_OFFSET_MS)
        .toISOString()
        .slice(0, 10)
}

const DAY_MS = 86_400_000

/** エポックミリ秒 → JST の暦日（YYYY-MM-DD）。表せない値は undefined */
export const jstDayOfTime = (time: number) => {
  const shifted = dayjs(time + JST_OFFSET_MS)
  return Number.isFinite(time) && shifted.isValid() ? shifted.toISOString().slice(0, 10) : undefined
}

/** YYYY-MM-DD → 1970-01-01 からの日数（日の差を数えるため） */
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00.000Z`) / DAY_MS

/**
 * 終了予定日も終了日も無いイベントを「開催中」のまま残さないための日数。
 * 最後に言及された日（JST）から今日（JST）までがこの日数以上なら、その日を終了日（ended_at）とみなす。
 * 根拠: 終了の報告も終了予定日も無いイベントは、最後に言及された日を終了とみなす推定。アプリは終了予定日も終了日も無い
 * イベントを永久に「開催中」と表示するので、今も配布中かもしれない直近のものだけを null のまま残す。
 */
export const STALE_ENDED_DAYS = 30

/** 終了日の推定の結果。estimated=入れる / fresh=最後の言及から STALE_ENDED_DAYS 日未満（今も配布中かもしれない）/ before_start=開始日より前になる */
export type EndedEstimate = { kind: 'estimated'; day: string } | { kind: 'fresh' } | { kind: 'before_start' }

/** lastSeen（最後の言及の時刻。エポックミリ秒）・開始日（JST の暦日）・今日（JST の暦日）から、終了日を推定する */
export const estimateEnded = (lastSeen: number, startDay: string, today: string): EndedEstimate => {
  const lastDay = jstDayOfTime(lastSeen)
  if (lastDay === undefined || lastDay < startDay) return { kind: 'before_start' }
  return dayNumber(today) - dayNumber(lastDay) >= STALE_ENDED_DAYS
    ? { kind: 'estimated', day: lastDay }
    : { kind: 'fresh' }
}

/** 開始日（JST の暦日）が、今日（JST の暦日）から STALE_ENDED_DAYS 日以上前か（ちょうど STALE_ENDED_DAYS 日前を含む） */
export const isStaleStart = (startDay: string, today: string) =>
  dayNumber(today) - dayNumber(startDay) >= STALE_ENDED_DAYS

/**
 * 終了の情報が無いまま止まっているイベントか。kind は終了予定日も終了日も無いときの estimateEnded の結果で、
 * 終了の情報があるときは 'has_end'。次の 3 つが全部当てはまると止まっている:
 *  1. 終了予定日も終了日も無い 2. 最後の言及が開始日より前で、最後の言及の日を終了日に推定できない（before_start）
 *  3. 開始日が今日から STALE_ENDED_DAYS 日以上前
 * アプリは終了の情報が無いイベントを永久に「開催中」と表示する。告知したきり言及が無く、終了日を推定する材料も無いまま
 * 開始から日がたったイベントは、seed では作らず、seed --fix では削除する。最後の言及が最近のもの（fresh）は
 * 今も配布中かもしれないので、開始が古くても含めない。
 */
export const isEndUnknown = (kind: EndedEstimate['kind'] | 'has_end', startDay: string, today: string) =>
  kind === 'before_start' && isStaleStart(startDay, today)

// ---------------------------------------------------------------------------------------------
// タイトル（命名）
// ---------------------------------------------------------------------------------------------

export type SeedCategory = z.infer<typeof GapCategorySchema>

/** タイトルの長さの目安。超えても切らず、レポートに載せて目視で確かめる */
export const TITLE_LIMIT = 40

/**
 * 配布物が分からなくなったとき（キャラ名・店舗名だけの item）の既定名。other だけは D1 に前例が無い。
 * acsta は D1 の正解データ（gold.json、442 件）の数で選んだ。タイトルがそれそのものの件数は アクリルスタンド 7 / アクスタ 0、
 * その語を含むタイトルは アクリルスタンド 12 / アクスタ 7 で、どちらでも アクリルスタンド が多い。
 */
export const DEFAULT_TITLES: Record<SeedCategory, string> = {
  limited_card: '限定名刺',
  regular_card: '通常名刺',
  ackey: 'アクキー',
  acsta: 'アクリルスタンド',
  other: 'グッズ'
}

// ---------------------------------------------------------------------------------------------
// カテゴリ（アクスタ）
// ---------------------------------------------------------------------------------------------

/** アクスタ（アクリルスタンド）の題。NFKC で正規化した後の題に当てる */
const ACSTA_WORDS = /アクスタ|アクリルスタンド/
/** アクキー（アクリルキーホルダー）の題。アクスタと一緒の題（「アクスタ+アクキーセット」）はアクスタにしない */
const ACKEY_WORDS = /アクキー|キーホルダー/

/**
 * 題で決める acsta の判定。LLM の抽出と Clef の質問にはアクスタの選択肢が無い（変えると判定のキャッシュが使えなくなる）ので、
 * アクスタは other のうち題がアクスタのものを、後から acsta に付け替える。
 *  convert=other で題がアクスタ（アクキーを含まない）→ acsta にする /
 *  keep_ackey=題がアクスタだがアクキーも含む（other のまま）/ keep_category=題がアクスタだが ackey・limited_card・regular_card（そのまま）/
 *  none=題がアクスタではない、または既に acsta
 */
export type AcstaVerdict = 'convert' | 'keep_ackey' | 'keep_category' | 'none'

export const judgeAcsta = (title: string, category: string): AcstaVerdict => {
  const text = title.normalize('NFKC')
  if (!ACSTA_WORDS.test(text) || category === 'acsta') return 'none'
  if (category !== 'other') return 'keep_category'
  return ACKEY_WORDS.test(text) ? 'keep_ackey' : 'convert'
}

/** イベントのカテゴリ。題がアクスタの other は acsta にする（judgeAcsta） */
export const categoryOf = (title: string, category: SeedCategory): SeedCategory =>
  judgeAcsta(title, category) === 'convert' ? 'acsta' : category

/**
 * D1 の同名のタイトルとの種別の照合で、acsta と other は同じとみなす。本番の D1 はまだ other のままなので、
 * LLM の category（other）と D1 の category（other）が一致すれば同じ企画として扱う。
 */
const sameKind = (category: string) => (category === 'acsta' ? 'other' : category)

/** 命名に渡すカテゴリ。命名の指示には acsta が無い（アクスタは other の基準に入っている）ので other で渡す */
const promptCategory = (category: SeedCategory): TitleCategory => (category === 'acsta' ? 'other' : category)

/** 配布物が分からなくなったときの既定名のうち、D1 に前例が無い汎用名（other の既定名だけ） */
export const GENERIC_TITLES: readonly string[] = [DEFAULT_TITLES.other]

/**
 * 表記の揺れの寄せ先。d1From / d1To は D1 の正解データ（gold.json、442 件）でタイトルがその形そのものだった件数。
 * source が d1 の行は、d1To が d1From より多く（多数派に寄せる）、2 件以上ある形だけを入れる。
 * 入れなかった季節: クリスマス（限定名刺 2 / 名刺 0）、秋・冬・お正月（どちらも 0）は多数派が無い。
 * 春（0 / 1）・ホワイトデー（0 / 1）・正月（0 / 2。「お正月限定名刺」まで「お正月名刺」に変えてしまう）は根拠が薄い。
 * source が instruction の行は依頼で指定された寄せ方。D1 には「名刺」そのもののタイトルが無い（新名刺 1 / 名刺 0）。
 */
export const TITLE_REWRITES: readonly {
  from: string
  to: string
  source: 'd1' | 'instruction'
  d1From: number
  d1To: number
}[] = [
  { from: 'バレンタイン限定名刺', to: 'バレンタイン名刺', source: 'd1', d1From: 5, d1To: 11 },
  { from: '夏限定名刺', to: '夏名刺', source: 'd1', d1From: 2, d1To: 6 },
  { from: 'ハロウィン限定名刺', to: 'ハロウィン名刺', source: 'd1', d1From: 1, d1To: 3 },
  { from: '新年限定名刺', to: '新年名刺', source: 'd1', d1From: 1, d1To: 4 },
  { from: '新しい名刺', to: '名刺', source: 'instruction', d1From: 0, d1To: 0 },
  { from: '新名刺', to: '名刺', source: 'instruction', d1From: 1, d1To: 0 }
]

/** 開始月（1〜12）→ 季節。12〜2 月は冬 */
const SEASONS = ['冬', '冬', '春', '春', '春', '夏', '夏', '夏', '秋', '秋', '秋', '冬'] as const

/** item にこれらがあれば、開始月から季節を補わない（行事の名前のほうが具体的） */
const EVENT_WORDS = /ハロウィン|クリスマス|バレンタイン|お正月|正月|新年/

/**
 * 通常名刺（常設の名刺）を指すだけの item。「ビッカメ娘11周年記念名刺」のように記念名や季節が付くものは、
 * LLM が regular_card と分類していても名前を残す（通常名刺にすると配布物の区別が消える）。
 */
const PLAIN_CARD = /^(?:新しい|新)?(?:通常|通年)?名刺\s?(?:新デザイン|リニューアル)?$/

/** 取り除いた語の前後に残る接続の語・記号（「柏たんの〜」「A＆B」の「の」「&」「と」など） */
const CONNECTORS = 'のと&・、,'
const MARK = '\u0000'
const LEFTOVER = new RegExp(`^[${CONNECTORS}\\s]*$`)
/** 取り除いた語が「A と B」「A・B」のように並んでいたら 1 つにまとめる */
const MARK_RUN = new RegExp(`${MARK}(?:[${CONNECTORS}\\s]*${MARK})+`, 'g')
/** 取り除いた語の直前の「with」（「美味しいもの食べ隊withパソ館たん」の with） */
const WITH_BEFORE_MARK = new RegExp(`with\\s*(?=${MARK})`, 'giu')
/** 取り除いた語の直後の「の」「との」「&」など。「と」は、後ろが平仮名のとき（「とっておき」）は語の一部なので残す */
const MARK_TAIL = new RegExp(`${MARK}(?:\\s*(?:との|[の&・、,])\\s*|\\s*と(?![\\p{Script=Hiragana}])\\s*)?`, 'gu')
/** 取り除いた語が末尾にあるとき、その直前の「の」「と」「&」など（「ドレス姿の柏たん」の「の」） */
const CONNECTORS_BEFORE_END_MARK = new RegExp(`[${CONNECTORS}\\s]+${MARK}$`)

/**
 * characters.json に無い「〜たん」。語の頭（先頭か、空白・括弧・「の」「と」「&」の直後）から始まる、
 * 漢字・カタカナ・英字のどれか 1 種類だけの短い並びに限る。
 * 前の語（「記念名刺新西たん」の「記念名刺」）を巻き込まないよう、語の途中から始まるものは対象にしない。
 */
const GENERIC_NAME =
  /(?<=^|[\s()「『&・、,のと])(?:[\p{Script=Han}々]{1,4}|[\p{Script=Katakana}ー]{1,10}|[A-Za-z]{1,10})たん/gu

/** キャラクター名・店舗名の一覧。ビックカメラ（会社名）は「ビックカメラギフトカード」など D1 のタイトルにあるので除く */
const GENERIC_TERMS = new Set(['ビックカメラ'])

/** 比較の差を順に見て、最初に 0 でないものを返す（並べ替えの第 1 キー、第 2 キー…） */
const chain = (...diffs: number[]) => diffs.reduce((first, diff) => (first !== 0 ? first : diff), 0)

/** undefined を null にする（D1 の NULL。`??` を使わずに書く） */
const orNull = <T>(value: T | undefined) => (value === undefined ? null : value)

/** Map.groupBy（ES2024）の代わり。キーの出現順を保つ */
const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string) => {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * characters.json の店舗キー → [キャラクター名, 店舗の短い名前?]（readStoreNames）から、タイトルから取り除く語を作る。
 * キャラクター名（「柏たん」「Airたん」…）と店舗の短い名前（「柏店」「千葉駅前店」…）。
 */
export const seedNameTerms = (storeNames: ReadonlyMap<string, readonly string[]>) => {
  const terms = [...storeNames.values()].flat().map((name) => name.normalize('NFKC').trim())
  return [...new Set(terms)].filter((name) => name.length >= 2 && !GENERIC_TERMS.has(name))
}

/**
 * 語の一覧から、取り除く正規表現を作る。長い語を先に試す。「ビックカメラ」＋店舗名は店舗名ごと取り除く。
 * 「Airたん」のような英字＋たんは、英字の部分（Air）だけでも取り除く（前後が英字のときは別の語なので除く）。
 */
const nameRegExp = (terms: readonly string[]) => {
  const names = [...new Set(terms.map((term) => term.normalize('NFKC').trim()))]
    .filter((name) => name.length >= 2)
    .sort((a, b) => b.length - a.length)
  const latin = names.flatMap((name) => {
    const match = /^([A-Za-z]+)たん$/.exec(name)
    return match ? [`(?<![A-Za-z])${match[1]}(?![A-Za-z])`] : []
  })
  const alternatives = [...names.map(escapeRegExp), ...latin]
  // 空の一覧は何にも一致しない正規表現にする（空の選択肢は全位置に一致してしまう）
  return new RegExp(alternatives.length === 0 ? '(?!)' : `(?:ビックカメラ\\s*)?(?:${alternatives.join('|')})`, 'g')
}

export type TitleExplanation = {
  title: string
  /** characters.json に無いまま一般則（〜たん）で取り除いた語。目視で確かめるために残す */
  generic: string[]
}

/**
 * LLM の item を、D1 のタイトルの規範（配布物の種類＋季節・記念名。キャラ名・店舗名は入れない）に直す。
 *  1. NFKC 正規化して前後の空白を除く
 *  2. キャラ名・店舗名を取り除く（「ビッカメ娘」は D1 のタイトルに頻出するので残す）。残った「の」「&」「と」は落とす
 *  3. 表記の揺れを TITLE_REWRITES で寄せる（元の表記は尊重し、D1 に実在する形にだけ寄せる）
 *  4. regular_card の名刺は「通常名刺」、item が単に「名刺」の limited_card は開始月から季節を補う
 * 取り除いた結果が空になるときはカテゴリ別の既定名にする。
 */
export const explainTitle = (
  item: string,
  category: SeedCategory,
  startDate: string,
  names: readonly string[]
): TitleExplanation => {
  const text = item.normalize('NFKC').trim()
  const listed = text.replace(nameRegExp(names), MARK)
  const generic: string[] = []
  const marked = listed.replace(GENERIC_NAME, (hit) => {
    generic.push(hit)
    return MARK
  })
  const stripped = marked.includes(MARK)
    ? marked
        .replace(MARK_RUN, MARK)
        .replace(WITH_BEFORE_MARK, '')
        .replace(CONNECTORS_BEFORE_END_MARK, MARK)
        .replace(MARK_TAIL, '')
        .replace(/\(\s*\)|「\s*」|『\s*』/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : marked.replace(/\s+/g, ' ').trim()
  if (LEFTOVER.test(stripped)) return { title: DEFAULT_TITLES[category], generic }
  const rewritten = TITLE_REWRITES.reduce((current, rule) => current.replaceAll(rule.from, rule.to), stripped)
  if (category === 'regular_card' && PLAIN_CARD.test(rewritten)) return { title: DEFAULT_TITLES.regular_card, generic }
  if (category === 'limited_card' && rewritten === '名刺' && !EVENT_WORDS.test(text)) {
    const season = SEASONS[Number(startDate.slice(5, 7)) - 1]
    return { title: season === undefined ? rewritten : `${season}名刺`, generic }
  }
  return { title: rewritten, generic }
}

/** explainTitle の題だけ。startDate は YYYY-MM-DD（JST） */
export const eventTitle = (
  item: string,
  category: SeedCategory,
  startDate: string,
  characterNames: readonly string[]
) => explainTitle(item, category, startDate, characterNames).title

// ---------------------------------------------------------------------------------------------
// タイトル（LLM の題の検査と採用）
// ---------------------------------------------------------------------------------------------

/**
 * 配布数（quantity）として使う最小値。これ未満は limited_quantity にも先着の条件にも使わず、配布条件は everyone にする。
 * 根拠: D1（gold.json）の first_come の最小は 30、limited_quantity が 1 のイベントは 1 件だけ。
 * LLM の quantity=1 は「おひとり様1枚」を総数と読み違えたものが多い（2023 年以降の 239 件中 61 件が 1）。
 */
export const MIN_LIMITED_QUANTITY = 10

/**
 * 配布数（quantity）として使う最大値。これを超えるものは limited_quantity にも先着の条件にも使わず、配布条件は everyone にする。
 * 根拠: 人が確認した D1（gold.json）の limited_quantity の最大は 200。名刺以外の配布物（うちわ・チョコレート）や店舗全体の総数を
 * 読み違えることがあり、自動作成分には 3000〜7000 のような値がある。
 */
export const MAX_LIMITED_QUANTITY = 1000

/** 配布数を使えるか。MIN_LIMITED_QUANTITY 以上 MAX_LIMITED_QUANTITY 以下（両端を含む） */
export const usableQuantity = (quantity: number) => quantity >= MIN_LIMITED_QUANTITY && quantity <= MAX_LIMITED_QUANTITY

/** `--titles` の値。llm は Claude Haiku で D1 流に命名し、rule はルールベースの題だけ（explainTitle） */
export type TitleMode = 'llm' | 'rule'

/** 題の出どころ。llm=Haiku の題を採用 / rule=--titles rule / fallback=llm のはずが検査落ち・呼び出し失敗でルールの題 */
export type TitleSource = 'llm' | 'rule' | 'fallback'

/**
 * ルールの題に戻した理由。category は、題が D1 の既存タイトルとちょうど一致するのに、D1 でその題を持つイベントの category に
 * 今回のイベントの category が 1 つも無い（D1 の同名の企画とは配布物の種別が違う）こと。
 */
export type TitleRejectReason = 'empty' | 'too_long' | 'bracket' | 'name' | 'category' | 'call_failed'

export type TitleReject = {
  reason: TitleRejectReason
  /** 見つけた括弧・語、長さ（理由の補足） */
  detail: string
}

/** 括弧類。補足を付けない規則（D1 の 442 件でも括弧付きは 2 件だけ） */
const BRACKETS = /[()（）【】「」『』[\]［］]/

/** 題の前後の空白を除き、NFKC で揃える（ルールベースの題と同じ正規化。全角の数字・括弧は半角になる） */
export const normalizeTitle = (title: string) => title.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** 日本語の 1 文字（かな・カタカナ・漢字。「ー」「、」のような記号も含む） */
const JAPANESE_CHAR = '[\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Han}]'
const JAPANESE_GAP = new RegExp(`(?<=${JAPANESE_CHAR}) +(?=${JAPANESE_CHAR})`, 'gu')

/**
 * 日本語どうしの間の半角空白を詰める（D1 のタイトルの表記。「ビッ旅 名刺」→「ビッ旅名刺」）。
 * 英数字に接する空白は残す。ルールの題に戻すときだけ使い、Haiku の題には触れない。
 */
export const squeezeJapaneseSpaces = (title: string) => title.replace(JAPANESE_GAP, '')

/** D1 のタイトルとの突き合わせに使う鍵。NFKC・空白除去の後の文字列（「ビッ旅 名刺」と「ビッ旅名刺」は同じ題） */
export const d1TitleKey = (title: string) => title.normalize('NFKC').replace(/\s+/g, '')

/** D1 のタイトル（d1TitleKey）→ そのタイトルを持つ D1 イベントの category 一覧 */
export const d1CategoriesByTitle = (events: readonly { title: string; category: string }[]) =>
  new Map(
    [...groupBy(events, (event) => d1TitleKey(event.title))].map(
      ([key, group]) => [key, [...new Set(group.map((event) => event.category))]] as const
    )
  )

/**
 * 命名の出力の検査: 空でない / TITLE_MAX_LENGTH 文字以内 / 括弧類を含まない / キャラ名・店舗名を含まない。
 * terms はその店舗のキャラ名・店舗名と seedNameTerms（全店舗の名前）。characters.json に無い「〜たん」も名前と見なす。
 * title は normalizeTitle 済みのものを渡す。
 */
export const checkTitle = (
  title: string,
  terms: readonly string[]
): { ok: true } | ({ ok: false } & TitleReject) => {
  if (title === '') return { ok: false, reason: 'empty', detail: '' }
  const length = [...title].length
  if (length > TITLE_MAX_LENGTH) return { ok: false, reason: 'too_long', detail: String(length) }
  const bracket = BRACKETS.exec(title)
  if (bracket) return { ok: false, reason: 'bracket', detail: bracket[0] }
  const named = terms.find((term) => title.includes(term))
  const generic = title.match(GENERIC_NAME)
  if (named !== undefined) return { ok: false, reason: 'name', detail: named }
  if (generic) return { ok: false, reason: 'name', detail: generic[0] }
  return { ok: true }
}

/** 命名の規則 3 の説明語。D1 の古い登録（「1月限定名刺配布開始」など）が手本に混ざると、規則と手本が食い違う */
const DESCRIPTIVE_WORDS = /配布|プレゼント|開始|先行|追加|イベント|デザイン|ver/i

/**
 * 命名の手本に載せてよい D1 のタイトルか。出力の検査（checkTitle）に通り、かつ規則 3 の説明語を含まないもの。
 * 説明語は出力の検査には使わない（検査は空・長さ・括弧・名前だけ）。手本の食い違いを避けるためだけの絞り込み。
 */
export const isExampleTitle = (title: string, terms: readonly string[]) => {
  const normalized = normalizeTitle(title)
  return checkTitle(normalized, terms).ok && !DESCRIPTIVE_WORDS.test(normalized)
}

/**
 * ルールの題に戻した後の題が、D1 に書ける題かの検査（品質ゲート）に落ちた理由。
 * checkTitle の理由（empty / too_long / bracket / name）に、descriptive=配布物の名前でなく説明が残っている、
 * generic=D1 に前例が無い汎用名（other の既定名）を足したもの。
 */
export type TitleGateReject = {
  reason: TitleRejectReason | 'descriptive' | 'generic'
  detail: string
}

/**
 * ルールの題に戻した後の題の品質ゲート。通れば null。
 * checkTitle（空・長さ・括弧類・キャラ名・店舗名）に通り、規則 3 の説明語（DESCRIPTIVE_WORDS）を含まず、
 * D1 に前例が無い汎用名 GENERIC_TITLES と一致しないこと。
 * 限定名刺・通常名刺・アクキーの既定名は D1 に実在するタイトルなので、汎用名には数えない。
 */
export const gateTitle = (title: string, terms: readonly string[]): TitleGateReject | null => {
  const check = checkTitle(title, terms)
  if (!check.ok) return { reason: check.reason, detail: check.detail }
  const descriptive = DESCRIPTIVE_WORDS.exec(title)
  if (descriptive) return { reason: 'descriptive', detail: descriptive[0] }
  return GENERIC_TITLES.includes(title) ? { reason: 'generic', detail: title } : null
}

/** 採用した題と、その経緯 */
export type TitleAdoption = {
  title: string
  ruleTitle: string
  /** Haiku が返した題（正規化後）。呼んでいない・失敗したときは null */
  llmTitle: string | null
  source: TitleSource
  /** fallback の理由 */
  reject: TitleReject | null
  /**
   * ルールの題に戻した題（fallback）が品質ゲートに落ちた理由。落ちたイベントは作らない。
   * llm（検査済み）と rule（--titles rule は命名しない下書きの題で、ゲートをかけない）は null
   */
  gate: TitleGateReject | null
}

export const describeReject = (reject: TitleReject | TitleGateReject) =>
  reject.detail === '' ? reject.reason : `${reject.reason}(${reject.detail})`

// ---------------------------------------------------------------------------------------------
// 入力（emulate の結果）
// ---------------------------------------------------------------------------------------------

/** emulate の結果（EmulatedEvent）のうち、イベントを作るのに使う項目だけ。ほかの項目は読まない */
const SeedEventSchema = z.object({
  id: z.string().nonempty(),
  store: z.string().nonempty(),
  item: z.string().nonempty(),
  category: GapCategorySchema,
  startDate: z.string().nonempty().optional(),
  endDate: z.string().nonempty().optional(),
  endedAt: z.string().nonempty().optional(),
  quantity: z.number().int().positive().optional(),
  firstSeen: z.number(),
  /** 最後の言及の時刻（エポックミリ秒）。終了の情報が無いイベントの終了日の推定に使う */
  lastSeen: z.number(),
  /** 言及。古い順で、posts[0] が Clef の判定の対象（代表投稿） */
  posts: z.array(z.object({ postId: z.string().nonempty(), status: GapStatusSchema })).nonempty()
})

export type SeedEvent = z.infer<typeof SeedEventSchema>

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** emulate が書いた emulated-v1.json から、イベントを作るのに要る項目を読む。無い・形が合わないときは emulate のやり直しを促す */
export const readSeedEvents = async (dir: string): Promise<SeedEvent[]> => {
  const path = resolve(dir, EMULATED_FILE)
  if (!existsSync(path)) throw new Error(`${path}: not found (run emulate)`)
  const parsed = z.array(SeedEventSchema).safeParse(parseJson(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message} (re-run emulate)`)
  return parsed.data
}

const PostRecordSchema = z.object({
  id: z.string().nonempty(),
  screenName: z.string().nonempty(),
  // 投稿の種類。告知・開始の参考 URL はリプライ以外から選ぶ
  kind: DetectPostKindSchema,
  // 本文が無い（または文字列でない）レコードでも、アカウント名は使う
  text: z.string().optional()
})

export type PostRecord = z.infer<typeof PostRecordSchema>

/**
 * posts.jsonl（約 100 万件）から、指定した投稿 ID のアカウント名（screen_name）・投稿の種類（kind）・本文だけを集める。
 * 全件を保持せず 1 行ずつ読み、全部見つかった時点で止める。見つからなかった ID は返さない。
 */
export const readPostRecords = async (path: string, ids: ReadonlySet<string>) => {
  const found = new Map<string, PostRecord>()
  if (ids.size === 0) return found
  for await (const line of readJsonLines(path)) {
    const record = parseJson(line)
    if (typeof record !== 'object' || record === null || !('id' in record)) continue
    if (typeof record.id !== 'string' || !ids.has(record.id)) continue
    const parsed = PostRecordSchema.safeParse(record)
    if (parsed.success) found.set(parsed.data.id, parsed.data)
    if (found.size === ids.size) break
  }
  return found
}

/**
 * readPostRecords の結果を、同じ ID の集合（同じ Set）に対して 1 回だけ作る。アカウント名・種類・本文を別々に引いても、
 * 700MB の posts.jsonl を走査するのは 1 回で済む。
 */
export const sharedPostScan = (path: string) => {
  const scans = new WeakMap<ReadonlySet<string>, Promise<Map<string, PostRecord>>>()
  return (ids: ReadonlySet<string>) => {
    const known = scans.get(ids)
    if (known) return known
    const scan = readPostRecords(path, ids)
    scans.set(ids, scan)
    return scan
  }
}

// ---------------------------------------------------------------------------------------------
// ローカル D1
// ---------------------------------------------------------------------------------------------

const LOCAL_STATE = /(?:^|[\\/])\.wrangler[\\/]state[\\/]/

/** 書き込み先に許す SQLite のパスか。.wrangler/state 配下の .sqlite だけ（本番・staging の誤指定を防ぐ） */
export const assertLocalDbPath = (path: string) => {
  const resolved = resolve(path)
  if (!LOCAL_STATE.test(resolved) || !resolved.endsWith('.sqlite'))
    throw new Error(`--db must be a .sqlite file under .wrangler/state/ (local D1 only): ${path}`)
  return resolved
}

/**
 * ローカル D1 を開く。ファイルが無ければ作らずに止まる（打ち間違いで .wrangler/state に空の DB を作らない）。
 * 読むだけなら readonly。書くときも journal_mode は触らず（dev サーバーが WAL で使っている）、busy_timeout で待つ。
 */
export const openLocalDb = (path: string, writable: boolean) => {
  const resolved = assertLocalDbPath(path)
  if (!existsSync(resolved)) throw new Error(`${resolved}: not found (run bun run migrate)`)
  // シンボリックリンクで .wrangler/state の外を指していても通さない
  assertLocalDbPath(realpathSync(resolved))
  const db = writable
    ? new Database(resolved, { readwrite: true, create: false })
    : new Database(resolved, { readonly: true })
  db.exec('PRAGMA busy_timeout = 10000')
  return db
}

export const TABLES = ['events', 'event_stores', 'event_reference_urls', 'event_conditions'] as const

/** seed が書く列。INSERT 文もこの一覧から作るので、列の確認と実際の書き込みはずれない */
export const WRITTEN_COLUMNS: Record<(typeof TABLES)[number], readonly string[]> = {
  events: [
    'id',
    'category',
    'title',
    'limited_quantity',
    'start_date',
    'end_date',
    'ended_at',
    'is_verified',
    'is_preliminary',
    'group_id',
    'character_id',
    'created_at',
    'updated_at'
  ],
  event_stores: ['id', 'event_id', 'store_key', 'created_at', 'updated_at'],
  event_reference_urls: ['id', 'event_id', 'type', 'url', 'created_at', 'updated_at'],
  event_conditions: ['id', 'event_id', 'type', 'purchase_amount', 'quantity', 'created_at', 'updated_at']
}

export type RowCounts = Record<(typeof TABLES)[number], number>

export const countRows = (db: Database): RowCounts => {
  const count = (table: (typeof TABLES)[number]) => {
    const row = db.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()
    if (row === null) throw new Error(`${table}: count failed`)
    return row.n
  }
  return {
    events: count('events'),
    event_stores: count('event_stores'),
    event_reference_urls: count('event_reference_urls'),
    event_conditions: count('event_conditions')
  }
}

export type ColumnCheck = {
  table: string
  /** テーブルの列数。0 ならテーブルが無い */
  columns: number
  written: readonly string[]
  /** 書こうとしているが、テーブルに無い列 */
  absent: readonly string[]
  /** NOT NULL で既定値が無いのに、書かない列（INSERT が失敗する） */
  uncovered: readonly string[]
}

/** PRAGMA table_info で、実際の列と書き込む列が合っているかを確かめる */
export const checkColumns = (db: Database): ColumnCheck[] =>
  TABLES.map((table) => {
    const info = db
      .query<{ name: string; notnull: number; dflt_value: string | null }, []>(`PRAGMA table_info(${table})`)
      .all()
    const written = WRITTEN_COLUMNS[table]
    const names = new Set(info.map((column) => column.name))
    return {
      table,
      columns: info.length,
      written,
      absent: written.filter((name) => !names.has(name)),
      uncovered: info
        .filter((column) => column.notnull === 1 && column.dflt_value === null && !written.includes(column.name))
        .map((column) => column.name)
    }
  })

/** テーブルが無い・書く列が無い・必須の列を書かない、のいずれかなら止まる */
export const assertColumns = (checks: readonly ColumnCheck[]) => {
  const problems = checks.flatMap((check) => [
    ...(check.columns === 0 ? [`${check.table}: table not found (run bun run migrate)`] : []),
    ...check.absent.map((name) => `${check.table}.${name}: column not found`),
    ...check.uncovered.map((name) => `${check.table}.${name}: NOT NULL without default but not written`)
  ])
  if (problems.length > 0) throw new Error(`local D1 schema mismatch:\n  ${problems.join('\n  ')}`)
}

/**
 * characters.json にはあるが、アプリの StoreKeySchema（workers/app/src/schemas/store.dto.ts）に無い店舗キー。
 * アプリはイベントの stores を StoreKeySchema で読むので、このキーのイベントを作ると一覧の読み込みが壊れる恐れがある。
 * 一覧が実際の差と合っているかは、テストが store.dto.ts のソースと characters.json を突き合わせて確かめる。
 */
export const APP_UNSUPPORTED_STORES: readonly string[] = ['air']

/** 店舗キーと JST の開始日の組。D1 に同じイベントがあるかの照合に使う */
const storeDayKey = (store: string, day: string) => `${store}|${day}`

const LocalRowSchema = z.object({ store_key: z.string().nonempty(), start_date: z.string().nonempty() })

export type LocalState = {
  /** 店舗キー|JST の開始日 */
  storeDays: ReadonlySet<string>
  /** 開始日を読めず、照合に使えなかった行 */
  invalid: number
}

/** ローカル D1 にある行。同じ店舗・同じ開始日のイベントを集める（参考 URL の投稿 ID は照合に使わない。下の selectSeedEvents を参照） */
export const readLocalState = (db: Database): LocalState => {
  const rows = db
    .query<unknown, []>(
      'SELECT es.store_key AS store_key, e.start_date AS start_date FROM event_stores es JOIN events e ON e.id = es.event_id'
    )
    .all()
  const keys = rows.flatMap((row) => {
    const parsed = LocalRowSchema.safeParse(row)
    const day = parsed.success ? jstDayOf(parsed.data.start_date) : undefined
    return parsed.success && day !== undefined ? [storeDayKey(parsed.data.store_key, day)] : []
  })
  return { storeDays: new Set(keys), invalid: rows.length - keys.length }
}

// ---------------------------------------------------------------------------------------------
// 絞り込み
// ---------------------------------------------------------------------------------------------

const REFERENCE_TYPES = ['announce', 'start', 'end'] as const

export type ReferenceType = (typeof REFERENCE_TYPES)[number]

/** 参考 URL。kind は選んだ投稿の種類（レポートに残す） */
export type SeedReference = { type: ReferenceType; url: string; kind: DetectPostKind }

/** 作るイベント 1 件。日付は *Day が JST の暦日、それ以外が D1 に書く UTC の ISO */
export type SeedPlan = {
  emulatedId: string
  store: string
  item: string
  /** 採用したタイトル（D1 に書く題） */
  title: string
  /** ルールベースの題（explainTitle）。--titles rule ではこれが title */
  ruleTitle: string
  /** Haiku が返した題（正規化後）。--titles rule・呼び出し失敗のときは null */
  llmTitle: string | null
  titleSource: TitleSource
  /** fallback になった理由（reason または reason(detail)）。fallback 以外は null */
  titleReject: string | null
  category: SeedCategory
  startDay: string
  endDay: string | null
  endedDay: string | null
  startDate: string
  endDate: string | null
  endedAt: string | null
  limitedQuantity: number | null
  isPreliminary: boolean
  references: SeedReference[]
  /** 終了日（endedAt）を、終了の情報が無いイベントの最後の言及から推定して入れた（estimateEnded）。レポートで見分ける */
  endedAtEstimated: boolean
  /** 代表投稿の is_event の確率（Clef） */
  clef: number
  /** そのイベントの言及数 */
  mentions: number
}

export type SeedStage = { label: string; excluded: number; remaining: number }

type Candidate = { event: SeedEvent; clef: number; startDay: string; start: string }

/** 参考 URL を組み立てるのに要る投稿の項目（posts.jsonl の screenName と kind） */
export type PostInfo = { screenName: string; kind: DetectPostKind }

/** 種別ごとに、そのイベントの言及のうち最初の投稿。ongoing は使わない */
export const firstMentions = (event: SeedEvent) =>
  REFERENCE_TYPES.flatMap((type) => {
    const post = event.posts.find((mention) => mention.status === type)
    return post ? [{ type, postId: post.postId }] : []
  })

const ANNOUNCE_START = ['announce', 'start'] as const

export type AnnounceStartType = (typeof ANNOUNCE_START)[number]

/**
 * 告知・開始の参考 URL にしない投稿の種類。リプライで開始や告知をすることはほぼ無く、リプライは告知への補足・返信であることが多い。
 * リツイートは分析の段階で除かれているので来ないはずだが、来ても使わない。終了だけはリプライも使う
 * （「配布終了しました」は告知へのリプライで出されることが多い）。
 */
export const isReplyKind = (kind: DetectPostKind) => kind === 'reply' || kind === 'retweet'

/**
 * 最初の告知・開始の言及がリプライ（リツイート）になっている種別。そのイベントは作らない（リプライを飛ばして次の投稿を選ぶことはしない）。
 * posts.jsonl に無い投稿は kind が分からないので数えない（その種別は参考 URL が作れないだけ）。
 */
export const replyMentions = (event: SeedEvent, posts: ReadonlyMap<string, PostInfo>): AnnounceStartType[] =>
  firstMentions(event).flatMap(({ type, postId }) => {
    const info = posts.get(postId)
    return (type === 'announce' || type === 'start') && info !== undefined && isReplyKind(info.kind) ? [type] : []
  })

/** 最初の言及から参考 URL を作る。posts.jsonl に無い投稿の種別は作れず missing に数える */
const buildReferences = (event: SeedEvent, posts: ReadonlyMap<string, PostInfo>) => {
  const picks = firstMentions(event).map(({ type, postId }) => ({ type, postId, info: posts.get(postId) }))
  return {
    references: picks.flatMap(({ type, postId, info }): SeedReference[] =>
      info === undefined ? [] : [{ type, url: `https://x.com/${info.screenName}/status/${postId}`, kind: info.kind }]
    ),
    missing: picks.filter(({ info }) => info === undefined).length
  }
}

/** 投稿 ID → 項目。アカウント名と種類の両方が引けた投稿だけ */
const joinPostInfo = (screenNames: ReadonlyMap<string, string>, kinds: ReadonlyMap<string, DetectPostKind>) =>
  new Map(
    [...screenNames].flatMap(([id, screenName]) => {
      const kind = kinds.get(id)
      return kind === undefined ? [] : [[id, { screenName, kind }] as const]
    })
  )

export type SeedSelectOptions = {
  events: readonly SeedEvent[]
  /** 投稿 ID → Clef の is_event の確率 */
  clef: ReadonlyMap<string, number>
  threshold: number
  /** startDate（JST の暦日）がこの日以降 */
  since?: string
  /** startDate（JST の暦日）がこの日より前 */
  before?: string
  /** D1 の正解データ（gold.json）。本番の D1 と同じ内容 */
  gold: readonly { stores: readonly string[]; startDate: string; referenceUrls: readonly { url: string }[] }[]
  /**
   * D1 の正解データ（gold）のタイトルと category。命名の題が D1 の既存タイトルとちょうど一致したとき、
   * その category に今回のイベントの category があるかを確かめる。省略するとこの検査はしない。
   */
  d1Titles?: readonly { title: string; category: string }[]
  /** ローカル D1 の既存行。--force のときは渡さず、ローカル D1 との照合を省く */
  local?: LocalState
  /** characters.json の店舗キー */
  storeKeys: ReadonlySet<string>
  /** storeKeys にあっても作らない店舗キー（ビッカメ娘ではない店舗。readStoreMarks）。省略するとこの絞り込みはしない */
  nonBiccameStores?: ReadonlySet<string>
  /** storeKeys にあっても作らない店舗キー（アプリが読めないもの。APP_UNSUPPORTED_STORES） */
  unsupportedStores?: ReadonlySet<string>
  /** タイトルから取り除くキャラ名・店舗名（seedNameTerms） */
  names: readonly string[]
  /** 店舗キー → [キャラ名, 店舗の短い名前?]（readStoreNames）。命名の「入れてはいけない語」と検査に使う */
  storeNames?: ReadonlyMap<string, readonly string[]>
  lookupScreenNames: (ids: ReadonlySet<string>) => Promise<ReadonlyMap<string, string>>
  /** 投稿 ID → 投稿の種類（original / reply / quote / retweet）。lookupScreenNames と同じ ID の集合で呼ぶ。告知・開始はリプライ以外から選ぶ */
  lookupKinds: (ids: ReadonlySet<string>) => Promise<ReadonlyMap<string, DetectPostKind>>
  /** 省略は --titles rule（ルールベースの題だけ）。指定すると Haiku で命名して、検査に通った題を採用する */
  naming?: {
    /** 命名の指示（D1 の手本つき。titleSystem） */
    system: string
    /** 投稿 ID → 本文。lookupScreenNames と同じ ID の集合（同じ Set）で呼ぶ */
    lookupBodies: (ids: ReadonlySet<string>) => Promise<ReadonlyMap<string, string>>
    /** 命名を流す（保存済みは呼ばない）。1 件の失敗では止まらず、題が無いリクエストは結果に含めない */
    run: (targets: readonly TitleTarget[]) => Promise<TitleRun>
  }
  /** 開始日の新しい順に先頭 N 件だけ作る */
  limit?: number
  /** 実行時刻（ISO）。開始日が今日より後なら is_preliminary にする */
  now: string
}

export type SeedSelection = {
  plans: SeedPlan[]
  stages: SeedStage[]
  /**
   * 題を付けられず、作らないことにした LLM イベント（ルールの題に戻した後の題が品質ゲートに落ちたもの。gateTitle）。
   * --titles rule と、Haiku の題を採用したイベントは対象外
   */
  untitled: {
    emulatedId: string
    store: string
    startDay: string
    item: string
    ruleTitle: string
    /** Haiku が返した題。呼び出しに失敗したときは null */
    llmTitle: string | null
    /** ゲートに落ちた理由（reason または reason(detail)） */
    reason: string
  }[]
  /** 同じ店舗・開始日・題の LLM イベントを 1 件にまとめて除いた数と例 */
  duplicates: { dropped: number; examples: { store: string; startDay: string; title: string; kept: string }[] }
  longTitles: { title: string; item: string }[]
  /** endDate が startDate より前だったため null にしたイベント */
  endBeforeStart: { count: number; examples: { emulatedId: string; startDay: string; endDay: string }[] }
  /** 暦日として読めず null にした endDate・endedAt の数 */
  invalidDays: number
  /** 参考 URL の投稿が posts.jsonl に無く、その種別を作れなかった数 */
  missingPosts: number
  /** 最初の告知・開始の言及がリプライ（リツイート）のため作らなかったイベントの数（どちらがリプライだったか。both=両方） */
  replyFirst: { announce: number; start: number; both: number }
  /** 店舗がビッカメ娘ではない（characters.json の is_biccame_musume が false）ため作らなかったイベントの数（店舗別、多い順） */
  notBiccameMusume: { count: number; byStore: { store: string; count: number }[] }
  /** 一般則（〜たん）で取り除いた語 */
  generic: { item: string; removed: string[] }[]
  /** 配布数が MIN_LIMITED_QUANTITY 未満のため limited_quantity にも先着の条件にも使わなかった作成予定のイベント */
  discardedQuantities: QuantitySummary
  /** 配布数が MAX_LIMITED_QUANTITY を超えるため limited_quantity にも先着の条件にも使わなかった作成予定のイベント */
  oversizedQuantities: QuantitySummary
  /** 終了の情報が無く、最後の言及から STALE_ENDED_DAYS 日以上たっていて、終了日を推定で入れた作成予定のイベントの数 */
  estimatedEnded: number
  /** 終了が分からないまま止まっている（isEndUnknown）ため作らなかったイベントの数 */
  endUnknown: number
  /** --titles llm の命名の結果。rule のときは undefined */
  naming: NamingStats | undefined
}

/** 配布数を使わなかったイベントの集計（数・配布数別・例） */
export type QuantitySummary = {
  count: number
  byQuantity: { quantity: number; count: number }[]
  examples: { emulatedId: string; startDay: string; title: string; quantity: number }[]
}

const summarizeQuantities = (entries: QuantitySummary['examples']): QuantitySummary => ({
  count: entries.length,
  byQuantity: [...groupBy(entries, (entry) => String(entry.quantity))]
    .map(([quantity, group]) => ({ quantity: Number(quantity), count: group.length }))
    .sort((a, b) => a.quantity - b.quantity),
  examples: entries.slice(0, EXAMPLES)
})

/** 命名の集計。範囲は、選別を通って命名したイベント全体（重複の除去・--limit の前） */
export type NamingStats = {
  /** 同じ内容を 1 件にまとめた後のリクエスト数 */
  requests: number
  called: number
  cached: number
  failed: number
  stats: CallStats
  inputTokens: number
  outputTokens: number
  /** ルールの題に戻したイベントの数（理由別。call_failed は呼び出し失敗） */
  fallbacks: Record<TitleRejectReason, number>
  /** ルールの題に戻したイベント。title は採用する題（ルールの題の日本語どうしの空白を詰めたもの）。gate があれば作らない */
  rejects: {
    store: string
    startDay: string
    item: string
    llmTitle: string | null
    ruleTitle: string
    title: string
    reason: TitleRejectReason
    reject: string
    /** 戻した題が品質ゲートに落ちて、イベントを作らないことにした理由。通ったら null */
    gate: string | null
  }[]
}

const EXAMPLES = 5

/**
 * 終了予定日・終了日・最後の言及から、イベントの終了の情報を決める。
 * endDay=使える終了予定日（暦日として読め、開始日より前ではない）/ endedIso=使える終了日 /
 * estimate=終了予定日も終了日も使えないときだけ、最後の言及から推定した結果（それ以外は undefined）
 */
export const resolveEnd = (
  event: Pick<SeedEvent, 'endDate' | 'endedAt' | 'lastSeen'>,
  startDay: string,
  today: string
) => {
  const endIso = event.endDate === undefined ? undefined : jstDayToUtcIso(event.endDate)
  const endsBefore = event.endDate !== undefined && endIso !== undefined && event.endDate < startDay
  const endedIso = event.endedAt === undefined ? undefined : jstDayToUtcIso(event.endedAt)
  const endDay = event.endDate !== undefined && endIso !== undefined && !endsBefore ? event.endDate : null
  const estimate = endDay === null && endedIso === undefined ? estimateEnded(event.lastSeen, startDay, today) : undefined
  return { endIso, endsBefore, endedIso, endDay, estimate }
}

/**
 * LLM イベントを、ローカル D1 に作るイベントへ絞り込む。段階ごとの除外数を数える。
 *  Clef の判定あり → 確率がしきい値以上 → 開始日あり → 期間 → D1（本番）に対応なし → ローカル D1 に未登録 →
 *  最初の告知・開始の言及がリプライではない → 参考 URL が作れる → 店舗キーが characters.json にある → ビッカメ娘の店舗である → アプリの StoreKeySchema にある →
 *  終了が分からないまま止まっていない → 題を付けられる → 同じイベントの重複を除く → 件数の上限
 */
export const selectSeedEvents = async (options: SeedSelectOptions): Promise<SeedSelection> => {
  const today = jstDayOf(options.now)
  if (today === undefined) throw new Error(`now must be an ISO timestamp: ${options.now}`)
  const stages: SeedStage[] = []
  const record = (label: string, before: number, after: number) => {
    stages.push({ label, excluded: before - after, remaining: after })
  }

  record('emulate のイベント', options.events.length, options.events.length)
  const judged = options.events.filter((event) => options.clef.has(event.posts[0].postId))
  record('Clef の判定がある（代表投稿 = 最初の言及）', options.events.length, judged.length)
  const passed = judged.flatMap((event) => {
    const clef = options.clef.get(event.posts[0].postId)
    return clef !== undefined && clef >= options.threshold ? [{ event, clef }] : []
  })
  record(`Clef の確率が ${options.threshold} 以上`, judged.length, passed.length)

  const dated = passed.flatMap(({ event, clef }): Candidate[] => {
    const start = event.startDate === undefined ? undefined : jstDayToUtcIso(event.startDate)
    return event.startDate !== undefined && start !== undefined
      ? [{ event, clef, startDay: event.startDate, start }]
      : []
  })
  record('開始日がある（暦日として正しい）', passed.length, dated.length)

  const inRange = dated.filter(
    ({ startDay }) =>
      (options.since === undefined || startDay >= options.since) &&
      (options.before === undefined || startDay < options.before)
  )
  const rangeLabel = `${options.since === undefined ? '' : options.since}〜${options.before === undefined ? '' : options.before}`
  record(`期間（開始日 ${rangeLabel}）`, dated.length, inRange.length)

  // D1 の正解データ: 参考 URL の投稿 ID と、店舗ごとの JST の開始日
  const goldPostIds = new Set(
    options.gold.flatMap((event) =>
      event.referenceUrls.flatMap(({ url }) => {
        const status = parseStatusUrl(url)
        return status ? [status.id] : []
      })
    )
  )
  const goldStoreDays = new Set(
    options.gold.flatMap((event) => {
      const day = jstDayOf(event.startDate)
      return day === undefined ? [] : event.stores.map((store) => storeDayKey(store, day))
    })
  )
  const afterGoldPosts = inRange.filter(({ event }) => !event.posts.some((mention) => goldPostIds.has(mention.postId)))
  record('D1 の参考 URL と同じ投稿を言及していない', inRange.length, afterGoldPosts.length)
  const afterGoldDays = afterGoldPosts.filter(
    ({ event, startDay }) => !goldStoreDays.has(storeDayKey(event.store, startDay))
  )
  record('D1 に同じ店舗・同じ開始日のイベントが無い', afterGoldPosts.length, afterGoldDays.length)

  const { local } = options
  const afterLocalDays = local
    ? afterGoldDays.filter(({ event, startDay }) => !local.storeDays.has(storeDayKey(event.store, startDay)))
    : afterGoldDays
  record(
    local ? 'ローカル D1 に同じ店舗・同じ開始日のイベントが無い' : 'ローカル D1 との照合（--force のため省略）',
    afterGoldDays.length,
    afterLocalDays.length
  )
  // ローカル D1 の参考 URL の投稿 ID では照合しない: 1 つの投稿が複数店舗のイベントに使われるため、--limit で一部だけ作った後に
  // 残りの店舗のイベントまで「作成済み」と見なして落としてしまう。二重作成の防止は店舗・開始日の照合で足りる

  // 参考 URL: 種別ごとに最初の言及。投稿の screen_name と kind を posts.jsonl から引けなければ、その種別は作らない
  // 最初の告知・開始の言及がリプライ（リツイート）のイベントは作らない（リプライを飛ばして次の投稿を選ぶことはしない）
  // 命名するなら本文を引く投稿も同じ集合に入れる（アカウント名・種類・本文を 1 回の走査で引くため）
  const { naming } = options
  const wanted = new Set(
    afterLocalDays.flatMap(({ event }) => [
      ...firstMentions(event).map(({ postId }) => postId),
      ...(naming ? bodyCandidateIds(event.posts) : [])
    ])
  )
  const [screenNames, kinds, bodies] = await Promise.all([
    options.lookupScreenNames(wanted),
    options.lookupKinds(wanted),
    naming ? naming.lookupBodies(wanted) : Promise.resolve(new Map<string, string>())
  ])
  const postInfo = joinPostInfo(screenNames, kinds)
  const replyFirst = { announce: 0, start: 0, both: 0 }
  const afterReply = afterLocalDays.filter(({ event }) => {
    const types = replyMentions(event, postInfo)
    if (types.length === 0) return true
    if (types.length > 1) replyFirst.both += 1
    else if (types.includes('announce')) replyFirst.announce += 1
    else replyFirst.start += 1
    return false
  })
  record('最初の告知・開始の言及がリプライ（リツイート）ではない', afterLocalDays.length, afterReply.length)
  const missing = { posts: 0 }
  const withReferences = afterReply.flatMap((candidate) => {
    const built = buildReferences(candidate.event, postInfo)
    missing.posts += built.missing
    return built.references.length > 0 ? [{ ...candidate, references: built.references }] : []
  })
  record('参考 URL を 1 件以上作れる', afterReply.length, withReferences.length)

  const inCharacters = withReferences.filter(({ event }) => options.storeKeys.has(event.store))
  record('店舗キーが characters.json にある', withReferences.length, inCharacters.length)
  const { nonBiccameStores } = options
  const isNonBiccame = (store: string) => nonBiccameStores !== undefined && nonBiccameStores.has(store)
  const inBiccame = inCharacters.filter(({ event }) => !isNonBiccame(event.store))
  record('ビッカメ娘の店舗である（characters.json の is_biccame_musume）', inCharacters.length, inBiccame.length)
  const notBiccameMusume = {
    count: inCharacters.length - inBiccame.length,
    byStore: [...groupBy(inCharacters.filter(({ event }) => isNonBiccame(event.store)), ({ event }) => event.store)]
      .map(([store, group]) => ({ store, count: group.length }))
      .sort((a, b) => chain(b.count - a.count, a.store.localeCompare(b.store)))
  }
  const { unsupportedStores } = options
  const known = unsupportedStores
    ? inBiccame.filter(({ event }) => !unsupportedStores.has(event.store))
    : inBiccame
  record('店舗キーがアプリの StoreKeySchema にある（air を除く）', inBiccame.length, known.length)

  // 終了が分からないまま止まっているイベント（終了予定日も終了日も無く、最後の言及が開始日より前で、開始から STALE_ENDED_DAYS 日以上）は作らない。
  // 命名（Haiku）の前に除く: 作らないイベントのために命名の呼び出しを使わない。seed --fix も同じ条件で削除する（作り直されない）
  const live = known.filter(({ event, startDay }) => {
    const { estimate } = resolveEnd(event, startDay, today)
    return !isEndUnknown(estimate === undefined ? 'has_end' : estimate.kind, startDay, today)
  })
  record(`終了不明のまま止まっていない（開始が ${STALE_ENDED_DAYS} 日以上前を除く）`, known.length, live.length)

  // タイトルを付ける（ルールの題を作り、--titles llm なら Haiku の題を検査して採用する）。
  // 同じ店舗・開始日・題の LLM イベントは、採用した題で判定し、言及の多い方（同数なら先に作られた方）だけ残す
  const ruled = live.map((candidate, index) => ({
    ...candidate,
    index,
    explained: explainTitle(candidate.event.item, candidate.event.category, candidate.startDay, options.names)
  }))
  const { adoptions, stats: namingStats } = await adoptTitles(ruled, {
    ...(naming ? { naming } : {}),
    bodies,
    names: options.names,
    d1Categories: d1CategoriesByTitle(options.d1Titles === undefined ? [] : options.d1Titles),
    ...(options.storeNames ? { storeNames: options.storeNames } : {})
  })
  const titledAll = ruled.map((entry, index) => ({ ...entry, adoption: adoptions[index] }))
  // ルールの題に戻した後の題が品質ゲートに落ちたイベントは作らない（書き込みは INSERT のみで、後から題を直せない）
  const titled = titledAll.filter((entry) => entry.adoption.gate === null)
  record('題を付けられる（ルールの題に戻したものは品質検査に通る）', live.length, titled.length)
  const untitled = titledAll.flatMap(({ event, startDay, adoption }): SeedSelection['untitled'] =>
    adoption.gate === null
      ? []
      : [
          {
            emulatedId: event.id,
            store: event.store,
            startDay,
            item: event.item,
            ruleTitle: adoption.ruleTitle,
            llmTitle: adoption.llmTitle,
            reason: describeReject(adoption.gate)
          }
        ]
  )
  const groups = groupBy(
    titled,
    (entry) => `${storeDayKey(entry.event.store, entry.startDay)}|${entry.adoption.title}`
  )
  const ranked = [...groups.values()].map((group) =>
    group.toSorted((a, b) =>
      chain(b.event.posts.length - a.event.posts.length, a.event.firstSeen - b.event.firstSeen, a.index - b.index)
    )
  )
  const unique = ranked.map((group) => group[0])
  record('同じ店舗・開始日・題のイベントを 1 件にまとめる', titled.length, unique.length)
  const duplicates = {
    dropped: titled.length - unique.length,
    examples: ranked
      .filter((group) => group.length > 1)
      .slice(0, EXAMPLES)
      .map((group) => ({
        store: group[0].event.store,
        startDay: group[0].startDay,
        title: group[0].adoption.title,
        kept: group[0].event.id
      }))
  }

  const newestFirst = unique.toSorted((a, b) =>
    chain(
      b.startDay.localeCompare(a.startDay),
      a.event.store.localeCompare(b.event.store),
      a.adoption.title.localeCompare(b.adoption.title),
      a.index - b.index
    )
  )
  const limited = options.limit === undefined ? newestFirst : newestFirst.slice(0, options.limit)
  record('--limit（開始日の新しい順に先頭 N 件）', newestFirst.length, limited.length)

  // 終了予定日・実終了日時は暦日として読めるものだけ。終了予定日が開始日より前なら使わない
  const counters = { invalidDays: 0 }
  const endBeforeStart: SeedSelection['endBeforeStart'] = { count: 0, examples: [] }
  const discarded: QuantitySummary['examples'] = []
  const oversized: QuantitySummary['examples'] = []
  const plans = limited.map(({ event, clef, startDay, start, adoption, references }): SeedPlan => {
    const { endIso, endsBefore, endedIso, endDay, estimate } = resolveEnd(event, startDay, today)
    if (event.endDate !== undefined && endIso === undefined) counters.invalidDays += 1
    if (endsBefore && event.endDate !== undefined) {
      endBeforeStart.count += 1
      if (endBeforeStart.examples.length < EXAMPLES)
        endBeforeStart.examples.push({ emulatedId: event.id, startDay, endDay: event.endDate })
    }
    if (event.endedAt !== undefined && endedIso === undefined) counters.invalidDays += 1
    // 配布数が小さすぎるもの（「おひとり様 N 枚」の読み違い）と大きすぎるもの（店舗全体の総数などの読み違い）は捨てる
    // （limitedQuantity が null なら配布条件は everyone）
    const quantity = event.quantity !== undefined && usableQuantity(event.quantity) ? event.quantity : null
    if (event.quantity !== undefined && event.quantity < MIN_LIMITED_QUANTITY)
      discarded.push({ emulatedId: event.id, startDay, title: adoption.title, quantity: event.quantity })
    if (event.quantity !== undefined && event.quantity > MAX_LIMITED_QUANTITY)
      oversized.push({ emulatedId: event.id, startDay, title: adoption.title, quantity: event.quantity })
    // 終了予定日も終了日も無いイベントは、最後の言及から STALE_ENDED_DAYS 日以上たっていれば最後の言及の日を終了日とみなす
    const estimatedDay = estimate !== undefined && estimate.kind === 'estimated' ? estimate.day : undefined
    const estimatedIso = estimatedDay === undefined ? undefined : jstDayToUtcIso(estimatedDay)
    return {
      emulatedId: event.id,
      store: event.store,
      item: event.item,
      title: adoption.title,
      ruleTitle: adoption.ruleTitle,
      llmTitle: adoption.llmTitle,
      titleSource: adoption.source,
      titleReject: adoption.reject ? describeReject(adoption.reject) : null,
      category: categoryOf(adoption.title, event.category),
      startDay,
      endDay,
      endedDay: orNull(endedIso === undefined ? estimatedDay : event.endedAt),
      startDate: start,
      endDate: endIso !== undefined && !endsBefore ? endIso : null,
      endedAt: orNull(endedIso === undefined ? estimatedIso : endedIso),
      endedAtEstimated: endedIso === undefined && estimatedIso !== undefined,
      limitedQuantity: quantity,
      isPreliminary: startDay > today,
      references,
      clef,
      mentions: event.posts.length
    }
  })
  return {
    plans,
    stages,
    untitled,
    duplicates,
    longTitles: plans
      .filter((plan) => [...plan.title].length > TITLE_LIMIT)
      .map(({ title, item }) => ({ title, item })),
    endBeforeStart,
    invalidDays: counters.invalidDays,
    missingPosts: missing.posts,
    replyFirst,
    notBiccameMusume,
    generic: limited.flatMap(({ event, explained }) =>
      explained.generic.length > 0 ? [{ item: event.item, removed: explained.generic }] : []
    ),
    discardedQuantities: summarizeQuantities(discarded),
    oversizedQuantities: summarizeQuantities(oversized),
    estimatedEnded: plans.filter((plan) => plan.endedAtEstimated).length,
    endUnknown: known.length - live.length,
    naming: namingStats
  }
}

const ruleAdoption = (ruleTitle: string): TitleAdoption => ({
  title: ruleTitle,
  ruleTitle,
  llmTitle: null,
  source: 'rule',
  reject: null,
  gate: null
})

/**
 * 選別を通ったイベントにタイトルを付ける。naming が無ければルールの題（--titles rule）。
 * あれば、イベントごとに命名のリクエスト（item・カテゴリ・開始日・禁止語・投稿本文）を作って流し、
 * 返った題を normalizeTitle → checkTitle で検査する。通れば llm、落ちたら（呼び出しが失敗して題が無いときも）
 * ルールの題に戻して fallback にし、理由を残す。ルールの題はそのまま書けるとは限らないので、戻した題には
 * 品質ゲート（gateTitle）をかけ、落ちた理由を adoption.gate に残す（落ちたイベントは selectSeedEvents が作らない）。
 * --titles rule のルールの題はゲートをかけない: 2026-10-09 の rule の dry-run では 724 件中 171 件が括弧・説明語・汎用名などで落ち、
 * 命名しない下書きとして全件を確かめるための題だから。
 */
const adoptTitles = async (
  entries: readonly { event: SeedEvent; startDay: string; explained: TitleExplanation }[],
  context: {
    naming?: NonNullable<SeedSelectOptions['naming']>
    bodies: ReadonlyMap<string, string>
    names: readonly string[]
    /** D1 のタイトル（d1TitleKey）→ そのタイトルを持つ D1 イベントの category 一覧 */
    d1Categories: ReadonlyMap<string, readonly string[]>
    storeNames?: ReadonlyMap<string, readonly string[]>
  }
): Promise<{ adoptions: TitleAdoption[]; stats: NamingStats | undefined }> => {
  const { naming } = context
  if (naming === undefined)
    return { adoptions: entries.map(({ explained }) => ruleAdoption(explained.title)), stats: undefined }
  const forbiddenOf = (store: string) => {
    const own = context.storeNames ? context.storeNames.get(store) : undefined
    return own === undefined ? [] : own
  }
  const targets = entries.map(({ event, startDay }) =>
    buildTitleTarget(naming.system, {
      item: event.item,
      category: promptCategory(event.category),
      startDay,
      forbidden: forbiddenOf(event.store),
      bodies: pickBodies(event.posts, context.bodies)
    })
  )
  const run = await naming.run(targets)
  const fallbacks: NamingStats['fallbacks'] = {
    empty: 0,
    too_long: 0,
    bracket: 0,
    name: 0,
    category: 0,
    call_failed: 0
  }
  const rejects: NamingStats['rejects'] = []
  const adoptions = entries.map(({ event, startDay, explained }, index): TitleAdoption => {
    const ruleTitle = explained.title
    // 題の検査の禁止語: その店舗のキャラ名・店舗名と、全店舗の名前
    const terms = [...forbiddenOf(event.store).map((name) => name.normalize('NFKC')), ...context.names]
    const raw = run.titles.get(targets[index].key)
    const llmTitle = raw === undefined ? null : normalizeTitle(raw)
    const fallback = (reject: TitleReject): TitleAdoption => {
      // D1 のタイトルは日本語の間に空白を置かないので、ルールの題が item の空白を引き継いでいたら詰める
      const title = squeezeJapaneseSpaces(ruleTitle)
      const gate = gateTitle(title, terms)
      fallbacks[reject.reason] += 1
      rejects.push({
        store: event.store,
        startDay,
        item: event.item,
        llmTitle,
        ruleTitle,
        title,
        reason: reject.reason,
        reject: describeReject(reject),
        gate: gate === null ? null : describeReject(gate)
      })
      return { title, ruleTitle, llmTitle, source: 'fallback', reject, gate }
    }
    if (llmTitle === null) return fallback({ reason: 'call_failed', detail: '' })
    const check = checkTitle(llmTitle, terms)
    if (!check.ok) return fallback({ reason: check.reason, detail: check.detail })
    // D1 に同じ題の企画があるのに配布物の種別が違うなら、同じ企画の表記に揃えたのではなく別物に付けた題なので採用しない
    // （acsta と other は同じ種別とみなす: D1 はまだ other のままで、アクスタは題で後から acsta にする）
    const d1 = context.d1Categories.get(d1TitleKey(llmTitle))
    if (d1 !== undefined && !d1.some((category) => sameKind(category) === sameKind(event.category)))
      return fallback({ reason: 'category', detail: `D1=${d1.join('/')} 今回=${event.category}` })
    return { title: llmTitle, ruleTitle, llmTitle, source: 'llm', reject: null, gate: null }
  })
  const { progress } = run
  return {
    adoptions,
    stats: {
      requests: progress.total,
      called: progress.called,
      cached: progress.cached,
      failed: progress.failed,
      stats: progress.stats,
      inputTokens: progress.inputTokens,
      outputTokens: progress.outputTokens,
      fallbacks,
      rejects
    }
  }
}

/** acsta にした作成予定と、題がアクスタなのに acsta にしなかった作成予定（アクキーと一緒の題・ackey / 名刺のカテゴリ） */
export const acstaSummary = (plans: readonly SeedPlan[]) => ({
  converted: plans
    .filter((plan) => plan.category === 'acsta')
    .map(({ emulatedId, store, startDay, title }) => ({ emulatedId, store, startDay, title })),
  kept: plans.flatMap(({ emulatedId, store, startDay, title, category }) => {
    const verdict = judgeAcsta(title, category)
    return verdict === 'keep_ackey' || verdict === 'keep_category' ? [{ emulatedId, store, startDay, title, category, verdict }] : []
  })
})

/** タイトルごとの作成数（多い順、同数は五十音順） */
export const titleCounts = (plans: readonly SeedPlan[]) =>
  [...groupBy(plans, (plan) => plan.title)]
    .map(([title, group]) => ({ title, count: group.length }))
    .sort((a, b) => chain(b.count - a.count, a.title.localeCompare(b.title)))

// ---------------------------------------------------------------------------------------------
// 書き込み
// ---------------------------------------------------------------------------------------------

export type Cell = string | number | null

export const insertRows = (db: Database, table: (typeof TABLES)[number], rows: readonly Record<string, Cell>[]) => {
  const columns = WRITTEN_COLUMNS[table]
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  )
  for (const row of rows) {
    statement.run(
      ...columns.map((column) => {
        const value = row[column]
        if (value === undefined) throw new Error(`${table}.${column}: no value`)
        return value
      })
    )
  }
}

/** 配布条件は本文を読まずに決める最小限: 配布数があれば先着、無ければ誰でも。購入条件は金額が分からないので作らない */
const conditionOf = (plan: SeedPlan) =>
  plan.limitedQuantity === null
    ? { type: 'everyone', quantity: null }
    : { type: 'first_come', quantity: plan.limitedQuantity }

export type SeedWriteOptions = {
  /** INSERT 時刻（ISO、Z 付き）。created_at / updated_at に入れる */
  now: string
  /** --force: ローカル D1 の既存行との照合を省く */
  force: boolean
  newId?: () => string
}

/**
 * 作るイベントを 1 つのトランザクションで INSERT する（events → event_stores → event_reference_urls → event_conditions）。
 * 書く直前に同じ店舗・開始日のイベントがローカル D1 に増えていた場合（--force を除く）と、書いた後の件数が合わない場合は、
 * ロールバックして止まる。
 * is_verified は false（自動生成のイベントを、人が検証した D1 の行と区別する）。group_id / character_id は null。
 */
export const applySeed = (db: Database, plans: readonly SeedPlan[], options: SeedWriteOptions) => {
  const newId = options.newId === undefined ? randomUUID : options.newId
  const write = db.transaction(() => {
    const before = countRows(db)
    if (!options.force) {
      const local = readLocalState(db)
      const clash = plans.find((plan) => local.storeDays.has(storeDayKey(plan.store, plan.startDay)))
      if (clash) throw new Error(`already in local D1: ${clash.store} ${clash.startDay} ${clash.title}`)
    }
    const stamps = { created_at: options.now, updated_at: options.now }
    const events = plans.map((plan) => ({ plan, id: newId() }))
    insertRows(
      db,
      'events',
      events.map(({ plan, id }) => ({
        id,
        category: plan.category,
        title: plan.title,
        limited_quantity: plan.limitedQuantity,
        start_date: plan.startDate,
        end_date: plan.endDate,
        ended_at: plan.endedAt,
        is_verified: 0,
        is_preliminary: plan.isPreliminary ? 1 : 0,
        group_id: null,
        character_id: null,
        ...stamps
      }))
    )
    insertRows(
      db,
      'event_stores',
      events.map(({ plan, id }) => ({ id: newId(), event_id: id, store_key: plan.store, ...stamps }))
    )
    insertRows(
      db,
      'event_reference_urls',
      events.flatMap(({ plan, id }) =>
        plan.references.map((reference) => ({
          id: newId(),
          event_id: id,
          type: reference.type,
          url: reference.url,
          ...stamps
        }))
      )
    )
    insertRows(
      db,
      'event_conditions',
      events.map(({ plan, id }) => {
        const condition = conditionOf(plan)
        return {
          id: newId(),
          event_id: id,
          type: condition.type,
          purchase_amount: null,
          quantity: condition.quantity,
          ...stamps
        }
      })
    )
    const after = countRows(db)
    const expected: RowCounts = {
      events: before.events + plans.length,
      event_stores: before.event_stores + plans.length,
      event_reference_urls: before.event_reference_urls + plans.reduce((sum, plan) => sum + plan.references.length, 0),
      event_conditions: before.event_conditions + plans.length
    }
    for (const table of TABLES)
      if (after[table] !== expected[table])
        throw new Error(`${table}: expected ${expected[table]} rows after insert but found ${after[table]}`)
    return { before, after }
  })
  // 書く側の待ち合わせは IMMEDIATE で先に書き込みロックを取る（途中で他の接続に割り込まれて失敗しない）
  return write.immediate()
}

/** 書き込む前のバックアップ。VACUUM INTO は読み取りの一貫したスナップショットから新しいファイルを作る */
export const backupDatabase = (db: Database, path: string) => {
  db.query('VACUUM INTO ?').run(path)
}

// ---------------------------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------------------------

/** path が root の下にあることを確かめる。レポートとバックアップは .cache の下にしか書かない */
export const assertInside = (root: string, path: string, label: string) => {
  const resolvedRoot = resolve(root)
  const resolved = resolve(path)
  if (!resolved.startsWith(`${resolvedRoot}${sep}`)) throw new Error(`${label} must be under ${resolvedRoot}: ${path}`)
  return resolved
}

export type SeedRunOptions = {
  /** .cache/event-detect */
  dir: string
  /** レポートとバックアップを書ける場所（.cache） */
  cacheRoot: string
  charactersPath: string
  dbPath: string
  apply: boolean
  threshold: number
  since?: string
  before?: string
  force: boolean
  limit?: number
  reportPath: string
  /** 実行時刻（ISO） */
  now: string
  /** タイトルの付け方。llm は Haiku で命名（環境変数 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN が必要）、rule はルールベース */
  titles: TitleMode
  /** 命名の同時リクエスト数 (default: DEFAULT_TITLE_CONCURRENCY) */
  concurrency?: number
  /** Haiku の endpoint。省略（titles が llm のとき）は環境変数から作る */
  endpoint?: JudgeEndpoint
  onTitleProgress?: (progress: TitleProgress) => void
  onTitleError?: (target: TitleTarget, error: unknown) => void
}

/** 命名の同時リクエスト数の既定 */
export const DEFAULT_TITLE_CONCURRENCY = 16

export type SeedRun = {
  selection: SeedSelection
  checks: ColumnCheck[]
  local: LocalState | undefined
  counts: RowCounts
  clef: { judged: number; invalid: number }
  gold: number
  reportPath: string
  /** --apply で書いたとき。書く件数が 0 なら undefined */
  applied?: { backupPath: string; before: RowCounts; after: RowCounts }
}

// is_biccame_musume が無い要素は読み込みの時点でエラーにする（ビッカメ娘かどうかの判定を黙って省かない）
const CharactersSchema = z.array(
  z.object({ id: z.string().nonempty(), character: z.object({ is_biccame_musume: z.boolean() }) })
)

/**
 * characters.json の店舗キーと、そのうちビッカメ娘ではない店舗（character.is_biccame_musume が false。
 * air・biccamera・bicsim・naisen・oeraitan など）。店舗キーは直書きせず、characters.json の印から作る。
 */
export const readStoreMarks = async (path: string) => {
  const parsed = CharactersSchema.safeParse(parseJson(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return {
    storeKeys: new Set(parsed.data.map(({ id }) => id)),
    nonBiccameStores: new Set(parsed.data.filter(({ character }) => !character.is_biccame_musume).map(({ id }) => id))
  }
}

export const compactStamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')

/**
 * 材料（emulate の結果・Clef の判定・D1 の正解データ・ローカル D1）を読み、作るイベントを決めて、レポートを書く。
 * apply のときだけ、バックアップを取ってからローカル D1 に書く。apply でなければ DB は readonly で開く。
 */
export const runSeed = async (options: SeedRunOptions): Promise<SeedRun> => {
  const reportPath = assertInside(options.cacheRoot, options.reportPath, '--report')
  // 命名の endpoint は先に確かめる（環境変数が無いのに、材料を読んだ後で止まらない）
  const endpoint =
    options.titles === 'llm' ? (options.endpoint === undefined ? endpointFromEnv() : options.endpoint) : undefined
  const db = openLocalDb(options.dbPath, options.apply)
  try {
    const checks = checkColumns(db)
    assertColumns(checks)
    const [events, judgements, gold, storeNames, { storeKeys, nonBiccameStores }] = await Promise.all([
      readSeedEvents(options.dir),
      readJudgements(options.dir),
      readGold(resolve(options.dir, 'gold.json')),
      readStoreNames(options.charactersPath),
      readStoreMarks(options.charactersPath)
    ])
    const local = options.force ? undefined : readLocalState(db)
    const names = seedNameTerms(storeNames)
    const scan = sharedPostScan(resolve(options.dir, 'posts.jsonl'))
    const naming =
      endpoint === undefined
        ? undefined
        : {
            // 手本は D1 の正解データから作る。規則に反する古い登録（括弧・キャラ名つき）は載せない
            system: titleSystem(titleExamples(gold.events, (title) => isExampleTitle(title, names))),
            lookupBodies: async (ids: ReadonlySet<string>) =>
              new Map([...(await scan(ids)).values()].flatMap(({ id, text }) => (text === undefined ? [] : [[id, text] as const]))),
            run: (targets: readonly TitleTarget[]) =>
              runTitles({
                targets,
                cacheDir: resolve(options.dir, 'seed-title', JUDGE_MODEL, TITLE_VERSION),
                concurrency: options.concurrency === undefined ? DEFAULT_TITLE_CONCURRENCY : options.concurrency,
                endpoint,
                ...(options.onTitleProgress ? { onProgress: options.onTitleProgress } : {}),
                ...(options.onTitleError ? { onError: options.onTitleError } : {})
              })
          }
    const selection = await selectSeedEvents({
      events,
      clef: judgements.clef,
      threshold: options.threshold,
      ...(options.since === undefined ? {} : { since: options.since }),
      ...(options.before === undefined ? {} : { before: options.before }),
      gold: gold.events,
      d1Titles: gold.events,
      ...(local ? { local } : {}),
      storeKeys,
      nonBiccameStores,
      unsupportedStores: new Set(APP_UNSUPPORTED_STORES),
      names,
      storeNames,
      lookupScreenNames: async (ids) =>
        new Map([...(await scan(ids))].map(([id, post]) => [id, post.screenName] as const)),
      lookupKinds: async (ids) => new Map([...(await scan(ids))].map(([id, post]) => [id, post.kind] as const)),
      ...(naming ? { naming } : {}),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      now: options.now
    })
    const counts = countRows(db)
    const run: SeedRun = {
      selection,
      checks,
      local,
      counts,
      clef: { judged: judgements.clef.size, invalid: judgements.invalid },
      gold: gold.events.length,
      reportPath
    }
    await writeAtomic(reportPath, `${JSON.stringify(seedReport(options, run), null, 2)}\n`)
    // 書き込みは INSERT のみで後から題を直せない。呼び出しに失敗した命名があるまま書かない（保存済みは呼び直さないので、再実行で失敗分だけ呼ぶ）
    if (options.apply && selection.naming && selection.naming.failed > 0)
      throw new Error(
        `naming failed for ${selection.naming.failed} request(s); nothing was written. Re-run to retry only the failed ones (report: ${reportPath})`
      )
    if (!options.apply || selection.plans.length === 0) return run
    const backupPath = assertInside(
      options.cacheRoot,
      resolve(options.dir, `seed-backup-${compactStamp(options.now)}.sqlite`),
      'backup'
    )
    await mkdir(dirname(backupPath), { recursive: true })
    backupDatabase(db, backupPath)
    const backup = new Database(backupPath, { readonly: true })
    const backedUp = countRows(backup)
    backup.close()
    for (const table of TABLES)
      if (backedUp[table] !== counts[table])
        throw new Error(`backup ${table}: ${backedUp[table]} rows, expected ${counts[table]}`)
    const { before, after } = applySeed(db, selection.plans, { now: options.now, force: options.force })
    return { ...run, applied: { backupPath, before, after } }
  } finally {
    db.close()
  }
}

/** --report に書く内容。作るイベントの一覧と、絞り込みの経過 */
export const seedReport = (options: SeedRunOptions, run: SeedRun) => ({
  generatedAt: options.now,
  mode: options.apply ? 'apply' : 'dry-run',
  db: options.dbPath,
  threshold: options.threshold,
  since: options.since === undefined ? null : options.since,
  before: options.before === undefined ? null : options.before,
  force: options.force,
  limit: options.limit === undefined ? null : options.limit,
  titles: options.titles,
  titleModel: options.titles === 'llm' ? { model: JUDGE_MODEL, version: TITLE_VERSION } : null,
  minLimitedQuantity: MIN_LIMITED_QUANTITY,
  maxLimitedQuantity: MAX_LIMITED_QUANTITY,
  staleEndedDays: STALE_ENDED_DAYS,
  stages: run.selection.stages,
  untitled: run.selection.untitled,
  duplicates: run.selection.duplicates,
  longTitles: run.selection.longTitles,
  endBeforeStart: run.selection.endBeforeStart,
  discardedQuantities: run.selection.discardedQuantities,
  oversizedQuantities: run.selection.oversizedQuantities,
  replyFirst: run.selection.replyFirst,
  notBiccameMusume: run.selection.notBiccameMusume,
  estimatedEnded: run.selection.estimatedEnded,
  endUnknown: run.selection.endUnknown,
  acsta: acstaSummary(run.selection.plans),
  naming: run.selection.naming ? run.selection.naming : null,
  events: run.selection.plans.map((plan) => ({
    title: plan.title,
    ruleTitle: plan.ruleTitle,
    llmTitle: plan.llmTitle,
    titleSource: plan.titleSource,
    titleReject: plan.titleReject,
    item: plan.item,
    store: plan.store,
    category: plan.category,
    startDate: plan.startDay,
    endDate: plan.endDay,
    endedAt: plan.endedDay,
    endedAtEstimated: plan.endedAtEstimated,
    isPreliminary: plan.isPreliminary,
    limitedQuantity: plan.limitedQuantity,
    referenceUrls: plan.references,
    clef: plan.clef,
    mentions: plan.mentions,
    emulatedId: plan.emulatedId
  }))
})

const TOP_TITLES = 20
/** dry-run のログに出す「item → title」の行数の上限。全件はレポートにある */
const TITLE_LISTING = 100
/** ログに出す「ルールの題 → 採用した題」の変化の行数の上限 */
const CHANGE_LISTING = 40
const STAGE_WIDTH = 66

const FALLBACK_REASONS: readonly TitleRejectReason[] = ['empty', 'too_long', 'bracket', 'name', 'category']
/** ログに出す「D1 の同名の企画と配布物の種別が違う」で戻した例の行数の上限。全件はレポート */
const CATEGORY_LISTING = 10
const TITLE_SOURCES: readonly TitleSource[] = ['llm', 'fallback', 'rule']

/** 命名のログ。呼び出し数・保存済み・失敗・検査落ちとその内訳、費用の概算（judge と同じ単価） */
const describeNaming = (naming: NamingStats): string[] => {
  const mismatched = naming.rejects.filter((entry) => entry.reason === 'category')
  return [
    `命名（${JUDGE_MODEL} / ${TITLE_VERSION}）: リクエスト ${naming.requests} 件 = 呼んだ ${naming.called} / 保存済み ${naming.cached} / 失敗 ${naming.failed}（429=${naming.stats.rateLimited} 5xx=${naming.stats.serverErrors} 作り直し=${naming.stats.invalid}）`,
    `  tokens in=${naming.inputTokens} out=${naming.outputTokens} 概算 $${titleCost(naming.inputTokens, naming.outputTokens).toFixed(3)}（入力 $0.10 / 出力 $0.50 per 1M。保存済みの分は含まない）`,
    `  検査落ちでルールの題に戻した: ${FALLBACK_REASONS.reduce((sum, reason) => sum + naming.fallbacks[reason], 0)} 件（${FALLBACK_REASONS.map((reason) => `${reason}=${naming.fallbacks[reason]}`).join(' ')}）/ 呼び出し失敗でルールの題に戻した: ${naming.fallbacks.call_failed} 件`,
    ...naming.rejects
      .filter((entry) => entry.reason !== 'category')
      .map(
        (entry) =>
          `    ${entry.store} ${entry.startDay} [${entry.item}] 命名=${entry.llmTitle === null ? '（なし）' : entry.llmTitle} 理由=${entry.reject} → ルール: ${entry.ruleTitle}${entry.gate === null ? '' : `（作らない: ${entry.gate}）`}`
      ),
    `  D1 の同名の企画とは配布物の種別が違うため、ルールの題に戻した: ${mismatched.length} 件${mismatched.length > CATEGORY_LISTING ? `（先頭 ${CATEGORY_LISTING} 件。全件はレポート）` : ''}`,
    ...mismatched
      .slice(0, CATEGORY_LISTING)
      .map(
        (entry) =>
          `    ${entry.store} ${entry.startDay} [${entry.item}] 命名=${entry.llmTitle === null ? '（なし）' : entry.llmTitle} 理由=${entry.reject} → ルール: ${entry.ruleTitle} → ${entry.gate === null ? `採用: ${entry.title}` : `作らない（品質ゲート: ${entry.gate}）`}`
      )
  ]
}

/** 全角を 2 桁として数えて右を空白で埋める（日本語の表の桁を揃える） */
const padDisplay = (text: string, width: number) =>
  `${text}${' '.repeat(Math.max(0, width - [...text].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1), 0)))}`

const describeQuantities = (summary: QuantitySummary) =>
  `${summary.count} 件${summary.count > 0 ? `（配布数別 ${summary.byQuantity.map((entry) => `${entry.quantity}×${entry.count}`).join(' ')}）` : ''}${summary.examples.map((example) => `\n  ${example.emulatedId} ${example.startDay} ${example.title} quantity=${example.quantity}`).join('')}`

/** 実行結果のログ（標準出力に出す行） */
export const describeSeed = (options: SeedRunOptions, run: SeedRun): string[] => {
  const { selection } = run
  const range = `${options.since === undefined ? '' : options.since}〜${options.before === undefined ? '' : options.before}`
  const total = (counts: RowCounts) => TABLES.map((table) => `${table}=${counts[table]}`).join(' ')
  const acsta = acstaSummary(selection.plans)
  return [
    `seed: ${options.apply ? '--apply（ローカル D1 に書く）' : '--dry-run（書かない）'} しきい値=${options.threshold} 期間=${range} force=${options.force} titles=${options.titles}`,
    `db: ${options.dbPath}`,
    `材料: emulate=${run.selection.stages[0].remaining} 件 / Clef の判定=${run.clef.judged} 件（読めないキャッシュ ${run.clef.invalid}） / D1 の正解データ=${run.gold} 件${run.local ? ` / ローカル D1 の開始日を読めない行=${run.local.invalid}` : ''}`,
    '',
    '列の確認（PRAGMA table_info）:',
    ...run.checks.map(
      (check) =>
        `  ${check.table.padEnd(22)} 書く列 ${check.written.length} / テーブルの列 ${check.columns}  テーブルに無い列=${check.absent.length}  書かない必須列=${check.uncovered.length}`
    ),
    '',
    `${padDisplay('段階', STAGE_WIDTH)}${'除外'.padStart(7)}${'残り'.padStart(7)}`,
    ...selection.stages.map(
      (stage) =>
        `${padDisplay(stage.label, STAGE_WIDTH)}${String(stage.excluded).padStart(7)}${String(stage.remaining).padStart(7)}`
    ),
    '',
    `作成${options.apply ? '' : '予定'}: ${selection.plans.length} 件（参考 URL ${selection.plans.reduce((sum, plan) => sum + plan.references.length, 0)} 件、うち開始前 ${selection.plans.filter((plan) => plan.isPreliminary).length} 件）`,
    `題を付けられず作らなかった LLM イベント（ルールの題に戻した題が品質ゲートに落ちた）: ${selection.untitled.length} 件${selection.untitled.map((entry) => `\n  ${entry.store} ${entry.startDay} [${entry.item}] ルールの題=${entry.ruleTitle} 命名=${entry.llmTitle === null ? '（なし）' : entry.llmTitle} 理由=${entry.reason}`).join('')}`,
    `重複で除いた LLM イベント: ${selection.duplicates.dropped} 件${selection.duplicates.examples.map((example) => `\n  ${example.store} ${example.startDay} ${example.title}（残した ${example.kept}）`).join('')}`,
    `${TITLE_LIMIT} 文字を超えるタイトル: ${selection.longTitles.length} 件${selection.longTitles.map((entry) => `\n  ${entry.title}（item: ${entry.item}）`).join('')}`,
    `endDate が startDate より前で null にした: ${selection.endBeforeStart.count} 件${selection.endBeforeStart.examples.map((example) => `\n  ${example.emulatedId} start=${example.startDay} end=${example.endDay}`).join('')}`,
    `配布数が ${MIN_LIMITED_QUANTITY} 未満で捨てた（limited_quantity なし・配布条件は everyone）: ${describeQuantities(selection.discardedQuantities)}`,
    `配布数が ${MAX_LIMITED_QUANTITY} を超えて捨てた（limited_quantity なし・配布条件は everyone）: ${describeQuantities(selection.oversizedQuantities)}`,
    `終了の情報が無く、最後の言及から ${STALE_ENDED_DAYS} 日以上たっていて、最後の言及の日を終了日（endedAt）に推定で入れた: ${selection.estimatedEnded} 件（基準日 ${jstDayOf(options.now)}）`,
    `終了が分からないまま止まっている（終了予定日も終了日も無く、最後の言及が開始日より前で、開始から ${STALE_ENDED_DAYS} 日以上）ため作らなかった: ${selection.endUnknown} 件（基準日 ${jstDayOf(options.now)}）`,
    `題がアクスタ（アクスタ・アクリルスタンド。アクキーを含まない）の other を acsta にして作る: ${acsta.converted.length} 件${acsta.converted.map((entry) => `\n  ${entry.store} ${entry.startDay} [${entry.title}]`).join('')}`,
    `題がアクスタだが acsta にしなかった（アクキーと一緒の題・ackey / 名刺のカテゴリ）: ${acsta.kept.length} 件${acsta.kept.map((entry) => `\n  ${entry.store} ${entry.startDay} [${entry.title}] category=${entry.category}（${entry.verdict === 'keep_ackey' ? 'アクキーと一緒' : 'カテゴリが other ではない'}）`).join('')}`,
    `暦日として読めず null にした endDate / endedAt: ${selection.invalidDays} 件`,
    `参考 URL の投稿が posts.jsonl に無く、作れなかった種別: ${selection.missingPosts} 件`,
    `ビッカメ娘の店舗ではない（characters.json の is_biccame_musume が false）ため作らなかった: ${selection.notBiccameMusume.count} 件${selection.notBiccameMusume.count > 0 ? `（${selection.notBiccameMusume.byStore.map((entry) => `${entry.store}×${entry.count}`).join(' ')}）` : ''}`,
    `最初の告知・開始の言及がリプライ（リツイート）のため作らなかった: ${selection.replyFirst.announce + selection.replyFirst.start + selection.replyFirst.both} 件（告知=${selection.replyFirst.announce} 開始=${selection.replyFirst.start} 両方=${selection.replyFirst.both}）`,
    `一般則（〜たん）で取り除いた語: ${selection.generic.length} 件${selection.generic.map((entry) => `\n  ${entry.item} → ${entry.removed.join(', ')}`).join('')}`,
    '',
    ...(selection.naming ? [...describeNaming(selection.naming), ''] : []),
    `タイトルの出どころ（作成${options.apply ? '' : '予定'}の ${selection.plans.length} 件）: ${TITLE_SOURCES.map((source) => `${source}=${selection.plans.filter((plan) => plan.titleSource === source).length}`).join(' ')}`,
    `ルールの題から変わったタイトル: ${selection.plans.filter((plan) => plan.title !== plan.ruleTitle).length} 件（先頭 ${CHANGE_LISTING} 件。全件はレポート）`,
    ...selection.plans
      .filter((plan) => plan.title !== plan.ruleTitle)
      .slice(0, CHANGE_LISTING)
      .map((plan) => `  ${plan.store} ${plan.startDay} [${plan.ruleTitle}] → ${plan.title}`),
    '',
    `タイトル上位 ${TOP_TITLES}:`,
    ...titleCounts(selection.plans)
      .slice(0, TOP_TITLES)
      .map((entry) => `  ${String(entry.count).padStart(4)}  ${entry.title}`),
    ...(options.apply
      ? []
      : [
          '',
          `item → title（先頭 ${Math.min(TITLE_LISTING, selection.plans.length)} 件。全件はレポート）:`,
          ...selection.plans
            .slice(0, TITLE_LISTING)
            .map((plan) => `  ${plan.store} ${plan.startDay} [${plan.item}] → ${plan.title}`)
        ]),
    '',
    `ローカル D1 の件数（書く前）: ${total(run.counts)}`,
    ...(run.applied
      ? [
          `バックアップ: ${run.applied.backupPath}`,
          `書き込み後: ${total(run.applied.after)}`,
          `増えた件数: ${TABLES.map((table) => `${table}=+${run.applied ? run.applied.after[table] - run.applied.before[table] : 0}`).join(' ')}`
        ]
      : [
          options.apply ? '書く件数が 0 件のため、書き込みもバックアップもしていない' : '書き込みなし（--apply で書く）'
        ]),
    `レポート: ${run.reportPath}`
  ]
}

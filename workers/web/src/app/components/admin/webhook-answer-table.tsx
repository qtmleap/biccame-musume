import {
  type AnswerRow,
  describeAnswers,
  describeItemCountAudit,
  ITEM_COUNT_QUESTION_KEY,
  uncheckedItemCountRow
} from '@biccame/shared/event-detect/answer-view'
import { detectionCharacters, detectionStores } from '@biccame/shared/event-detect/associations'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS, type DetectionThresholds } from '@biccame/shared/event-detect/detection'
import type { ItemCountAudit } from '@biccame/shared/event-detect/extraction'
import { SpecialCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { AnswerCell, AssociationCell } from '@/components/admin/webhook-answer-cell'
import { cn } from '@/lib/utils'
import { SPECIAL_CHARACTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'

// 店舗名はアプリの短い名前（STORE_NAME_LABELS。「ビックカメラ」を含まない）で出す。
// 検出用カタログの名前は Clef への質問文のためのもので「ビックカメラ…」で始まるため、StoreKey でない ID のときだけ使う。
const storeName = (id: string): string => {
  const parsed = StoreKeySchema.safeParse(id)
  if (parsed.success) return STORE_NAME_LABELS[parsed.data]
  const store = detectionStores.find((entry) => entry.id === id)
  return store === undefined ? id : store.name
}

const characterName = (id: string): string => {
  const character = detectionCharacters.find((entry) => entry.id === id)
  return character === undefined ? id : character.name
}

// 保存された対象ビッカメ娘には other / secret の特別な値が入る。質問の一覧には無いため、特別な値は別に名前を引く。
const savedCharacterName = (id: string): string => {
  const special = SpecialCharacterSchema.safeParse(id)
  return special.success ? SPECIAL_CHARACTER_LABELS[special.data] : characterName(id)
}

// グループ見出しが種別を示すため、関連先の行には名前だけを表示する。
const rowLabel = (row: AnswerRow): string => {
  if (row.key.startsWith('venue.')) return storeName(row.key.slice('venue.'.length))
  if (row.key.startsWith('character.')) return characterName(row.key.slice('character.'.length))
  return row.label
}

// v3〜v12 の noul 質問（venue.* / character.*）。グループ見出しの振り分けは前方一致で行う。
const isVenueRow = (row: AnswerRow): boolean => row.key.startsWith('venue.')
const isCharacterRow = (row: AnswerRow): boolean => row.key.startsWith('character.')
// 「ビッカメ娘のイベントか」（is_event）は判定（しきい値・理由）には使うが、回答表の行としては画面に出さない。
// 行を返すのは describeAnswers のままで、ここで除く。理由欄や管理画面のしきい値入力には影響しない。
const HIDDEN_ANSWER_KEY = 'is_event'
const isEventRow = (row: AnswerRow): boolean => row.key === HIDDEN_ANSWER_KEY

// v2 と v13 の choice 質問。キーが store / character そのもので、前方一致のグループには入らず基本判定に並ぶ。
const isStoreChoiceRow = (row: AnswerRow): boolean => row.key === 'store'
const isCharacterChoiceRow = (row: AnswerRow): boolean => row.key === 'character'

// 回答に店舗・ビッカメ娘の質問が無い保存データで、判定結果の名前を選択式の質問と同じ形で補う行。
type AssociationRow = { key: string; label: string; names: readonly string[] }

type AnswerGroup = {
  key: 'basic' | 'venues' | 'characters'
  label: string
  rows: AnswerRow[]
  // 基本判定の末尾にだけ付く補い行。ほかのグループは空配列。
  associations: AssociationRow[]
}

// 配布物（category）の行の直後に件数の判定行を置く。配布物の行が無ければ基本判定の末尾に置く。
const DISTRIBUTION_KEY = 'category'
const withItemCountRow = (rows: AnswerRow[], itemCountRow: AnswerRow | undefined): AnswerRow[] => {
  if (itemCountRow === undefined) return rows
  const index = rows.findIndex((row) => row.key === DISTRIBUTION_KEY)
  if (index === -1) return [...rows, itemCountRow]
  return [...rows.slice(0, index + 1), itemCountRow, ...rows.slice(index + 1)]
}

// 件数の判定行は ItemCountAudit（判定時に保存した値）から作る。undefined は件数を使わない種類のジョブで行を出さない。null は監査が保存されていない旧ジョブ。
const itemCountRowOf = (audit: ItemCountAudit | null | undefined): AnswerRow | undefined => {
  if (audit === undefined) return undefined
  return audit === null ? uncheckedItemCountRow() : describeItemCountAudit(audit)
}

// 列数は幅から決める。md 以上はセルが 17rem 未満にならない範囲で自動で増やす（md で 2 列、lg 以上の全幅で 3 列）。
const GRID = 'grid grid-cols-1 gap-x-4 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]'

/**
 * Clef が質問ごとに返した回答と確率を、1回答1セルの Grid で見せる。
 * しきい値が取れない間（読み込み中・エラー）は、しきい値とステータスを '—' にする。
 * stores / characterIds（判定結果の店舗・対象ビッカメ娘）を渡すと、回答に店舗・ビッカメ娘の質問が無い保存データでも
 * 基本判定の末尾に「開催・配布店舗」「対象ビッカメ娘」のセルを出す（確率は '—'）。渡さない場合は回答にあるセルだけを出す。
 * v13（と v2 の店舗）の store / character は describeAnswers が返す通常の choice 行として基本判定に出るため、その軸は補わない。
 * itemCountAudit は配布物の種類数の件数監査。undefined なら件数のセルを出さず、null なら「未チェック」のセルを出す。
 * 件数のセルは判定時に保存した値なので、現在のしきい値が取れていなくても自分のしきい値と判定を出す。
 */
export const WebhookAnswerTable = ({
  answers,
  thresholds,
  stores,
  characterIds,
  itemCountAudit
}: {
  answers: Record<string, ClefAnswer>
  thresholds?: DetectionThresholds
  stores?: readonly string[]
  characterIds?: readonly string[]
  itemCountAudit?: ItemCountAudit | null
}) => {
  // しきい値が無い時の行のしきい値・確定は使わない（'—' にする）ため、既定値で組み立てる。
  // is_event の行は画面に出さない。空判定・グループ分けは、この除外後の rows をすべてで使う。
  const rows = describeAnswers(answers, thresholds === undefined ? DEFAULT_DETECTION_THRESHOLDS : thresholds).filter(
    (row) => !isEventRow(row)
  )
  const itemCountRow = itemCountRowOf(itemCountAudit)
  if (rows.length === 0 && itemCountRow === undefined)
    return <p className='text-sm text-muted-foreground'>回答の記録なし</p>
  const hasVenueRows = rows.some(isVenueRow)
  const hasCharacterRows = rows.some(isCharacterRow)
  // 見出しは、回答に venue.* / character.* の質問がある（v3〜v12 の）ときだけ出す。補い行や store / character の choice 行だけでは出さない。
  const grouped = hasVenueRows || hasCharacterRows
  // 店舗・ビッカメ娘の回答がどの形（venue.* / character.* の noul、store / character の choice）でも保存されていない軸だけ、
  // 判定結果の名前で補う（片方だけ無ければ、無いほうだけ補う）。choice の行は describeAnswers が通常の行として返すため、補うと二重になる。
  const hasStoreAnswer = hasVenueRows || rows.some(isStoreChoiceRow)
  const hasCharacterAnswer = hasCharacterRows || rows.some(isCharacterChoiceRow)
  // 回答の行が無いとき（件数のセルだけがあるとき）は、補う相手の回答が無いので補い行も出さない。
  const associations: AssociationRow[] =
    rows.length === 0
      ? []
      : [
          ...(stores === undefined || hasStoreAnswer
            ? []
            : [{ key: 'venues', label: '開催・配布店舗', names: stores.map(storeName) }]),
          ...(characterIds === undefined || hasCharacterAnswer
            ? []
            : [{ key: 'characters', label: '対象ビッカメ娘', names: characterIds.map(savedCharacterName) }])
        ]
  // 保存順にかかわらず基本判定・開催店舗・対象ビッカメ娘を分け、どちらの所属を判定したかを明確にする。
  const allGroups: AnswerGroup[] = [
    {
      key: 'basic',
      label: '基本判定',
      rows: withItemCountRow(
        rows.filter((row) => !isVenueRow(row) && !isCharacterRow(row)),
        itemCountRow
      ),
      associations
    },
    { key: 'venues', label: '開催・配布店舗', rows: rows.filter(isVenueRow), associations: [] },
    { key: 'characters', label: '対象ビッカメ娘', rows: rows.filter(isCharacterRow), associations: [] }
  ]
  const groups = allGroups
    .filter((group) => group.rows.length > 0 || group.associations.length > 0)
    .map((group) => ({
      ...group,
      rows: group.key === 'basic' ? group.rows : group.rows.filter((row) => row.answer === 'はい')
    }))
  return (
    <>
      {rows.length === 0 && <p className='mb-3 text-sm text-muted-foreground'>回答の記録なし</p>}
      <ul aria-label='Clef の回答' className='space-y-6'>
        {groups.map((group) => (
          <li key={group.key}>
            <section aria-label={group.label}>
              {grouped && <h3 className='mb-2 text-base font-semibold'>{group.label}</h3>}
              {group.rows.length === 0 && group.associations.length === 0 ? (
                <p className='border-y border-separator py-3 text-sm text-muted-foreground'>該当なし</p>
              ) : (
                <ul className={cn(GRID, 'border-t border-separator')}>
                  {group.rows.map((row) => (
                    <AnswerCell
                      key={row.key}
                      row={row}
                      label={rowLabel(row)}
                      thresholdKnown={thresholds !== undefined || row.key === ITEM_COUNT_QUESTION_KEY}
                    />
                  ))}
                  {group.associations.map((association) => (
                    <AssociationCell key={association.key} label={association.label} names={association.names} />
                  ))}
                </ul>
              )}
            </section>
          </li>
        ))}
      </ul>
      <p className='mt-3 text-sm text-muted-foreground'>
        しきい値は現在の設定です。判定した時点の設定と異なる場合があります。
        {itemCountRow !== undefined && '配布物の種類数のしきい値は、判定時に保存した値です。'}
      </p>
    </>
  )
}

import { type AnswerRow, describeAnswers } from '@biccame/shared/event-detect/answer-view'
import { detectionCharacters, detectionStores } from '@biccame/shared/event-detect/associations'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS, type DetectionThresholds } from '@biccame/shared/event-detect/detection'
import { SpecialCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { TONE } from '@/components/admin/event-detect/constants'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { SPECIAL_CHARACTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'

// td に font-mono を付けると行の基線が等幅フォントで決まり、隣のセルとずれる。等幅は内側の span にだけ付ける。
// span の行高を 0 にして行内に置くと、行ボックスの高さと基線はセルの sans の行（20px）で決まり、数値がその基線に乗る。
// flex の items-center は箱の中心で揃えるため、フォントごとの基線の違いがずれになる。数値のセルでは flex を使わない。
const MONO = 'font-mono tabular-nums leading-[0]'

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

/**
 * 回答に店舗・ビッカメ娘の質問が無い（venue.* / character.* も store / character も無い）保存データの代わりに、判定結果を「質問 → 回答」の1行で出す。
 * 他の選択式の行（配布物 → アクキー）と同じく、回答の列に名前を「、」で並べる。空なら「未判定」。
 * 確率・しきい値・判定・次点は回答が無いため、しきい値の有無によらず '—' にし、未確定の強調（bg-warning/10）は付けない。
 */
const AssociationAnswerRow = ({ label, names }: { label: string; names: readonly string[] }) => (
  <TableRow>
    <TableCell className='font-medium'>{label}</TableCell>
    <TableCell>{names.length === 0 ? '未判定' : names.join('、')}</TableCell>
    <TableCell className='text-right'>
      <span className={MONO}>—</span>
    </TableCell>
    <TableCell className='text-right text-muted-foreground'>
      <span className={MONO}>—</span>
    </TableCell>
    <TableCell>—</TableCell>
    <TableCell className='text-muted-foreground'>—</TableCell>
  </TableRow>
)

/**
 * Clef が質問ごとに返した回答と確率を表で見せる。
 * しきい値が取れない間（読み込み中・エラー）は、しきい値と判定の列を '—' にする。
 * stores / characterIds（判定結果の店舗・対象ビッカメ娘）を渡すと、回答に店舗・ビッカメ娘の質問が無い保存データでも
 * 基本判定の末尾に「開催・配布店舗」「対象ビッカメ娘」の行を出す（確率は '—'）。渡さない場合は回答にある行だけを出す。
 * v13（と v2 の店舗）の store / character は describeAnswers が返す通常の choice 行として基本判定に出るため、その軸は補わない。
 */
export const WebhookAnswerTable = ({
  answers,
  thresholds,
  stores,
  characterIds
}: {
  answers: Record<string, ClefAnswer>
  thresholds?: DetectionThresholds
  stores?: readonly string[]
  characterIds?: readonly string[]
}) => {
  // しきい値が無い時の行のしきい値・確定は使わない（列を '—' にする）ため、既定値で表だけ組み立てる。
  const rows = describeAnswers(answers, thresholds === undefined ? DEFAULT_DETECTION_THRESHOLDS : thresholds)
  if (rows.length === 0) return <p className='text-sm text-muted-foreground'>回答の記録なし</p>
  const hasVenueRows = rows.some(isVenueRow)
  const hasCharacterRows = rows.some(isCharacterRow)
  // 見出しは、回答に venue.* / character.* の質問がある（v3〜v12 の）ときだけ出す。補い行や store / character の choice 行だけでは出さない。
  const grouped = hasVenueRows || hasCharacterRows
  // 店舗・ビッカメ娘の回答がどの形（venue.* / character.* の noul、store / character の choice）でも保存されていない軸だけ、
  // 判定結果の名前で補う（片方だけ無ければ、無いほうだけ補う）。choice の行は describeAnswers が通常の行として返すため、補うと二重になる。
  const hasStoreAnswer = hasVenueRows || rows.some(isStoreChoiceRow)
  const hasCharacterAnswer = hasCharacterRows || rows.some(isCharacterChoiceRow)
  const associations: AssociationRow[] = [
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
      rows: rows.filter((row) => !isVenueRow(row) && !isCharacterRow(row)),
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
      <div className='overflow-x-auto border-y border-separator'>
        <Table aria-label='Clef の回答' className='whitespace-nowrap [&_tr]:border-separator'>
          <TableHeader>
            <TableRow>
              <TableHead>質問</TableHead>
              <TableHead>回答</TableHead>
              <TableHead className='text-right'>確率</TableHead>
              <TableHead className='text-right'>しきい値</TableHead>
              <TableHead>判定</TableHead>
              <TableHead>次点</TableHead>
            </TableRow>
          </TableHeader>
          {groups.map((group) => (
            <TableBody key={group.key} aria-label={group.label}>
              {grouped && (
                <TableRow className='bg-muted/50 hover:bg-muted/50'>
                  <TableHead colSpan={6} scope='rowgroup' className='h-auto py-3 font-semibold text-foreground'>
                    {group.label}
                  </TableHead>
                </TableRow>
              )}
              {group.rows.length === 0 && group.associations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className='py-3 text-muted-foreground'>
                    該当なし
                  </TableCell>
                </TableRow>
              )}
              {group.rows.map((row) => (
                <TableRow key={row.key} className={cn(thresholds !== undefined && !row.confirmed && 'bg-warning/10')}>
                  <TableCell className='font-medium'>{rowLabel(row)}</TableCell>
                  <TableCell>{row.answer}</TableCell>
                  <TableCell className='text-right'>
                    <span className={MONO}>{detectionScoreLabel(row.probability)}</span>
                  </TableCell>
                  <TableCell className={cn('text-right', thresholds === undefined && 'text-muted-foreground')}>
                    <span className={MONO}>{thresholds === undefined ? '—' : detectionScoreLabel(row.threshold)}</span>
                  </TableCell>
                  <TableCell>
                    {thresholds === undefined ? (
                      '—'
                    ) : (
                      <div className='flex items-center'>
                        <Badge variant='outline' className={row.confirmed ? TONE.success : TONE.warning}>
                          {row.confirmed ? '確定' : '未確定'}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {row.alternatives.length === 0 ? (
                      '—'
                    ) : (
                      // 外側の等幅 span は行高 0、内側の sans の span だけ行高 20px にして、行ボックスと基線を sans で決める。
                      // flex は items-baseline で基線揃えにし、日本語と等幅の数値の基線を隣のセルの文字と一致させる。
                      <div className='flex items-baseline gap-4'>
                        {row.alternatives.map((alternative) => (
                          <span key={alternative.answer} className={cn(MONO, 'flex items-baseline gap-1')}>
                            <span className='font-sans leading-5'>{alternative.answer}</span>{' '}
                            {detectionScoreLabel(alternative.probability)}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {group.associations.map((association) => (
                <AssociationAnswerRow key={association.key} label={association.label} names={association.names} />
              ))}
            </TableBody>
          ))}
        </Table>
      </div>
      <p className='mt-3 text-sm text-muted-foreground'>
        しきい値は現在の設定です。判定した時点の設定と異なる場合があります。
      </p>
    </>
  )
}

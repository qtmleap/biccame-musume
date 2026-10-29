import { BotSettingRow } from '@/components/admin/bot-settings-layout'
import type { EventThresholdKey, ThresholdKey } from '@/components/admin/field-threshold-form'
import { Input } from '@/components/ui/input'

/** しきい値の編集行。%で入力し、不正なときは行ごとにエラーを出す。note は入力欄の下に出す補足。 */
export const ThresholdRow = ({
  thresholdKey,
  label,
  ariaLabel,
  value,
  error,
  note,
  disabled,
  onChange
}: {
  thresholdKey: ThresholdKey
  label: string
  ariaLabel: string
  value: string
  error: string | undefined
  note?: string
  disabled: boolean
  onChange: (value: string) => void
}) => {
  const errorId = `field-threshold-${thresholdKey}-error`
  const noteId = `field-threshold-${thresholdKey}-note`
  const describedBy = [error === undefined ? null : errorId, note === undefined ? null : noteId].filter(
    (id) => id !== null
  )
  return (
    // 補足文・エラー文がある行は dd が縦に伸びる。grid の items-center だとラベルが dd 全体の中央に揃って入力欄からずれるため、
    // 行は上揃え（sm:items-start）にして、ラベルを入力欄の高さ（h-8）の中で中央揃えにする。補足文・エラー文が増えてもラベルは入力欄の隣で動かない。
    <BotSettingRow label={label} className='py-2 sm:items-start' labelClassName='sm:flex sm:h-8 sm:items-center'>
      <div className='flex items-center gap-2'>
        <Input
          type='text'
          inputMode='decimal'
          autoComplete='off'
          aria-label={ariaLabel}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy.length === 0 ? undefined : describedBy.join(' ')}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          // 数字はラベルと同じフォントにする。等幅（font-mono）だと数字の見た目の中心が枠の中心より上に寄り、ラベル・% と揃わない。
          className='h-8 w-20 text-right text-sm tabular-nums'
        />
        <span aria-hidden='true' className='text-sm text-muted-foreground'>
          %
        </span>
      </div>
      {note !== undefined && (
        <p id={noteId} className='mt-1 text-sm font-normal leading-relaxed text-muted-foreground'>
          {note}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} role='alert' className='mt-1 text-sm font-normal text-destructive'>
          {error}
        </p>
      )}
    </BotSettingRow>
  )
}

/**
 * 項目別のしきい値の補足文。店舗・娘は 1 段目の最上位がこの確率以上なら確認を省いて確定、未満なら確認の質問で決める。
 * 確認の行は「はい」の確率がこの値以上なら確定。他の項目は補足なし。
 */
export const FIELD_THRESHOLD_NOTES: Partial<Record<ThresholdKey, string>> = {
  store: 'この確率以上なら確認を省いて確定。未満なら「確認」の質問で決めます。',
  store_confirm: '「はい」の確率がこの値以上なら確定します。',
  character: 'この確率以上なら確認を省いて確定。未満なら「確認」の質問で決めます。',
  character_confirm: '「はい」の確率がこの値以上なら確定します。'
}

export const EVENT_THRESHOLD_ROWS: readonly { key: EventThresholdKey; label: string; note?: string }[] = [
  { key: 'eventThreshold', label: 'イベント判定の登録閾値' },
  {
    key: 'choiceThreshold',
    label: '必須項目の選択閾値',
    // 判定は項目別の有効値（保存値、無ければこの値から決めた既定値）で行う。
    note: '項目別の閾値を保存済みの場合、各項目は項目別の値が優先されます。ここは項目別の閾値が未保存のときの既定値に使われます。'
  },
  { key: 'ignoreThreshold', label: '対象外判定の閾値' }
]

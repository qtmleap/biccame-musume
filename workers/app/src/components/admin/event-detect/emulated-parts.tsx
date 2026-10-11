import type { EmulatedEventRow, EmulatedVerify } from '@biccame/shared/event-detect/viewer'
import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { GOLD_TONE, TONE } from './constants'

// LLM イベントの一覧と詳細で共通の、状態・Clef の再確認・D1 の件数の表示。

/** LLM イベントの状態の表示名。ongoing は配布中（ラベル編集などの継続中とは別の画面なので、ここで持つ） */
export const EMULATED_STATUS_LABELS: Record<EmulatedEventRow['status'], string> = {
  announce: '告知',
  start: '開始',
  ongoing: '配布中',
  end: '終了'
}

export const EmulatedStatusBadge = ({ status }: { status: EmulatedEventRow['status'] }) => (
  <Badge variant='outline' className={cn('rounded-md font-medium', GOLD_TONE[status])}>
    {EMULATED_STATUS_LABELS[status]}
  </Badge>
)

const percentOf = (probability: number) => `${Math.round(probability * 100)}%`

/**
 * Clef による再確認の結果。合流させた / new と答えた / 既存のイベントを選んだがしきい値に届かず見送った。
 * 見送りは合流候補だった印なので、目立つ色（warning）にする。
 */
export const EmulatedVerifyBadge = ({ verify }: { verify: EmulatedVerify }) => {
  const percent = percentOf(verify.probability)
  const [label, tone] = verify.merged
    ? [`Clef 合流 ${percent}`, TONE.success]
    : verify.choice === 'new'
      ? [`Clef 新規 ${percent}`, TONE.info]
      : [`Clef 見送り ${percent}`, TONE.warning]
  return (
    <Badge variant='outline' className={cn('rounded-md font-medium font-numeric tabular-nums', tone)}>
      {label}
    </Badge>
  )
}

/** 開始が分からないイベントの印 */
export const StartUnknownBadge = () => (
  <Badge variant='outline' className={cn('rounded-md font-medium', TONE.muted)}>
    開始不明
  </Badge>
)

/**
 * 対応する D1 イベントの件数。0 件は「なし」、1 件以上は件数のバッジで、押すと 1 つ目の D1 イベントの詳細へ飛ぶ
 * （全件のタイトルはツールチップ。すべてのリンクは LLM イベントの詳細にある）。
 */
export const D1CountBadge = ({ d1 }: { d1: EmulatedEventRow['d1'] }) => {
  const [first] = d1
  if (first === undefined) return <span className='text-muted-foreground'>なし</span>
  return (
    <Badge asChild variant='outline' className={cn('rounded-md font-medium font-numeric tabular-nums', TONE.success)}>
      <Link
        to='/admin/event-detect/events/$uuid'
        params={{ uuid: first.eventId }}
        title={d1.map((entry) => entry.title).join('\n')}
      >
        {d1.length}
      </Link>
    </Badge>
  )
}

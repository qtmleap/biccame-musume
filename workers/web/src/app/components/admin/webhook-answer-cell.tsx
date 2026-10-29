import type { AnswerRow } from '@biccame/shared/event-detect/answer-view'
import { Fragment, type ReactNode } from 'react'
import { TONE } from '@/components/admin/event-detect/constants'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 等幅は数値の span にだけ付ける。行の flex は items-baseline で基線を揃え、日本語と等幅の数値の基線ずれを避ける。
// 行高はセル側（leading-5）で固定し、子の span は継承する。
const MONO = 'font-mono tabular-nums'
const CELL = 'min-w-0 space-y-1 border-b border-separator px-3 py-3 text-sm leading-5'
const LINE = 'flex items-baseline justify-between gap-3'

const Mono = ({ children }: { children: ReactNode }) => <span className={MONO}>{children}</span>

type NotePart = { key: string; node: ReactNode }

// 補足の3行目は「しきい値 · 次点 · 理由」を中黒で区切って1行（折り返しあり）に並べる。
const NoteLine = ({ parts }: { parts: NotePart[] }) => (
  <p data-field='note' className='text-xs leading-4 text-muted-foreground break-words'>
    {parts.map((part, index) => (
      <Fragment key={part.key}>
        {index > 0 && ' · '}
        {part.node}
      </Fragment>
    ))}
  </p>
)

/**
 * 回答1つぶんのセル。1行目にラベルとステータス、2行目に回答と確率、3行目に小さくしきい値・次点を出す。
 * thresholdKnown が false（現在のしきい値を取得できていない間）は、しきい値とステータスを「—」にして未確定の強調も付けない。
 * 判定を確認の行が担う行（confirmed が null）は、ステータスを「—」にし、しきい値だけ出す。
 */
export const AnswerCell = ({
  row,
  label,
  thresholdKnown
}: {
  row: AnswerRow
  label: string
  thresholdKnown: boolean
}) => {
  const { threshold, confirmed, alternatives } = row
  const decided = thresholdKnown && threshold !== null && confirmed !== null
  const thresholdPart: NotePart[] = !thresholdKnown
    ? [{ key: 'threshold', node: 'しきい値 —' }]
    : threshold === null
      ? []
      : [
          {
            key: 'threshold',
            node: (
              <>
                しきい値 <Mono>{detectionScoreLabel(threshold)}</Mono>
              </>
            )
          }
        ]
  const alternativePart: NotePart[] =
    alternatives.length === 0
      ? []
      : [
          {
            key: 'alternatives',
            node: (
              <>
                次点{' '}
                {alternatives.map((alternative, index) => (
                  <Fragment key={alternative.answer}>
                    {index > 0 && ' / '}
                    {alternative.answer} <Mono>{detectionScoreLabel(alternative.probability)}</Mono>
                  </Fragment>
                ))}
              </>
            )
          }
        ]
  const parts = [...thresholdPart, ...alternativePart]
  return (
    <li data-key={row.key} className={cn(CELL, decided && !confirmed && 'bg-warning/10')}>
      <div className={LINE}>
        <span data-field='label' className='min-w-0 break-words font-medium'>
          {label}
        </span>
        <span data-field='status' className={cn('shrink-0', !decided && 'text-muted-foreground')}>
          {decided ? (
            <Badge variant='outline' className={confirmed ? TONE.success : TONE.warning}>
              {confirmed ? '確定' : '未確定'}
            </Badge>
          ) : (
            '—'
          )}
        </span>
      </div>
      <div className={LINE}>
        <span data-field='answer' className='min-w-0 break-words'>
          {row.answer}
        </span>
        <span data-field='probability' className={cn(MONO, 'shrink-0 text-right')}>
          {detectionScoreLabel(row.probability)}
        </span>
      </div>
      {parts.length > 0 && <NoteLine parts={parts} />}
    </li>
  )
}

/**
 * 回答に店舗・ビッカメ娘の質問が無い保存データの代わりに、判定結果を「ラベル → 回答」の1セルで出す。
 * 他の選択式の回答（配布物 → アクキー）と同じく、回答に名前を「、」で並べる。空なら「未判定」。
 * 確率・しきい値・ステータスは回答が無いため「—」。未確定の強調（bg-warning/10）は付けない。
 */
export const AssociationCell = ({ label, names }: { label: string; names: readonly string[] }) => (
  <li className={CELL}>
    <div className={LINE}>
      <span data-field='label' className='min-w-0 break-words font-medium'>
        {label}
      </span>
      <span data-field='status' className='shrink-0 text-muted-foreground'>
        —
      </span>
    </div>
    <div className={LINE}>
      <span data-field='answer' className='min-w-0 break-words'>
        {names.length === 0 ? '未判定' : names.join('、')}
      </span>
      <span data-field='probability' className={cn(MONO, 'shrink-0 text-right text-muted-foreground')}>
        —
      </span>
    </div>
    <NoteLine parts={[{ key: 'threshold', node: 'しきい値 —' }]} />
  </li>
)

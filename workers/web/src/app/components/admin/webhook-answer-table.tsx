import { describeAnswers } from '@biccame/shared/event-detect/answer-view'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS, type DetectionThresholds } from '@biccame/shared/event-detect/detection'
import { TONE } from '@/components/admin/event-detect/constants'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const NUMERIC = 'text-right font-mono tabular-nums'

/**
 * Clef が質問ごとに返した回答と確率を表で見せる。
 * しきい値が取れない間（読み込み中・エラー）は、しきい値と判定の列を '—' にする。
 */
export const WebhookAnswerTable = ({
  answers,
  thresholds
}: {
  answers: Record<string, ClefAnswer>
  thresholds?: DetectionThresholds
}) => {
  // しきい値が無い時の行のしきい値・確定は使わない（列を '—' にする）ため、既定値で表だけ組み立てる。
  const rows = describeAnswers(answers, thresholds === undefined ? DEFAULT_DETECTION_THRESHOLDS : thresholds)
  if (rows.length === 0) return <p className='text-sm text-muted-foreground'>回答の記録なし</p>
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
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className={cn(thresholds !== undefined && !row.confirmed && 'bg-warning/10')}>
                <TableCell className='font-medium'>{row.label}</TableCell>
                <TableCell>{row.answer}</TableCell>
                <TableCell className={NUMERIC}>{detectionScoreLabel(row.probability)}</TableCell>
                <TableCell className={cn(NUMERIC, thresholds === undefined && 'text-muted-foreground')}>
                  {thresholds === undefined ? '—' : detectionScoreLabel(row.threshold)}
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
                    <div className='flex items-center gap-4'>
                      {row.alternatives.map((alternative) => (
                        <span key={alternative.answer} className='font-mono tabular-nums'>
                          <span className='font-sans'>{alternative.answer}</span>{' '}
                          {detectionScoreLabel(alternative.probability)}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className='mt-3 text-sm text-muted-foreground'>
        しきい値は現在の設定です。判定した時点の設定と異なる場合があります。
      </p>
    </>
  )
}

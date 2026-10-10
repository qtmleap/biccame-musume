import type { LabelRequest, PostView } from '@biccame/shared/event-detect/viewer'
import { isAxiosError } from 'axios'
import { useSetEventDetectLabel } from '@/hooks/use-event-detect'
import { TYPE_LABELS } from './constants'
import { SegmentButton } from './segment-button'

const VERDICTS: { value: LabelRequest['verdict']; label: string; tone: 'success' | 'destructive' | 'warning' }[] = [
  { value: 'event', label: 'イベント', tone: 'success' },
  { value: 'not_event', label: '違う', tone: 'destructive' },
  { value: 'unsure', label: '保留', tone: 'warning' }
]

const TYPES = ['announce', 'start', 'ongoing', 'end'] as const

const errorMessage = (error: unknown): string => {
  if (isAxiosError(error)) return error.message
  return error instanceof Error ? error.message : String(error)
}

/**
 * 投稿の手動ラベル。7 つのボタンは常に同じ場所に出し、押しても行は消えたり動いたりしない。
 * 同じ判定をもう一度押すとラベルを外す。種別を押すと「イベント」として保存し、同じ種別をもう一度押すと種別だけ外す。
 */
export const LabelEditor = ({ post }: { post: PostView }) => {
  const mutation = useSetEventDetectLabel()
  const current = post.label
  const save = (label: LabelRequest | undefined) => mutation.mutate({ id: post.id, label })

  return (
    <fieldset className='min-w-0 space-y-1.5'>
      <legend className='sr-only'>手動ラベル</legend>
      <div className='grid grid-cols-3 gap-1.5'>
        {VERDICTS.map((verdict) => (
          <SegmentButton
            key={verdict.value}
            tone={verdict.tone}
            pressed={current?.verdict === verdict.value}
            onClick={() =>
              current?.verdict === verdict.value
                ? save(undefined)
                : save({
                    verdict: verdict.value,
                    ...(verdict.value === 'event' && current?.type ? { type: current.type } : {})
                  })
            }
          >
            {verdict.label}
          </SegmentButton>
        ))}
      </div>
      <div className='grid grid-cols-4 gap-1.5'>
        {TYPES.map((type) => {
          const pressed = current?.verdict === 'event' && current.type === type
          return (
            <SegmentButton
              key={type}
              pressed={pressed}
              onClick={() => save({ verdict: 'event', ...(pressed ? {} : { type }) })}
            >
              {TYPE_LABELS[type]}
            </SegmentButton>
          )
        })}
      </div>
      {/* 保存状態の行は常に確保して、表示の有無で下の要素がずれないようにする */}
      <p role='status' className='h-4 text-xs leading-4 text-muted-foreground'>
        {mutation.isPending ? '保存中…' : null}
        {mutation.isError ? <span className='text-destructive'>{errorMessage(mutation.error)}</span> : null}
      </p>
    </fieldset>
  )
}

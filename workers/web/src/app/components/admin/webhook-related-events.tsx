import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { Link } from '@tanstack/react-router'

const TITLE = '元告知に対応する登録済みイベント'

/** 元告知への返信・引用から見つかった登録済みイベント。検出の記録の有無とは無関係で、参照先が無ければ何も描画しない。 */
export const WebhookRelatedEvents = ({ job }: { job: WebhookJob }) => {
  const related = job.relatedEvents
  if (related === undefined || related === null || related.events.length === 0) return null
  return (
    <section aria-label={TITLE}>
      <h2 className='mb-2 text-lg font-semibold md:text-xl'>{TITLE}</h2>
      <p className='mb-3 text-sm text-muted-foreground'>
        参照投稿の一致だけで提案しています。イベント本体は自動更新しません。
      </p>
      <ul className='space-y-2'>
        {related.events.map((event) => (
          <li key={event.eventId} className='flex items-center gap-2'>
            <Link
              to='/admin/events/$uuid/edit'
              params={{ uuid: event.eventId }}
              className='text-brand underline underline-offset-4'
            >
              {event.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

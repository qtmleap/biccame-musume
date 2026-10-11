import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { categoryName, storeName } from '@/components/admin/event-detect/constants'
import {
  EmulatedStatusBadge,
  EmulatedVerifyBadge,
  StartUnknownBadge
} from '@/components/admin/event-detect/emulated-parts'
import { formatDate, formatDay, formatNumber } from '@/components/admin/event-detect/format'
import { PostList } from '@/components/admin/event-detect/post-item'
import { EmptyState, SectionHeading } from '@/components/admin/event-detect/section'
import { Button } from '@/components/ui/button'
import { useEventDetectEmulatedEvent } from '@/hooks/use-event-detect'

/** ラベルと値を横に並べる定義リスト */
const Facts = ({ items }: { items: { term: string; description: ReactNode }[] }) => (
  <dl className='grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm'>
    {items.map((item) => (
      <div key={item.term} className='contents'>
        <dt className='text-muted-foreground'>{item.term}</dt>
        <dd className='min-w-0 break-words text-foreground'>{item.description}</dd>
      </div>
    ))}
  </dl>
)

const BackLink = () => (
  <Button
    variant='ghost'
    size='sm'
    className='-ml-2 mb-2 border border-transparent text-muted-foreground hover:text-foreground'
    asChild
  >
    <Link to='/admin/event-detect/emulated'>
      <ArrowLeft className='mr-1 size-4' />
      LLM イベント一覧へ
    </Link>
  </Button>
)

const EmulatedDetailPage = () => {
  const { id } = Route.useParams()
  const { data } = useEventDetectEmulatedEvent(id)
  if (data === null)
    return (
      <div>
        <BackLink />
        <EmptyState>見つかりません</EmptyState>
      </div>
    )
  const { event, posts } = data
  const entryOf = new Map(posts.map((entry) => [entry.post.id, entry]))

  return (
    <div>
      <BackLink />

      <SectionHeading>{event.item}</SectionHeading>
      <p className='mb-4 text-sm text-muted-foreground'>{storeName(event.store)}</p>
      <Facts
        items={[
          { term: '種別', description: categoryName(event.category) },
          { term: '状態', description: <EmulatedStatusBadge status={event.status} /> },
          {
            term: '開始',
            description: (
              <span className='inline-flex flex-wrap items-center gap-2'>
                <span className='font-numeric tabular-nums'>
                  {event.startUnknown ? '—' : formatDay(event.startDate)}
                </span>
                {event.startUnknown && <StartUnknownBadge />}
              </span>
            )
          },
          {
            term: '終了予定',
            description: <span className='font-numeric tabular-nums'>{formatDay(event.endDate)}</span>
          },
          {
            term: '終了報告',
            description: <span className='font-numeric tabular-nums'>{formatDay(event.endedAt)}</span>
          },
          {
            term: '配布数',
            description: (
              <span className='font-numeric tabular-nums'>
                {event.quantity === undefined ? '—' : formatNumber(event.quantity)}
              </span>
            )
          },
          {
            term: '言及',
            description: <span className='font-numeric tabular-nums'>{formatNumber(event.mentions)}</span>
          },
          {
            term: '最初の言及',
            description: <span className='font-numeric tabular-nums'>{formatDate(event.firstSeen)}</span>
          },
          {
            term: '最後の言及',
            description: <span className='font-numeric tabular-nums'>{formatDate(event.lastSeen)}</span>
          },
          {
            term: 'D1 イベント',
            description:
              event.d1.length === 0 ? (
                <span className='text-muted-foreground'>なし</span>
              ) : (
                <ul className='space-y-1'>
                  {event.d1.map((entry) => (
                    <li key={entry.eventId}>
                      <Link
                        to='/admin/event-detect/events/$uuid'
                        params={{ uuid: entry.eventId }}
                        className='underline underline-offset-2 hover:text-brand'
                      >
                        {entry.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )
          }
        ]}
      />

      <SectionHeading aside={`${formatNumber(posts.length)} 件`}>言及</SectionHeading>
      {posts.length === 0 ? (
        <EmptyState>言及なし</EmptyState>
      ) : (
        <PostList
          posts={posts.map((entry) => entry.post)}
          badgeOf={(post) => {
            const entry = entryOf.get(post.id)
            if (!entry) return undefined
            return (
              <>
                <EmulatedStatusBadge status={entry.status} />
                {entry.verify && <EmulatedVerifyBadge verify={entry.verify} />}
              </>
            )
          }}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/emulated/$id/')({
  component: EmulatedDetailPage
})

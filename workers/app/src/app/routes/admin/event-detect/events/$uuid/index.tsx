import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { categoryName, GOLD_TONE, storeName, TYPE_LABELS } from '@/components/admin/event-detect/constants'
import { formatDate } from '@/components/admin/event-detect/format'
import { PostList } from '@/components/admin/event-detect/post-item'
import { EmptyState, SectionHeading } from '@/components/admin/event-detect/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useEventDetectEvent } from '@/hooks/use-event-detect'

const EventDetailPage = () => {
  const { uuid } = Route.useParams()
  const { data } = useEventDetectEvent(uuid)
  const [onlySignals, setOnlySignals] = useState(true)
  const { event } = data
  const posts = data.posts.filter(
    (post) => !onlySignals || post.gold.length > 0 || post.hits.some((hit) => hit.group === 'item')
  )

  return (
    <div>
      <Button
        variant='ghost'
        size='sm'
        className='-ml-2 mb-2 border border-transparent text-muted-foreground hover:text-foreground'
        asChild
      >
        <Link to='/admin/event-detect/events'>
          <ArrowLeft className='mr-1 size-4' />
          D1 イベント一覧へ
        </Link>
      </Button>

      <SectionHeading>{event.title}</SectionHeading>
      <dl className='grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm'>
        <dt className='text-muted-foreground'>店舗</dt>
        <dd>{event.stores.map(storeName).join(', ')}</dd>
        <dt className='text-muted-foreground'>期間</dt>
        <dd>
          {formatDate(event.startDate)} 〜 {formatDate(event.endDate)}（実終了 {formatDate(event.endedAt)}）
        </dd>
        <dt className='text-muted-foreground'>カテゴリ</dt>
        <dd>{categoryName(event.category)}</dd>
        <dt className='text-muted-foreground'>参考 URL</dt>
        <dd className='min-w-0 space-y-1'>
          {event.referenceUrls.map((reference) => (
            <div key={reference.url} className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className={GOLD_TONE[reference.type]}>
                {TYPE_LABELS[reference.type]}
              </Badge>
              <a
                href={reference.url}
                target='_blank'
                rel='noreferrer'
                className='inline-flex min-w-0 items-center gap-1 break-all underline underline-offset-2 hover:text-brand'
              >
                {reference.url}
                <ExternalLink className='size-3 shrink-0' />
              </a>
              {!reference.archived && <span className='text-xs text-muted-foreground'>（アーカイブ外）</span>}
            </div>
          ))}
        </dd>
        <dt className='text-muted-foreground'>管理画面</dt>
        <dd>
          <Link
            to='/admin/events/$uuid/edit'
            params={{ uuid: event.uuid }}
            className='underline underline-offset-2 hover:text-brand'
          >
            編集
          </Link>
        </dd>
      </dl>

      <SectionHeading aside={`${posts.length} / ${data.posts.length} 件`}>関連する投稿</SectionHeading>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
        <Label htmlFor='event-detect-only-signals' className='cursor-pointer gap-2 font-normal text-foreground'>
          <Checkbox
            id='event-detect-only-signals'
            checked={onlySignals}
            onCheckedChange={(checked) => setOnlySignals(checked === true)}
          />
          正解と景品名を含む投稿だけ
        </Label>
        <span className='text-xs text-muted-foreground'>担当アカウントの、告知 45 日前〜終了 7 日後の通過投稿</span>
      </div>
      {posts.length === 0 ? (
        <EmptyState>条件に合う投稿はありません</EmptyState>
      ) : (
        <PostList posts={posts} currentEventId={event.uuid} />
      )}
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/events/$uuid/')({
  component: EventDetailPage
})

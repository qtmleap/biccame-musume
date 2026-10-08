import type { PostView } from '@biccame/shared/event-detect/viewer'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  EXCLUDE_GROUP_LABELS,
  GOLD_TONE,
  GROUP_LABELS,
  KIND_LABELS,
  REASON_LABELS,
  TONE,
  TYPE_LABELS
} from './constants'
import { formatDateTime } from './format'
import { Highlight } from './highlight'
import { LabelEditor } from './label-editor'

const Tag = ({ tone, className, children }: { tone: string; className?: string; children: React.ReactNode }) => (
  <Badge variant='outline' className={cn('rounded-md font-medium', tone, className)}>
    {children}
  </Badge>
)

/** 投稿の判定結果。通過/除外、強シグナル、正解（除外された正解は警告を足す） */
const Verdict = ({ post }: { post: PostView }) => (
  <div className='flex flex-wrap items-center gap-1.5'>
    {post.reason ? (
      <Tag tone={TONE.muted}>除外: {REASON_LABELS[post.reason]}</Tag>
    ) : (
      <Tag tone={TONE.success}>通過</Tag>
    )}
    {post.strong && <Tag tone={TONE.info}>強</Tag>}
    {post.reason && post.gold.length > 0 && <Tag tone={TONE.destructive}>除外された正解</Tag>}
  </div>
)

const GoldList = ({ post, currentEventId }: { post: PostView; currentEventId?: string }) => (
  <ul className='space-y-1'>
    {post.gold.map((gold) => (
      <li key={`${gold.eventId}-${gold.type}`} className='flex items-start gap-1.5 text-sm'>
        <Tag tone={GOLD_TONE[gold.type]} className='mt-0.5'>
          正解 {TYPE_LABELS[gold.type]}
        </Tag>
        {gold.eventId === currentEventId ? (
          <span className='min-w-0 break-words'>{gold.title}</span>
        ) : (
          <Link
            to='/admin/event-detect/events/$uuid'
            params={{ uuid: gold.eventId }}
            className='min-w-0 break-words underline underline-offset-2 hover:text-brand'
          >
            {gold.title}
          </Link>
        )}
      </li>
    ))}
  </ul>
)

const Words = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
    <span className='shrink-0'>{label}</span>
    {children}
  </div>
)

export const PostItem = ({ post, currentEventId }: { post: PostView; currentEventId?: string }) => {
  const keywords = post.hits.map((hit) => hit.keyword)
  const excludes = post.excludeHits.map((hit) => hit.keyword)
  return (
    <article className='grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6'>
      <div className='min-w-0 space-y-2'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
          <time dateTime={post.createdAt} className='font-numeric tabular-nums'>
            {formatDateTime(post.createdAt)}
          </time>
          <span className='font-medium text-foreground'>@{post.screenName}</span>
          <span>{KIND_LABELS[post.kind]}</span>
          {post.replyTo && <span>→ @{post.replyTo.screenName}</span>}
          {post.cluster.size > 1 && <span>同文 {post.cluster.size} 件</span>}
          <a
            href={post.url}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground'
          >
            X で開く
            <ExternalLink className='size-3' />
          </a>
        </div>
        <p className='text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground'>
          <Highlight text={post.text} keywords={keywords} excludes={excludes} />
        </p>
        {post.quoted && (
          <div className='rounded-md bg-muted p-2 text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground'>
            {post.quoted.screenName ? `@${post.quoted.screenName}: ` : ''}
            {post.quoted.text ? post.quoted.text : '（引用元の本文はアーカイブにありません）'}
          </div>
        )}
        {post.media.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            {post.media.map((url) => (
              <a key={url} href={url} target='_blank' rel='noreferrer'>
                <img
                  src={`${url}?name=small`}
                  alt=''
                  loading='lazy'
                  className='h-24 w-auto rounded-md border border-card-border object-cover'
                />
              </a>
            ))}
          </div>
        )}
      </div>

      <aside className='min-w-0 space-y-3'>
        <Verdict post={post} />
        <LabelEditor post={post} />
        {post.gold.length > 0 && <GoldList post={post} currentEventId={currentEventId} />}
        {post.gold.length === 0 && post.nearbyEvents === 0 && post.reason === undefined && (
          <p className='text-xs text-muted-foreground'>期間内の D1 イベントなし</p>
        )}
        {post.hits.length > 0 && (
          <Words label='ヒット語'>
            {post.hits.map((hit) => (
              <Tag key={`${hit.group}-${hit.keyword}`} tone={TONE.muted} className='px-1.5 py-0 text-xs'>
                {hit.keyword}
                <span className='text-muted-foreground/80'>{GROUP_LABELS[hit.group]}</span>
              </Tag>
            ))}
          </Words>
        )}
        {post.excludeHits.length > 0 && (
          <Words label='除外語'>
            {post.excludeHits.map((hit) => (
              <Tag key={`${hit.group}-${hit.keyword}`} tone={TONE.destructive} className='px-1.5 py-0 text-xs'>
                {hit.keyword}
                <span className='text-muted-foreground'>{EXCLUDE_GROUP_LABELS[hit.group]}</span>
              </Tag>
            ))}
          </Words>
        )}
        {post.rescueHits.length > 0 && (
          <Words label='救済語'>
            {post.rescueHits.map((word) => (
              <Tag key={word} tone={TONE.info} className='px-1.5 py-0 text-xs'>
                {word}
              </Tag>
            ))}
          </Words>
        )}
      </aside>
    </article>
  )
}

/** 投稿の一覧。投稿の間は区切り線だけで分ける */
export const PostList = ({ posts, currentEventId }: { posts: PostView[]; currentEventId?: string }) => (
  <div className='divide-y divide-separator border-y border-separator'>
    {posts.map((post) => (
      <PostItem key={post.id} post={post} currentEventId={currentEventId} />
    ))}
  </div>
)

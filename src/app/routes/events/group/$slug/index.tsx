import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Check, FolderTree, Lock, LogIn, Sparkles } from 'lucide-react'
import { Suspense } from 'react'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/hooks/use-auth'
import { useEventGroupBySlug } from '@/hooks/use-event-groups'
import { useUserActivity } from '@/hooks/use-user-activity'
import { cn } from '@/lib/utils'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { EventGroupItemType } from '@/schemas/event-group.dto'
import type { StoreKey } from '@/schemas/store.dto'

const ITEM_TYPE_LABELS: Record<EventGroupItemType, string> = {
  card: '名刺',
  badge: '缶バッジ',
  other: 'アイテム'
}

const ITEM_TYPE_ICONS: Record<EventGroupItemType, string> = {
  card: '🎴',
  badge: '📛',
  other: '✨'
}

const formatPeriod = (startDate: Date, endDate: Date | undefined): string => {
  const start = dayjs(startDate).format('YYYY/MM/DD')
  if (!endDate) return `${start} 〜 期間未定`
  return `${start} 〜 ${dayjs(endDate).format('YYYY/MM/DD')}`
}

const storeLabel = (key: string): string => {
  return STORE_NAME_LABELS[key as StoreKey] ?? key
}

const eventPrimaryStoreLabel = (event: Event): string => {
  const first = event.stores[0]
  return first ? storeLabel(first) : event.title
}

type EventCheckProps = {
  event: Event
  completed: boolean
  canToggle: boolean
  onToggle: (eventId: string) => void
}

const EventCheckCard = ({ event, completed, canToggle, onToggle }: EventCheckProps) => {
  const isUpcoming = event.status === 'upcoming'
  const disabled = !canToggle || isUpcoming
  const label = eventPrimaryStoreLabel(event)

  return (
    <div className='relative'>
      <button
        type='button'
        onClick={disabled ? undefined : () => onToggle(event.uuid)}
        disabled={disabled}
        aria-pressed={completed}
        className={cn(
          'group relative w-full overflow-hidden rounded-lg border p-4 text-left transition-all',
          completed
            ? 'border-action-award bg-action-award/10 shadow-sm'
            : 'border-border bg-card hover:border-action-award/40 hover:shadow-sm',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold text-foreground line-clamp-2'>{label}</p>
            <p className='mt-1 text-xs text-muted-foreground line-clamp-2'>{event.title}</p>
            {isUpcoming && (
              <span className='mt-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'>
                <Lock className='size-3' />
                開催前
              </span>
            )}
          </div>
          <div
            aria-hidden='true'
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all',
              completed
                ? 'border-action-award bg-action-award text-white'
                : 'border-border bg-background text-transparent group-hover:border-action-award/60'
            )}
          >
            <Check className='size-4' />
          </div>
        </div>
      </button>
      <Link
        to='/events/$uuid'
        params={{ uuid: event.uuid }}
        className='mt-1 inline-block text-xs text-muted-foreground hover:text-foreground'
      >
        詳細を見る →
      </Link>
    </div>
  )
}

const GroupContent = () => {
  const { slug } = Route.useParams()
  const router = useRouter()
  const { data: group } = useEventGroupBySlug(slug)
  const { user } = useAuth()
  const { completedEvents, addCompletedEvent, removeCompletedEvent } = useUserActivity()

  const isLoggedIn = !!user
  const completedSet = new Set(completedEvents)
  const collectableEvents = group.events
  const completedCount = collectableEvents.filter((e) => completedSet.has(e.uuid)).length
  const totalCount = collectableEvents.length
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  const handleToggle = (eventId: string) => {
    if (!isLoggedIn) return
    if (completedSet.has(eventId)) {
      removeCompletedEvent(eventId)
    } else {
      addCompletedEvent(eventId)
    }
  }

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto max-w-4xl px-4 py-4 md:px-8 md:py-6'>
        <AppBreadcrumb
          items={[{ label: 'ホーム', to: '/' }, { label: 'イベント', to: '/events' }, { label: group.title }]}
        />

        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground -ml-2 mb-4 border border-transparent'
          onClick={() => router.history.back()}
        >
          <ArrowLeft className='h-4 w-4 mr-1' />
          戻る
        </Button>

        {/* ヘッダーカード */}
        <div className='rounded-xl border border-border bg-card p-5 shadow-sm md:p-6'>
          <div className='flex items-start gap-3'>
            <div
              aria-hidden='true'
              className='flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-2xl'
            >
              {ITEM_TYPE_ICONS[group.itemType]}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='secondary'>{ITEM_TYPE_LABELS[group.itemType]}コンプリート</Badge>
                <span className='text-xs text-muted-foreground'>{formatPeriod(group.startDate, group.endDate)}</span>
              </div>
              <h1 className='mt-2 text-2xl font-bold text-foreground'>{group.title}</h1>
              {group.description && (
                <p className='mt-2 whitespace-pre-line text-sm text-foreground/80'>{group.description}</p>
              )}
            </div>
          </div>

          {/* プログレス */}
          <div className='mt-5'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-sm font-medium text-foreground'>
                <Sparkles className='size-4 text-action-award' />
                コンプリート状況
              </div>
              <span className='text-sm font-semibold tabular-nums text-foreground'>
                {completedCount} / {totalCount}
              </span>
            </div>
            <Progress value={completionRate} className='mt-2 h-3' />
            <p className='mt-1 text-right text-xs text-muted-foreground tabular-nums'>{completionRate}%</p>
          </div>
        </div>

        {/* ログイン誘導 */}
        {!isLoggedIn && (
          <div className='mt-4 flex flex-col items-start gap-3 rounded-lg border border-dashed border-action-interest/40 bg-action-interest/5 p-4 md:flex-row md:items-center md:justify-between'>
            <div className='flex items-start gap-2'>
              <LogIn className='mt-0.5 size-4 shrink-0 text-action-interest' />
              <p className='text-sm text-foreground'>
                ログインするとコンプ状況を保存できます。集めた{ITEM_TYPE_LABELS[group.itemType]}
                にチェックしていきましょう。
              </p>
            </div>
            <Button asChild size='sm' variant='outline' className='self-stretch md:self-auto'>
              <Link to='/me'>ログインする</Link>
            </Button>
          </div>
        )}

        {/* イベント一覧 */}
        <div className='mt-6'>
          {collectableEvents.length === 0 ? (
            <div className='rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground'>
              <FolderTree className='mx-auto mb-2 size-8' />
              <p className='text-sm'>このグループにはまだイベントが登録されていません。</p>
            </div>
          ) : (
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {collectableEvents.map((event) => (
                <EventCheckCard
                  key={event.uuid}
                  event={event}
                  completed={completedSet.has(event.uuid)}
                  canToggle={isLoggedIn}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const GroupPage = () => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <GroupContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/events/group/$slug/')({
  component: GroupPage
})

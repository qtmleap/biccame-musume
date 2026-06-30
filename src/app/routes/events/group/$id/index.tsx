import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Check, FolderTree, LogIn, Sparkles } from 'lucide-react'
import { Suspense } from 'react'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/hooks/use-auth'
import { useEventGroup } from '@/hooks/use-event-groups'
import { useUserActivity } from '@/hooks/use-user-activity'
import { cn } from '@/lib/utils'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import { STATUS_BADGE_SM } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

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
}

const EventCheckCard = ({ event, completed }: EventCheckProps) => {
  const label = eventPrimaryStoreLabel(event)

  return (
    <Link
      to='/events/$uuid'
      params={{ uuid: event.uuid }}
      aria-label={`${label}（${event.title}）の詳細を見る`}
      className={cn(
        'group relative block w-full overflow-hidden rounded-lg border p-4 text-left transition-all',
        completed
          ? 'border-action-award bg-action-award/10 shadow-sm'
          : 'border-border bg-card hover:border-action-award/40 hover:shadow-sm'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-base font-semibold text-foreground line-clamp-2'>{label}</p>
          <p className='mt-1 text-xs text-muted-foreground line-clamp-2'>{event.title}</p>
          <div className='mt-2'>{STATUS_BADGE_SM[event.status]()}</div>
        </div>
        <div
          aria-hidden='true'
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full border-2',
            completed
              ? 'border-action-award bg-action-award text-white'
              : 'border-border bg-background text-transparent'
          )}
        >
          <Check className='size-4' />
        </div>
      </div>
    </Link>
  )
}

const GroupContent = () => {
  const { id } = Route.useParams()
  const router = useRouter()
  const { data: group } = useEventGroup(id)
  const { user } = useAuth()
  const { completedEvents } = useUserActivity()

  const isLoggedIn = !!user
  const completedSet = new Set(completedEvents)
  const collectableEvents = group.events
  const completedCount = collectableEvents.filter((e) => completedSet.has(e.uuid)).length
  const totalCount = collectableEvents.length
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6'>
        <AppBreadcrumb
          items={[
            { label: 'ホーム', to: '/' },
            { label: 'イベントグループ', to: '/events/groups' },
            { label: group.title }
          ]}
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

        {/* ヘッダー + プログレス。md+ は横並び、モバイルは縦積み。 */}
        <div className='md:flex md:items-start md:gap-6'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-3'>
              <div className='shrink-0 p-2 rounded-lg bg-action-award/15 text-action-award'>
                <Sparkles className='size-4' />
              </div>
              <div className='min-w-0 flex-1'>
                <h1 className='text-2xl font-semibold text-foreground'>{group.title}</h1>
                <p className='mt-1 text-xs text-muted-foreground'>{formatPeriod(group.startDate, group.endDate)}</p>
              </div>
            </div>
            {group.description && (
              <p className='mt-3 whitespace-pre-line text-sm text-foreground/80'>{group.description}</p>
            )}
          </div>

          {/* プログレス */}
          <div className='mt-5 md:mt-0 md:w-72 md:shrink-0'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-sm font-medium text-foreground'>
                <Sparkles className='size-4 text-action-award' />
                コンプリート状況
              </div>
              <span className='text-sm font-semibold tabular-nums text-foreground'>
                {completedCount} / {totalCount}
              </span>
            </div>
            <Progress
              value={completionRate}
              className='mt-2 h-3 bg-action-award/20 [&>[data-slot=progress-indicator]]:bg-action-award'
            />
            <p className='mt-1 text-right text-xs text-muted-foreground tabular-nums'>{completionRate}%</p>
          </div>
        </div>

        {/* ログイン誘導 */}
        {!isLoggedIn && (
          <div className='mt-4 flex flex-col items-start gap-3 rounded-lg border border-dashed border-action-interest/40 bg-action-interest/5 p-4 md:flex-row md:items-center md:justify-between'>
            <div className='flex items-start gap-2'>
              <LogIn className='mt-0.5 size-4 shrink-0 text-action-interest' />
              <p className='text-sm text-foreground'>
                ログインするとコンプ状況を保存できます。集めたイベントにチェックしていきましょう。
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
                <EventCheckCard key={event.uuid} event={event} completed={completedSet.has(event.uuid)} />
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

export const Route = createFileRoute('/events/group/$id/')({
  component: GroupPage
})

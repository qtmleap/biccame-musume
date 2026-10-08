import { CatchBoundary, createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { isAxiosError } from 'axios'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { z } from 'zod'
import { EventDetectNav } from '@/components/admin/event-detect/nav'
import { EmptyState } from '@/components/admin/event-detect/section'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const ServerErrorSchema = z.object({ error: z.string().nonempty() })

/** サーバーが返した理由（データ未準備など）があればそれを、なければ例外のメッセージを出す */
const describe = (error: unknown): string => {
  if (isAxiosError(error)) {
    const body = ServerErrorSchema.safeParse(error.response?.data)
    return body.success ? body.data.error : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

const ViewerError = ({ error }: { error: Error }) => (
  <div className='flex items-start gap-3 rounded-lg border border-destructive/40 p-4'>
    <AlertCircle className='mt-0.5 size-5 shrink-0 text-destructive' />
    <div className='min-w-0'>
      <p className='font-medium text-foreground'>読み込めませんでした</p>
      <p className='mt-1 text-sm break-words text-muted-foreground'>{describe(error)}</p>
    </div>
  </div>
)

const ViewerSkeleton = () => (
  <div className='space-y-3' aria-busy='true'>
    <Skeleton className='h-8 w-48' />
    <Skeleton className='h-40 w-full' />
    <Skeleton className='h-40 w-full' />
  </div>
)

/**
 * イベント自動検出のビューワ。X の告知から検出したイベントと登録済みイベントを突き合わせて目視で確かめる。
 * データは .cache/event-detect の手元ファイルで、API は dev サーバーのミドルウェアが配信する
 * （scripts/lib/event-detect/vite-plugin.ts）。本番には無い。
 */
const EventDetectLayout = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <div className='min-h-screen bg-page-bg text-foreground'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
            asChild
          >
            <Link to='/admin'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              管理画面に戻る
            </Link>
          </Button>
        </div>

        <div className='mb-4 md:mb-6'>
          <h1 className='text-2xl font-bold text-foreground'>イベント自動検出</h1>
          <p className='mt-2 text-sm text-muted-foreground md:text-base'>
            X の告知から検出したイベントと、登録済みイベントの突き合わせ（ローカルのみ）。
          </p>
        </div>

        <EventDetectNav />
        <Separator className='my-4 bg-separator' />

        {import.meta.env.DEV ? (
          <CatchBoundary getResetKey={() => pathname} errorComponent={ViewerError}>
            <Suspense fallback={<ViewerSkeleton />}>
              <Outlet />
            </Suspense>
          </CatchBoundary>
        ) : (
          <EmptyState>この画面は開発サーバー（bun dev）でだけ使えます。</EmptyState>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect')({
  component: EventDetectLayout
})

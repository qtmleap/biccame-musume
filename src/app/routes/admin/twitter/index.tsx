import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAdminTwitterStatus } from '@/hooks/use-admin-twitter-status'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'

const formatXDate = (createdAt: string): string => {
  if (!createdAt) return ''
  const parsed = dayjs(createdAt, 'ddd MMM DD HH:mm:ss ZZ YYYY')
  return parsed.isValid() ? parsed.format('YYYY/MM/DD') : createdAt
}

const StatItem = ({ label, value }: { label: string; value: string }) => (
  <div className='flex flex-col gap-1'>
    <div className='text-xs text-muted-foreground'>{label}</div>
    <div className='text-lg font-semibold tabular-nums text-foreground font-numeric'>{value}</div>
  </div>
)

const StatusBanner = ({ ok, fetchedAt }: { ok: boolean; fetchedAt: string }) => (
  <div
    className={cn(
      'rounded-2xl border p-4 md:p-5 flex items-center gap-3',
      ok ? 'border-status-ongoing/40 bg-status-ongoing/10' : 'border-destructive/40 bg-destructive/10'
    )}
  >
    {ok ? (
      <CheckCircle2 className='size-6 shrink-0 text-status-ongoing-foreground' />
    ) : (
      <XCircle className='size-6 shrink-0 text-destructive' />
    )}
    <div className='flex-1 min-w-0'>
      <div className='text-base font-semibold text-foreground'>
        {ok ? 'アカウント情報の取得に成功しました' : 'アカウント情報の取得に失敗しました'}
      </div>
      <div className='text-xs text-muted-foreground mt-0.5'>
        最終確認: {dayjs(fetchedAt).format('YYYY/MM/DD HH:mm:ss')}
      </div>
    </div>
  </div>
)

const TwitterStatusContent = () => {
  const queryClient = useQueryClient()
  const { data } = useAdminTwitterStatus()
  const [isRefetching, setIsRefetching] = useState(false)

  const refetch = async () => {
    setIsRefetching(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'twitter', 'status'] })
    } finally {
      setIsRefetching(false)
    }
  }

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-3xl'>
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

        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-4 md:mb-6 flex items-start justify-between gap-3'
        >
          <div>
            <h1 className='font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight'>Twitter 連携</h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              投稿用 X アカウントの認証状態と公開プロフィールを確認します。
            </p>
          </div>
          <Button variant='outline' size='sm' onClick={refetch} disabled={isRefetching}>
            <RefreshCw className={cn('size-4 mr-1', isRefetching && 'animate-spin')} />
            再取得
          </Button>
        </motion.header>

        <div className='space-y-4'>
          <StatusBanner ok={data.ok} fetchedAt={data.fetchedAt} />

          {data.ok && data.account ? (
            <div className='rounded-2xl border border-card-border bg-card p-4 md:p-6'>
              <div className='flex items-start gap-4'>
                <Avatar className='size-16 shrink-0'>
                  <AvatarImage src={data.account.profileImageUrl} alt={data.account.name} />
                  <AvatarFallback className='text-base bg-brand/10 text-brand'>
                    {data.account.name.charAt(0) || data.account.screenName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className='flex-1 min-w-0'>
                  <h2 className='font-semibold text-lg text-foreground line-clamp-1'>{data.account.name}</h2>
                  <a
                    href={`https://x.com/${data.account.screenName}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-sm text-muted-foreground hover:text-foreground'
                  >
                    @{data.account.screenName}
                  </a>
                  {data.account.description && (
                    <p className='mt-2 text-sm text-foreground whitespace-pre-wrap break-words'>
                      {data.account.description}
                    </p>
                  )}
                </div>
              </div>

              <div className='mt-5 grid grid-cols-3 gap-4'>
                <StatItem label='ツイート' value={data.account.statusesCount.toLocaleString()} />
                <StatItem label='フォロワー' value={data.account.followersCount.toLocaleString()} />
                <StatItem label='フォロー' value={data.account.friendsCount.toLocaleString()} />
              </div>

              <div className='mt-5 grid grid-cols-2 gap-4 pt-4 border-t border-separator'>
                <StatItem label='アカウントID' value={data.account.restId} />
                <StatItem label='アカウント作成日' value={formatXDate(data.account.createdAt)} />
              </div>
            </div>
          ) : (
            <div className='rounded-2xl border border-destructive/30 bg-card p-4 md:p-6'>
              <h2 className='font-semibold text-base text-foreground'>エラー詳細</h2>
              <pre className='mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words bg-muted rounded-lg p-3'>
                {data.error ?? '不明なエラー'}
              </pre>
              <ul className='mt-4 text-sm text-muted-foreground list-disc pl-5 space-y-1'>
                <li>TWITTER_AUTH_TOKEN / TWITTER_CSRF_TOKEN の cookie が失効していないか確認</li>
                <li>X_BEARER または USER_BY_SCREEN_NAME_QUERY_ID がローテートしていないか確認</li>
                <li>X 内部 API のレスポンス形状が変わっていないか確認</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TwitterStatusPage = () => (
  <Suspense fallback={<LoadingFallback />}>
    <TwitterStatusContent />
  </Suspense>
)

export const Route = createFileRoute('/admin/twitter/')({
  component: TwitterStatusPage
})

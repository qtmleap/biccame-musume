import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowUpRight, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAdminTwitterStatus } from '@/hooks/use-admin-twitter-status'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'

const formatXDate = (createdAt: string): string => {
  const parsed = dayjs(createdAt, 'ddd MMM DD HH:mm:ss ZZ YYYY')
  return parsed.isValid() ? parsed.format('YYYY/MM/DD') : createdAt
}

const StatBlock = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div
    className={cn(
      'rounded-xl border px-3 py-2.5 md:px-4 md:py-3',
      accent ? 'border-status-ongoing/30 bg-status-ongoing/10' : 'border-card-border bg-page-bg'
    )}
  >
    <div className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</div>
    <div className='mt-1 text-xl md:text-2xl font-bold tabular-nums font-numeric text-foreground'>{value}</div>
  </div>
)

const InfoRow = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className='flex items-center justify-between gap-3 py-2'>
    <span className='text-xs text-muted-foreground shrink-0'>{label}</span>
    <span className={cn('text-sm text-foreground text-right truncate', mono && 'font-mono tabular-nums')}>{value}</span>
  </div>
)

const StatusBadge = ({ ok, fetchedAt }: { ok: boolean; fetchedAt: string }) => (
  <div
    className={cn(
      'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
      ok
        ? 'border-status-ongoing/40 bg-status-ongoing/15 text-status-ongoing-foreground'
        : 'border-destructive/40 bg-destructive/15 text-destructive'
    )}
  >
    {ok ? <CheckCircle2 className='size-3.5' /> : <XCircle className='size-3.5' />}
    {ok ? '取得成功' : '取得失敗'}
    <span className='text-muted-foreground tabular-nums'>· {dayjs(fetchedAt).format('HH:mm:ss')}</span>
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
          className='mb-4 md:mb-6 flex items-end justify-between gap-3'
        >
          <div>
            <h1 className='font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight'>Twitter 連携</h1>
            <p className='mt-1 text-sm text-muted-foreground'>投稿用 X アカウントの認証状態と公開プロフィール。</p>
          </div>
          <Button variant='outline' size='sm' onClick={refetch} disabled={isRefetching} className='shrink-0'>
            <RefreshCw className={cn('size-4 mr-1', isRefetching && 'animate-spin')} />
            再取得
          </Button>
        </motion.header>

        {data.ok && data.account ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal }}
            className='overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm'
          >
            <div className='relative h-32 md:h-44 bg-gradient-to-br from-status-ongoing/20 via-brand/15 to-status-ongoing/10'>
              {data.account.profileBannerUrl && (
                <img src={data.account.profileBannerUrl} alt='' className='size-full object-cover' loading='lazy' />
              )}
              <div className='absolute top-3 right-3'>
                <StatusBadge ok={data.ok} fetchedAt={data.fetchedAt} />
              </div>
            </div>

            <div className='px-4 md:px-6 pb-5 md:pb-6'>
              <div className='-mt-12 md:-mt-14 flex items-end justify-between gap-3'>
                <Avatar className='size-24 md:size-28 shrink-0 ring-4 ring-card'>
                  <AvatarImage src={data.account.profileImageUrl} alt={data.account.name} />
                  <AvatarFallback className='text-2xl bg-brand/10 text-brand'>
                    {data.account.name.charAt(0) || data.account.screenName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <Button variant='outline' size='sm' asChild className='mb-1 shrink-0'>
                  <a href={`https://x.com/${data.account.screenName}`} target='_blank' rel='noopener noreferrer'>
                    プロフィールを開く
                    <ArrowUpRight className='size-4 ml-1' />
                  </a>
                </Button>
              </div>

              <div className='mt-3'>
                <h2 className='font-bold text-xl md:text-2xl text-foreground line-clamp-1'>{data.account.name}</h2>
                <div className='text-sm text-muted-foreground'>@{data.account.screenName}</div>
              </div>

              {data.account.description && (
                <p className='mt-3 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed'>
                  {data.account.description}
                </p>
              )}

              <div className='mt-5 grid grid-cols-3 gap-2 md:gap-3'>
                <StatBlock accent label='ツイート' value={data.account.statusesCount.toLocaleString()} />
                <StatBlock label='フォロワー' value={data.account.followersCount.toLocaleString()} />
                <StatBlock label='フォロー' value={data.account.friendsCount.toLocaleString()} />
                <StatBlock label='いいね' value={data.account.favouritesCount.toLocaleString()} />
                <StatBlock label='メディア' value={data.account.mediaCount.toLocaleString()} />
                <StatBlock label='リスト掲載' value={data.account.listedCount.toLocaleString()} />
              </div>

              <div className='mt-5 pt-4 border-t border-separator divide-y divide-separator'>
                <InfoRow label='アカウントID' value={data.account.restId} mono />
                <InfoRow label='作成日' value={formatXDate(data.account.createdAt)} />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal }}
            className='rounded-3xl border border-destructive/30 bg-card overflow-hidden'
          >
            <div className='flex items-center gap-3 px-4 md:px-6 py-4 border-b border-destructive/20 bg-destructive/5'>
              <XCircle className='size-5 text-destructive shrink-0' />
              <div className='flex-1 min-w-0'>
                <div className='font-semibold text-foreground'>アカウント情報の取得に失敗しました</div>
                <div className='text-xs text-muted-foreground mt-0.5'>
                  最終確認: {dayjs(data.fetchedAt).format('YYYY/MM/DD HH:mm:ss')}
                </div>
              </div>
            </div>
            <div className='px-4 md:px-6 py-4 space-y-4'>
              <div>
                <div className='text-xs uppercase tracking-wide text-muted-foreground mb-1.5'>エラー詳細</div>
                <pre className='text-xs text-foreground whitespace-pre-wrap break-words bg-muted rounded-lg p-3'>
                  {data.error ?? '不明なエラー'}
                </pre>
              </div>
              <div>
                <div className='text-xs uppercase tracking-wide text-muted-foreground mb-1.5'>確認ポイント</div>
                <ul className='text-sm text-foreground list-disc pl-5 space-y-1'>
                  <li>TWITTER_AUTH_TOKEN / TWITTER_CSRF_TOKEN の cookie が失効していないか</li>
                  <li>X_BEARER または USER_BY_SCREEN_NAME_QUERY_ID がローテートしていないか</li>
                  <li>X 内部 API のレスポンス形状が変わっていないか</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
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

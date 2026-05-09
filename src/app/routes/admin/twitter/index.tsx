import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Hash,
  Heart,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  UserPlus,
  Users,
  XCircle
} from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAdminTwitterStatus } from '@/hooks/use-admin-twitter-status'
import { DURATION, FADE_IN, FADE_IN_UP, SCALE_IN } from '@/lib/motion'
import { cn } from '@/lib/utils'

const formatXDate = (createdAt: string): string => {
  const parsed = dayjs(createdAt, 'ddd MMM DD HH:mm:ss ZZ YYYY')
  return parsed.isValid() ? parsed.format('YYYY/MM/DD') : createdAt
}

type InfoItemProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}

const InfoItem = ({ icon: Icon, label, children }: InfoItemProps) => (
  <div className='flex items-start gap-3'>
    <Icon className='h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5' />
    <div className='min-w-0 flex-1'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      {children}
    </div>
  </div>
)

const StatusBadge = ({ ok, fetchedAt }: { ok: boolean; fetchedAt: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
      ok
        ? 'border-status-ongoing/40 bg-status-ongoing/15 text-status-ongoing-foreground'
        : 'border-destructive/40 bg-destructive/15 text-destructive'
    )}
  >
    {ok ? <CheckCircle2 className='size-3.5' /> : <XCircle className='size-3.5' />}
    {ok ? '取得成功' : '取得失敗'}
    <span className='text-muted-foreground tabular-nums'>· {dayjs(fetchedAt).format('HH:mm:ss')}</span>
  </span>
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
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-2xl'>
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

        {data.ok && data.account ? (
          <>
            <div className='mb-4 flex items-end justify-between gap-4'>
              <motion.div
                key={`avatar-${data.account.restId}`}
                variants={SCALE_IN}
                initial='initial'
                animate='animate'
                transition={{ duration: DURATION.normal }}
              >
                <Avatar className='h-21.25 w-21.25 border border-card-border'>
                  <AvatarImage src={data.account.profileImageUrl} alt={data.account.name} className='object-cover' />
                  <AvatarFallback className='text-4xl bg-brand/10 text-brand'>
                    {data.account.name[0] || data.account.screenName[0] || '?'}
                  </AvatarFallback>
                </Avatar>
              </motion.div>

              <div className='flex items-center gap-2'>
                <Button variant='outline' size='sm' onClick={refetch} disabled={isRefetching}>
                  <RefreshCw className={cn('size-4 mr-1', isRefetching && 'animate-spin')} />
                  再取得
                </Button>
              </div>
            </div>

            <motion.div
              key={`profile-${data.account.restId}`}
              variants={FADE_IN_UP}
              initial='initial'
              animate='animate'
              transition={{ duration: DURATION.normal, delay: 0.2 }}
              className='mb-6'
            >
              <div className='flex items-center gap-2 flex-wrap'>
                <h1 className='text-2xl font-bold text-foreground'>{data.account.name}</h1>
                <StatusBadge ok={data.ok} fetchedAt={data.fetchedAt} />
              </div>
              <a
                href={`https://x.com/${data.account.screenName}`}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-0.5'
              >
                @{data.account.screenName}
                <ExternalLink className='h-3.5 w-3.5' />
              </a>

              {data.account.description && (
                <p className='text-sm text-muted-foreground mt-3 leading-relaxed whitespace-pre-wrap break-words'>
                  {data.account.description}
                </p>
              )}

              <div className='flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground'>
                <span>{formatXDate(data.account.createdAt)} 開設</span>
                <span className='tabular-nums'>ID: {data.account.restId}</span>
              </div>
            </motion.div>

            <Separator className='my-6 bg-separator' />

            <motion.div
              key={`stats-${data.account.restId}`}
              variants={FADE_IN}
              initial='initial'
              animate='animate'
              transition={{ duration: DURATION.normal, delay: 0.4 }}
              className='space-y-3'
            >
              <h2 className='text-xl font-bold text-foreground'>アクティビティ</h2>
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4'>
                <InfoItem icon={MessageSquare} label='ツイート'>
                  <p className='text-sm text-foreground tabular-nums'>{data.account.statusesCount.toLocaleString()}</p>
                </InfoItem>
                <InfoItem icon={Users} label='フォロワー'>
                  <p className='text-sm text-foreground tabular-nums'>{data.account.followersCount.toLocaleString()}</p>
                </InfoItem>
                <InfoItem icon={UserPlus} label='フォロー'>
                  <p className='text-sm text-foreground tabular-nums'>{data.account.friendsCount.toLocaleString()}</p>
                </InfoItem>
                <InfoItem icon={Heart} label='いいね'>
                  <p className='text-sm text-foreground tabular-nums'>
                    {data.account.favouritesCount.toLocaleString()}
                  </p>
                </InfoItem>
                <InfoItem icon={ImageIcon} label='メディア'>
                  <p className='text-sm text-foreground tabular-nums'>{data.account.mediaCount.toLocaleString()}</p>
                </InfoItem>
                <InfoItem icon={Bookmark} label='リスト掲載'>
                  <p className='text-sm text-foreground tabular-nums'>{data.account.listedCount.toLocaleString()}</p>
                </InfoItem>
              </div>
            </motion.div>
          </>
        ) : (
          <motion.div
            variants={FADE_IN_UP}
            initial='initial'
            animate='animate'
            transition={{ duration: DURATION.normal }}
          >
            <div className='mb-4 flex items-center justify-between gap-3'>
              <div className='flex items-center gap-2'>
                <h1 className='text-2xl font-bold text-foreground'>Twitter 連携</h1>
                <StatusBadge ok={data.ok} fetchedAt={data.fetchedAt} />
              </div>
              <Button variant='outline' size='sm' onClick={refetch} disabled={isRefetching}>
                <RefreshCw className={cn('size-4 mr-1', isRefetching && 'animate-spin')} />
                再取得
              </Button>
            </div>

            <Separator className='my-6 bg-separator' />

            <div className='space-y-4'>
              <InfoItem icon={XCircle} label='エラー詳細'>
                <pre className='text-xs text-foreground whitespace-pre-wrap break-words bg-muted rounded-lg p-3 mt-1'>
                  {data.error ?? '不明なエラー'}
                </pre>
              </InfoItem>
              <InfoItem icon={Hash} label='確認ポイント'>
                <ul className='text-sm text-foreground list-disc pl-5 space-y-1 mt-1'>
                  <li>TWITTER_AUTH_TOKEN / TWITTER_CSRF_TOKEN の cookie が失効していないか</li>
                  <li>X_BEARER または USER_BY_SCREEN_NAME_QUERY_ID がローテートしていないか</li>
                  <li>X 内部 API のレスポンス形状が変わっていないか</li>
                </ul>
              </InfoItem>
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

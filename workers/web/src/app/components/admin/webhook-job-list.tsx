import { Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Bot, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import {
  detectionScoreLabel,
  webhookAccountLabel,
  webhookKeywordLabel,
  webhookModelLabel,
  webhookPostStatusLabel
} from '@/components/admin/webhook-labels'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminWebhookJobs } from '@/hooks/use-admin-webhooks'
import { useCharacters } from '@/hooks/use-characters'
import { cn } from '@/lib/utils'

export const WebhookJobList = () => {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState<string | null>(null)
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([])
  const jobs = useAdminWebhookJobs(cursor)
  const { data: characters } = useCharacters()

  const nextPage = () => {
    const nextCursor = jobs.data?.nextCursor
    if (!nextCursor) return
    setPreviousCursors((previous) => [...previous, cursor])
    setCursor(nextCursor)
  }

  const previousPage = () => {
    const previousCursor = previousCursors.at(-1)
    if (previousCursor === undefined) return
    setCursor(previousCursor)
    setPreviousCursors((previous) => previous.slice(0, -1))
  }

  return (
    <BotSettingsLayout
      title='Webhook 受信履歴'
      description='X投稿の日時、配布状態、判定精度と関連イベントを確認できます。'
      actions={
        <>
          <Button variant='outline' onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
            <RefreshCw className={cn('size-4', jobs.isFetching && 'animate-spin')} />
            更新
          </Button>
          <Button variant='outline' onClick={() => navigate({ to: '/admin/bot' })}>
            <Bot className='size-4' />
            Bot設定
          </Button>
        </>
      }
    >
      <div aria-live='polite' className='mb-4 text-sm'>
        {jobs.isPending && <p className='text-muted-foreground'>受信履歴を取得しています。</p>}
        {jobs.isError && <p className='text-destructive'>受信履歴を取得できませんでした。更新から再試行できます。</p>}
      </div>
      <div className='overflow-x-auto border-y border-separator'>
        <Table className='whitespace-nowrap [&_tr]:border-separator'>
          <TableHeader>
            <TableRow>
              <TableHead className='whitespace-nowrap'>アカウント</TableHead>
              <TableHead className='whitespace-nowrap'>日時</TableHead>
              <TableHead title='現在のキーワードルールによる判定'>判定</TableHead>
              <TableHead>モデル</TableHead>
              <TableHead className='text-right whitespace-nowrap'>精度</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>イベント名</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data?.jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className='py-8 text-center text-muted-foreground'>
                  受信履歴はありません。
                </TableCell>
              </TableRow>
            )}
            {jobs.data?.jobs.map((job) => (
              <TableRow key={job.postId}>
                <TableCell className='max-w-80 min-w-52'>
                  <a
                    href={job.sourceUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 font-medium hover:underline'
                  >
                    {webhookAccountLabel(job.post.screenName, characters)}
                    <ExternalLink className='size-3.5 shrink-0' />
                  </a>
                </TableCell>
                <TableCell className='whitespace-nowrap tabular-nums'>
                  {dayjs(job.post.createdAt).format('YYYY/MM/DD HH:mm:ss')}
                </TableCell>
                <TableCell className='whitespace-nowrap'>{webhookKeywordLabel(job.post)}</TableCell>
                <TableCell className='whitespace-nowrap'>{webhookModelLabel(job.model)}</TableCell>
                <TableCell className={cn('text-right', job.confidence !== null && 'font-mono tabular-nums')}>
                  {detectionScoreLabel(job.confidence)}
                </TableCell>
                <TableCell className='whitespace-nowrap'>{webhookPostStatusLabel(job)}</TableCell>
                <TableCell className='min-w-44 whitespace-nowrap'>
                  {job.eventId !== null && job.eventTitle !== null ? (
                    <Link to='/events/$uuid' params={{ uuid: job.eventId }} className='font-medium hover:underline'>
                      {job.eventTitle}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className='mt-5 flex items-center justify-between gap-4'>
        <p className='text-sm text-muted-foreground'>{previousCursors.length + 1} ページ</p>
        <div className='flex items-center gap-2'>
          <Button variant='outline' onClick={previousPage} disabled={previousCursors.length === 0 || jobs.isFetching}>
            <ChevronLeft className='size-4' />
            前へ
          </Button>
          <Button variant='outline' onClick={nextPage} disabled={!jobs.data?.nextCursor || jobs.isFetching}>
            次へ
            <ChevronRight className='size-4' />
          </Button>
        </div>
      </div>
    </BotSettingsLayout>
  )
}

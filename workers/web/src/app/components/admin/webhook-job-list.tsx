import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
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
  webhookPostStatusIsTentative,
  webhookPostStatusLabel,
  webhookPostStatusTentativeReason
} from '@/components/admin/webhook-labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminBotStatus } from '@/hooks/use-admin-bot'
import { useAdminWebhookJobs } from '@/hooks/use-admin-webhooks'
import { useCharacters } from '@/hooks/use-characters'
import { cn } from '@/lib/utils'

/** 登録済みイベントがあればリンク、無ければAIの下書き名を「候補」として控えめに表示する。 */
const WebhookEventName = ({ job }: { job: WebhookJob }) => {
  if (job.eventId !== null && job.eventTitle !== null) {
    return (
      <Link to='/events/$uuid' params={{ uuid: job.eventId }} className='font-medium hover:underline'>
        {job.eventTitle}
      </Link>
    )
  }
  const draftTitle = job.draft === null ? undefined : job.draft.title
  if (draftTitle === undefined) return '—'
  return (
    <div className='flex items-center gap-2 whitespace-nowrap text-muted-foreground'>
      {draftTitle}
      <Badge variant='outline' title='AIの下書き。未登録'>
        候補
      </Badge>
    </div>
  )
}

export const WebhookJobList = () => {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState<string | null>(null)
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([])
  const jobs = useAdminWebhookJobs(cursor)
  const { data: characters } = useCharacters()
  const { data: botStatus } = useAdminBotStatus()
  // 一覧の未確定は投稿状態（status）の確信度なので、status の項目別しきい値で見る。
  // しきい値を取得できるまで（読み込み中・エラー）は通常の見た目にする。
  const statusThreshold = botStatus?.webhook.fieldThresholds.status

  const isTentative = (job: WebhookJob) =>
    statusThreshold !== undefined && job.status !== 'ignored' && webhookPostStatusIsTentative(job, statusThreshold)
  const tentativeReason = statusThreshold === undefined ? undefined : webhookPostStatusTentativeReason(statusThreshold)

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
          <Button
            variant='outline'
            className='border-card-border'
            onClick={() => jobs.refetch()}
            disabled={jobs.isFetching}
          >
            <RefreshCw className={cn('size-4', jobs.isFetching && 'animate-spin')} />
            更新
          </Button>
          <Button variant='outline' className='border-card-border' onClick={() => navigate({ to: '/admin/bot' })}>
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
              {/* 各行に「詳細」リンクがあるので、見出しは視覚的に隠してスクリーンリーダー向けにだけ残す。 */}
              <TableHead className='whitespace-nowrap'>
                <span className='sr-only'>詳細</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data?.jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className='py-8 text-center text-muted-foreground'>
                  受信履歴はありません。
                </TableCell>
              </TableRow>
            )}
            {jobs.data?.jobs.map((job) => {
              const accountLabel = webhookAccountLabel(job.post.screenName, characters)
              return (
                <TableRow key={job.postId}>
                  <TableCell className='max-w-80 min-w-52'>
                    <a
                      href={job.sourceUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex w-fit items-center gap-1 font-medium hover:underline'
                    >
                      {accountLabel}
                      <ExternalLink className='size-3.5 shrink-0' />
                    </a>
                  </TableCell>
                  <TableCell className='whitespace-nowrap tabular-nums'>
                    {dayjs(job.post.createdAt).format('YYYY/MM/DD HH:mm:ss')}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>{webhookKeywordLabel(job.post)}</TableCell>
                  <TableCell className='whitespace-nowrap'>{webhookModelLabel(job.model)}</TableCell>
                  {/*
                    td に font-mono を付けると行の基線が等幅フォントで決まり、隣のセルとずれる。等幅は内側の span にだけ付ける。
                    span の行高は 0 にして、等幅フォントの上下の余白が行ボックスを広げ、基線を動かさないようにする。
                  */}
                  <TableCell className='text-right'>
                    {job.confidence === null ? (
                      '—'
                    ) : (
                      <span className='font-mono tabular-nums leading-[0]'>{detectionScoreLabel(job.confidence)}</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn('whitespace-nowrap', isTentative(job) && 'text-muted-foreground')}
                    title={isTentative(job) ? tentativeReason : undefined}
                  >
                    {webhookPostStatusLabel(job)}
                  </TableCell>
                  <TableCell className='min-w-44 whitespace-nowrap'>
                    <WebhookEventName job={job} />
                  </TableCell>
                  <TableCell>
                    {/* Button 既定の inline-flex は基線に乗るため、ブロックの flex に上書きして上下中央に揃える。 */}
                    <Button asChild variant='ghost' size='sm' className='flex w-fit items-center'>
                      <Link
                        to='/admin/webhooks/$postId'
                        params={{ postId: job.postId }}
                        aria-label={`${accountLabel}の判定詳細`}
                      >
                        詳細
                        <ChevronRight className='size-4' />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className='mt-5 flex items-center justify-between gap-4'>
        <p className='text-sm text-muted-foreground'>{previousCursors.length + 1} ページ</p>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            className='border-card-border'
            onClick={previousPage}
            disabled={previousCursors.length === 0 || jobs.isFetching}
          >
            <ChevronLeft className='size-4' />
            前へ
          </Button>
          <Button
            variant='outline'
            className='border-card-border'
            onClick={nextPage}
            disabled={!jobs.data?.nextCursor || jobs.isFetching}
          >
            次へ
            <ChevronRight className='size-4' />
          </Button>
        </div>
      </div>
    </BotSettingsLayout>
  )
}

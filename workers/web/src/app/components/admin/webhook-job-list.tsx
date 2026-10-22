import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ArrowDown, ArrowUp, ArrowUpDown, Bot, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import {
  changeWebhookFilterAtom,
  cycleWebhookConfidenceSort,
  type WebhookFilter,
  webhookColumnAriaSort,
  webhookFilterAtom
} from '@/atoms/webhook-filter-atom'
import {
  nextWebhookPagination,
  previousWebhookPagination,
  webhookPaginationAtom
} from '@/atoms/webhook-pagination-atom'
import { BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import { WebhookDiscoveryBadge } from '@/components/admin/webhook-discovery-badge'
import { webhookDiscoveryActionLabel } from '@/components/admin/webhook-discovery-labels'
import { WebhookFilterToolbar } from '@/components/admin/webhook-filter-toolbar'
import {
  detectionScoreLabel,
  webhookAccountLabel,
  webhookCandidateTitle,
  webhookKeywordLabel,
  webhookModelLabel,
  webhookPostStatusIsTentative,
  webhookPostStatusLabel,
  webhookPostStatusTentativeReason
} from '@/components/admin/webhook-labels'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminBotStatus } from '@/hooks/use-admin-bot'
import { useAdminWebhookJobs } from '@/hooks/use-admin-webhooks'
import { useCharacters } from '@/hooks/use-characters'
import { cn } from '@/lib/utils'

/** 登録済みイベントがあればリンク、無ければAIの下書き名を「候補」として控えめに表示する。 */
const WebhookEventName = ({ job }: { job: WebhookJob }) => {
  if (job.candidates.length > 0) {
    return (
      <ul className='space-y-2'>
        {job.candidates.map((candidate) => (
          <li key={candidate.eventUUID} className='flex items-center gap-2'>
            {candidate.eventId !== null ? (
              <Link to='/events/$uuid' params={{ uuid: candidate.eventId }} className='font-medium hover:underline'>
                {webhookCandidateTitle(candidate)}
              </Link>
            ) : (
              <span>{webhookCandidateTitle(candidate)}</span>
            )}
            <WebhookDiscoveryBadge job={candidate} compact />
          </li>
        ))}
      </ul>
    )
  }
  if (job.eventId !== null && job.eventTitle !== null) {
    return (
      <Link to='/events/$uuid' params={{ uuid: job.eventId }} className='font-medium hover:underline'>
        {job.eventTitle}
      </Link>
    )
  }
  const draftTitle = job.draft === null ? undefined : job.draft.title
  if (draftTitle === undefined)
    return job.discovery !== undefined && job.discovery !== null ? (
      <div className='flex items-center gap-2'>
        <span>{webhookDiscoveryActionLabel(job.discovery.action)}</span>
        <WebhookDiscoveryBadge job={job} compact />
      </div>
    ) : (
      '—'
    )
  return (
    <div className='flex items-center gap-2 whitespace-nowrap text-muted-foreground'>
      {draftTitle}
      <Badge variant='outline' title='AIの下書き。未登録'>
        候補
      </Badge>
    </div>
  )
}

/** 精度の見出しボタンのアイコン。並べ替えの軸が精度でなければ上下の矢印、精度なら向きを示す。 */
const confidenceSortIcon = (filter: Pick<WebhookFilter, 'sort' | 'order'>) => {
  if (filter.sort !== 'confidence') return ArrowUpDown
  return filter.order === 'desc' ? ArrowDown : ArrowUp
}

/** 精度の見出しを押したときの次の並びの説明。 既定 → 高い順 → 低い順 → 既定 と巡回する。 */
const confidenceSortHint = (filter: Pick<WebhookFilter, 'sort' | 'order'>): string => {
  if (filter.sort !== 'confidence') return '精度の高い順に並べ替え'
  return filter.order === 'desc' ? '精度の低い順に並べ替え' : '日時の新しい順に戻す'
}

export const WebhookJobList = () => {
  const navigate = useNavigate()
  // ページ位置は詳細へ移動して戻っても、再読み込みしても保つ（タブ単位で保存）。
  const [{ cursor, previousCursors }, setPagination] = useAtom(webhookPaginationAtom)
  // 絞り込み・並べ替えも同じく保つ。変更はページ位置のリセットとセットで行う（changeWebhookFilterAtom）。
  const filter = useAtomValue(webhookFilterAtom)
  const changeFilter = useSetAtom(changeWebhookFilterAtom)
  const jobs = useAdminWebhookJobs(cursor, filter)
  const { data: characters } = useCharacters()
  const { data: botStatus } = useAdminBotStatus()
  // 一覧の未確定は投稿状態（status）の確信度なので、status の項目別しきい値で見る。
  // しきい値を取得できるまで（読み込み中・エラー）は通常の見た目にする。
  const statusThreshold = botStatus?.webhook.fieldThresholds.status

  const SortIcon = confidenceSortIcon(filter)

  const isTentative = (job: WebhookJob) =>
    statusThreshold !== undefined && job.status !== 'ignored' && webhookPostStatusIsTentative(job, statusThreshold)
  const tentativeReason = statusThreshold === undefined ? undefined : webhookPostStatusTentativeReason(statusThreshold)

  const nextPage = () => {
    const nextCursor = jobs.data?.nextCursor
    if (!nextCursor) return
    setPagination((previous) => nextWebhookPagination(previous, nextCursor))
  }

  const previousPage = () => {
    setPagination(previousWebhookPagination)
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
      <WebhookFilterToolbar filter={filter} changeFilter={changeFilter} characters={characters} />
      <div className='min-w-0 border-y border-separator'>
        <Table className='whitespace-nowrap [&_tr]:border-separator'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <span className='sr-only'>アカウント</span>
              </TableHead>
              <TableHead className='w-64'>投稿内容</TableHead>
              <TableHead className='whitespace-nowrap'>投稿時間</TableHead>
              <TableHead title='現在のキーワードルールによる判定'>判定</TableHead>
              <TableHead>モデル</TableHead>
              <TableHead
                className='text-right whitespace-nowrap'
                aria-sort={webhookColumnAriaSort(filter, 'confidence')}
              >
                {/* 押すたびに 既定 → 精度の高い順 → 精度の低い順 → 既定 と巡回する。 */}
                <Button
                  variant='ghost'
                  size='sm'
                  title={confidenceSortHint(filter)}
                  onClick={() => changeFilter(cycleWebhookConfidenceSort)}
                  className='-mr-2 ml-auto flex h-8 w-fit items-center gap-1 px-2 font-medium'
                >
                  精度
                  <SortIcon className='size-4' aria-hidden='true' />
                </Button>
              </TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>イベント名</TableHead>
              {/* 詳細列は Table 内部のスクロール領域の右端に固定し、背景で下の内容を隠す。 */}
              <TableHead className='sticky right-0 z-20 border-l border-separator bg-page-bg whitespace-nowrap'>
                <span className='sr-only'>詳細</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data?.jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className='py-8 text-center text-muted-foreground'>
                  {/* 判定の絞り込みは走査の上限で打ち切ることがあり、先が残っていれば0件でも続きを探せる。 */}
                  {jobs.data.nextCursor === null
                    ? '受信履歴はありません。'
                    : 'この範囲には条件に合う履歴がありません。「次へ」で続きを検索できます。'}
                </TableCell>
              </TableRow>
            )}
            {jobs.data?.jobs.map((job) => {
              const accountLabel = webhookAccountLabel(job.post.screenName, characters)
              const postPreview = job.post.text.trim()
              const character = characters.find(
                (entry) => entry.character.twitter_id?.toLowerCase() === job.post.screenName.toLowerCase()
              )
              return (
                <TableRow key={job.postId}>
                  <TableCell className='w-12'>
                    <a
                      href={job.sourceUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      title={accountLabel}
                      aria-label={`${accountLabel}の元投稿を開く`}
                      className='flex w-fit items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
                    >
                      <Avatar className='size-8 border border-card-border' aria-hidden='true'>
                        {character !== undefined && (
                          <AvatarImage
                            src={character.character.image_url}
                            alt=''
                            className='mix-blend-multiply scale-150 translate-y-[20%]'
                          />
                        )}
                        <AvatarFallback className='bg-brand/10 text-brand'>
                          {(character === undefined ? job.post.screenName : accountLabel).slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                    </a>
                  </TableCell>
                  <TableCell className='w-64 max-w-64'>
                    <p
                      className='w-64 line-clamp-2 whitespace-pre-line break-all text-sm text-muted-foreground'
                      title={postPreview.length === 0 ? undefined : postPreview}
                    >
                      {postPreview.length === 0 ? '—' : postPreview}
                    </p>
                  </TableCell>
                  <TableCell className='whitespace-nowrap tabular-nums'>
                    {dayjs(job.post.createdAt).format('YYYY/MM/DD HH:mm:ss')}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>{webhookKeywordLabel(job.post)}</TableCell>
                  <TableCell className='whitespace-nowrap'>{webhookModelLabel(job.model)}</TableCell>
                  {/*
                    td に font-mono を付けると行の基線が等幅フォントで決まり、隣のセルとずれる。等幅は内側の span にだけ付ける。
                    span の行高を 0 にし、親を flex にして通常行ボックスの基線から外し、数値もセルの中央に揃える。
                  */}
                  <TableCell className='text-right'>
                    {job.confidence === null ? (
                      '—'
                    ) : (
                      <div className='flex items-center justify-end'>
                        <span className='font-mono tabular-nums leading-[0]'>
                          {detectionScoreLabel(job.confidence)}
                        </span>
                      </div>
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
                  <TableCell className='sticky right-0 z-10 border-l border-separator bg-page-bg'>
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

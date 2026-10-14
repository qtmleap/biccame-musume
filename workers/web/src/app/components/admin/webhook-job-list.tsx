import { WEBHOOK_KEYWORD_VERDICTS } from '@biccame/shared/event-detect/detection'
import {
  type WebhookJob,
  type WebhookJobRange,
  WebhookJobRangeSchema,
  WebhookKeywordVerdictSchema,
  WebhookPostStatusFilterSchema
} from '@biccame/shared/schemas/webhook.dto'
import { Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilterX,
  RefreshCw
} from 'lucide-react'
import {
  changeWebhookFilterAtom,
  cycleWebhookConfidenceSort,
  hasWebhookFilterConditions,
  NO_WEBHOOK_FILTER,
  setWebhookPostStatus,
  setWebhookRange,
  setWebhookVerdict,
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
import {
  detectionScoreLabel,
  webhookAccountLabel,
  webhookCandidateTitle,
  webhookKeywordLabel,
  webhookKeywordVerdictLabel,
  webhookModelLabel,
  webhookPostStatusFilterLabel,
  webhookPostStatusIsTentative,
  webhookPostStatusLabel,
  webhookPostStatusTentativeReason
} from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
            <WebhookStatusBadge status={candidate.status} />
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

const RANGE_LABELS = { '1h': '直近1時間', '24h': '直近24時間' } as const satisfies Record<WebhookJobRange, string>
const ALL_LABEL = 'すべて'

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

/** 期間・判定・ステータスの絞り込みと「条件をクリア」。変更はすべて changeFilter 経由で、ページ位置を1ページ目へ戻す。 */
const WebhookFilterToolbar = ({
  filter,
  changeFilter
}: {
  filter: WebhookFilter
  changeFilter: (update: (filter: WebhookFilter) => WebhookFilter) => void
}) => (
  <fieldset aria-label='絞り込み' className='mb-4 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 border-0 p-0'>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground'>期間</span>
      <Select
        value={filter.range === null ? 'all' : filter.range}
        onValueChange={(value) => {
          const range = WebhookJobRangeSchema.safeParse(value)
          changeFilter((previous) => setWebhookRange(previous, range.success ? range.data : null))
        }}
      >
        <SelectTrigger aria-label='期間' size='sm' className='w-36'>
          <SelectValue>{filter.range === null ? ALL_LABEL : RANGE_LABELS[filter.range]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WebhookJobRangeSchema.options.map((range) => (
            <SelectItem key={range} value={range}>
              {RANGE_LABELS[range]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground' title='現在のキーワードルールによる判定'>
        判定
      </span>
      <Select
        value={filter.verdict === null ? 'all' : filter.verdict}
        onValueChange={(value) => {
          const verdict = WebhookKeywordVerdictSchema.safeParse(value)
          changeFilter((previous) => setWebhookVerdict(previous, verdict.success ? verdict.data : null))
        }}
      >
        <SelectTrigger aria-label='判定' size='sm' className='w-32'>
          <SelectValue>{filter.verdict === null ? ALL_LABEL : webhookKeywordVerdictLabel(filter.verdict)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WEBHOOK_KEYWORD_VERDICTS.map((verdict) => (
            <SelectItem key={verdict} value={verdict}>
              {webhookKeywordVerdictLabel(verdict)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className='flex items-center gap-2'>
      <span className='text-sm text-muted-foreground'>ステータス</span>
      <Select
        value={filter.postStatus === null ? 'all' : filter.postStatus}
        onValueChange={(value) => {
          const postStatus = WebhookPostStatusFilterSchema.safeParse(value)
          changeFilter((previous) => setWebhookPostStatus(previous, postStatus.success ? postStatus.data : null))
        }}
      >
        <SelectTrigger aria-label='ステータス' size='sm' className='w-32'>
          <SelectValue>
            {filter.postStatus === null ? ALL_LABEL : webhookPostStatusFilterLabel(filter.postStatus)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{ALL_LABEL}</SelectItem>
          {WebhookPostStatusFilterSchema.options.map((postStatus) => (
            <SelectItem key={postStatus} value={postStatus}>
              {webhookPostStatusFilterLabel(postStatus)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <Button
      variant='outline'
      className='border-card-border'
      onClick={() => changeFilter(() => NO_WEBHOOK_FILTER)}
      disabled={!hasWebhookFilterConditions(filter)}
    >
      <FilterX className='size-4' />
      条件をクリア
    </Button>
  </fieldset>
)

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
      <WebhookFilterToolbar filter={filter} changeFilter={changeFilter} />
      <div className='overflow-x-auto border-y border-separator'>
        <Table className='whitespace-nowrap [&_tr]:border-separator'>
          <TableHeader>
            <TableRow>
              <TableHead className='whitespace-nowrap'>アカウント</TableHead>
              <TableHead className='whitespace-nowrap'>日時</TableHead>
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
                  {/* 判定の絞り込みは走査の上限で打ち切ることがあり、先が残っていれば0件でも続きを探せる。 */}
                  {jobs.data.nextCursor === null
                    ? '受信履歴はありません。'
                    : 'この範囲には条件に合う履歴がありません。「次へ」で続きを検索できます。'}
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

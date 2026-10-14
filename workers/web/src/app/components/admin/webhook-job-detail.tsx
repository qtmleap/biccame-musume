import { reasonLabel } from '@biccame/shared/event-detect/answer-view'
import type { DetectionThresholds } from '@biccame/shared/event-detect/detection'
import type { EventRequestQuery } from '@biccame/shared/schemas/event.dto'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import {
  Circle,
  CircleCheck,
  ExternalLink,
  FilePlus2,
  Link2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  X
} from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import { BotSettingRow, BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { webhookEventCreateSearch } from '@/components/admin/webhook-form-defaults'
import {
  detectionScoreLabel,
  isWebhookJobJudging,
  notificationRetryWarning,
  webhookActionAvailability
} from '@/components/admin/webhook-labels'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAdminBotStatus } from '@/hooks/use-admin-bot'
import {
  useAdminWebhookJob,
  useRejudgeAdminWebhookJob,
  useResolveAdminWebhookJob,
  useRetryAdminWebhookJob
} from '@/hooks/use-admin-webhooks'
import { cn } from '@/lib/utils'

type ConfirmAction = 'processing' | 'notification' | 'reject' | 'rejudge'

const CONFIRM_TITLES: Record<ConfirmAction, string> = {
  processing: '失敗した処理を再実行しますか？',
  notification: 'Discord通知を再送しますか？',
  reject: 'この投稿を対象外にしますか？',
  rejudge: 'AI で判定し直しますか？'
}

export const WebhookJobDetail = ({ postId }: { postId: string }) => {
  const jobQuery = useAdminWebhookJob(postId)
  const { data: botStatus } = useAdminBotStatus()
  // しきい値は現在の設定。取得できるまで（読み込み中・エラー）は undefined のままにして、表は '—' を出す。
  const thresholds: DetectionThresholds | undefined =
    botStatus === undefined
      ? undefined
      : {
          eventThreshold: botStatus.webhook.eventThreshold,
          fieldThreshold: botStatus.webhook.choiceThreshold,
          ignoreThreshold: botStatus.webhook.ignoreThreshold,
          fieldThresholds: botStatus.webhook.fieldThresholds
        }
  const retry = useRetryAdminWebhookJob()
  const resolve = useResolveAdminWebhookJob()
  const rejudge = useRejudgeAdminWebhookJob()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkEventId, setLinkEventId] = useState('')
  const [linkError, setLinkError] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)
  const parentJob = jobQuery.data
  const selected = parentJob?.candidates.find((candidate) => candidate.eventUUID === selectedCandidate)
  const active = selected === undefined ? parentJob?.candidates[0] : selected
  const job = active === undefined ? parentJob : { ...active, candidates: [] }
  const candidateSelection = active === undefined ? {} : { candidateId: active.eventUUID }
  // 選択中の候補の登録候補・下書きを作成ページの初期値にする。読み込み中は初期値なしでリンクだけ出す。
  const createSearch: EventRequestQuery = job === undefined ? {} : webhookEventCreateSearch(job)
  const isPending = retry.isPending || resolve.isPending || rejudge.isPending
  const availability = job
    ? webhookActionAvailability(job.status, job.notificationStatus, job.reasons)
    : {
        canResolve: false,
        canRetryProcessing: false,
        canRejudge: false,
        canRetryNotification: false
      }

  const confirm = async () => {
    if (!job || !confirmAction) return
    try {
      if (confirmAction === 'reject') {
        await resolve.mutateAsync({ postId, data: { action: 'reject', ...candidateSelection } })
      } else if (confirmAction === 'rejudge') {
        await rejudge.mutateAsync({ postId, ...candidateSelection })
      } else {
        await retry.mutateAsync({
          postId,
          data: {
            ...candidateSelection,
            notificationOnly: confirmAction === 'notification',
            allowUnknown: confirmAction === 'notification' && job.notificationStatus === 'unknown'
          }
        })
      }
      setConfirmAction(null)
    } catch {
      // mutationが失敗を表示する。再操作には改めて確認が必要。
    }
  }

  const link = async () => {
    const parsed = z.uuid().safeParse(linkEventId.trim())
    setLinkError(!parsed.success)
    if (!parsed.success) return
    try {
      await resolve.mutateAsync({ postId, data: { ...candidateSelection, action: 'link', eventId: parsed.data } })
      setLinkOpen(false)
    } catch {
      // mutationのエラー表示を使用する。
    }
  }

  const confirmDescription =
    confirmAction === 'notification' && job
      ? notificationRetryWarning(job.notificationStatus)
      : confirmAction === 'reject'
        ? 'この投稿はイベント登録せず、対象外として保存します。既存イベントは変更しません。'
        : confirmAction === 'rejudge'
          ? '現在の質問とモデルで AI を再実行し、判定をやり直します。保存済みの回答と判定結果は上書きされます。結果次第でイベントが自動登録され、Discord にも通知（通知済みの場合は再通知）される場合があります。'
          : '失敗した処理をもう一度実行します。判定結果が保存済みならそれを使い、なければ AI を呼びます。'

  return (
    <BotSettingsLayout
      title='Webhook 受信詳細'
      description='元投稿、判定根拠、イベント登録、Discord通知を確認します。登録はイベント作成ページで行えます。'
      back={{ to: '/admin/webhooks', label: '受信履歴に戻る' }}
      actions={
        <Button
          variant='outline'
          className='border-card-border'
          onClick={() => jobQuery.refetch()}
          disabled={jobQuery.isFetching || isPending}
        >
          <RefreshCw className={cn('size-4', jobQuery.isFetching && 'animate-spin')} />
          更新
        </Button>
      }
    >
      <div aria-live='polite' className='mb-4 text-sm'>
        {jobQuery.isPending && <p className='text-muted-foreground'>受信詳細を取得しています。</p>}
        {jobQuery.isError && (
          <p className='text-destructive'>受信詳細を取得できませんでした。更新から再試行できます。</p>
        )}
      </div>
      <div className='mb-6 flex flex-wrap gap-2 border-b pb-5'>
        {/* 先頭ボタンは常に同じ場所に出し、登録済みのときだけ意味を「編集」に切り替える。どちらも遷移だけで受信ジョブの状態は変えないため、常に開ける。 */}
        <Button asChild className='bg-brand text-brand-foreground hover:bg-brand/90'>
          {job !== undefined && job.status === 'registered' && job.eventId !== null ? (
            <Link to='/admin/events/$uuid/edit' params={{ uuid: job.eventId }}>
              <Pencil className='size-4' />
              編集
            </Link>
          ) : (
            <Link to='/admin/events/new' search={createSearch}>
              <FilePlus2 className='size-4' />
              補完して登録
            </Link>
          )}
        </Button>
        <Button
          variant='outline'
          className='border-card-border'
          onClick={() => setLinkOpen(true)}
          disabled={!availability.canResolve || isPending}
        >
          <Link2 className='size-4' />
          既存へ紐付け
        </Button>
        <Button
          variant='outline'
          className='border-card-border'
          onClick={() => setConfirmAction('reject')}
          disabled={!availability.canResolve || isPending}
        >
          <X className='size-4' />
          対象外にする
        </Button>
        <Button
          variant='outline'
          className='border-card-border'
          onClick={() => setConfirmAction('processing')}
          disabled={!availability.canRetryProcessing || isPending}
          title='処理に失敗した投稿を、もう一度処理します（保存済みの判定結果があれば再利用）'
        >
          <RotateCcw className='size-4' />
          失敗した処理を再実行
        </Button>
        <Button
          variant='outline'
          className='border-card-border'
          onClick={() => setConfirmAction('rejudge')}
          disabled={!availability.canRejudge || isPending}
          title='保存済みの回答を消して、AI で判定し直します'
        >
          <RefreshCw className='size-4' />
          AI で判定し直す
        </Button>
        <Button
          variant='outline'
          className='border-card-border'
          onClick={() => setConfirmAction('notification')}
          disabled={!availability.canRetryNotification || isPending}
        >
          <Send className='size-4' />
          通知を再送
        </Button>
      </div>
      {parentJob && (
        <section className='mb-6 border-b border-separator pb-4' aria-label='投稿全体の配布物数チェック'>
          <h2 className='mb-2 text-lg font-semibold'>投稿全体の配布物数チェック</h2>
          {parentJob.itemCountAudit ? (
            <>
              <p>
                配布物：判定
                {parentJob.itemCountAudit.expected === null ? '未確定' : `${parentJob.itemCountAudit.expected}種類`}
                ／抽出{parentJob.itemCountAudit.extracted}種類／候補{parentJob.itemCountAudit.candidates}件
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {
                  {
                    matched: '一致',
                    mismatch: '件数不一致',
                    unknown: '件数未確定',
                    low_confidence: '確率がしきい値未満',
                    overflow: '21種類以上（上限超過）'
                  }[parentJob.itemCountAudit.status]
                }
                {' · '}確率{' '}
                {parentJob.itemCountAudit.probability === null
                  ? '—'
                  : `${(parentJob.itemCountAudit.probability * 100).toFixed(1)}%`}
                {' · '}しきい値 {(parentJob.itemCountAudit.threshold * 100).toFixed(1)}%{' · '}
                {parentJob.itemCountAudit.version}
              </p>
            </>
          ) : (
            <p className='text-sm text-muted-foreground'>
              件数未チェック（旧保存値を含む）。候補の再判定時に投稿全体を確認します。
            </p>
          )}
        </section>
      )}
      {job && (
        <div className='space-y-8'>
          <div className={cn('grid min-w-0 gap-4', parentJob && parentJob.candidates.length > 0 && 'md:grid-cols-2')}>
            <section className='min-w-0'>
              <h2 className='mb-2 text-lg font-semibold md:text-xl'>元投稿</h2>
              <a
                href={job.sourceUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 text-sm hover:underline'
              >
                @{job.post.screenName} · {job.postId}
                <ExternalLink className='size-4' />
              </a>
              <p className='mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed'>{parentJob?.post.text}</p>
              <p className='mt-3 text-xs text-muted-foreground'>
                投稿日: {dayjs(job.post.createdAt).format('YYYY/MM/DD HH:mm:ss')}
              </p>
            </section>
            {parentJob && parentJob.candidates.length > 0 && (
              <section className='min-w-0' aria-label='識別されたイベント'>
                <h2 className='mb-1 text-lg font-semibold md:text-xl'>識別されたイベント</h2>
                <p className='mb-2 text-sm text-muted-foreground'>
                  クリックで選択すると、上部の操作と下の判定結果がそのイベントに切り替わります
                </p>
                <ul className='flex flex-col gap-1.5'>
                  {parentJob.candidates.map((candidate) => {
                    const isActive = active?.eventUUID === candidate.eventUUID
                    return (
                      // 候補名ボタンの疑似要素で行全体を覆い、行のどこをクリックしても選択できるようにする（リンクはz-10で除外）。
                      <li
                        key={candidate.eventUUID}
                        className={cn(
                          'relative flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors',
                          isActive ? 'bg-brand/10 ring-1 ring-brand/40' : 'shadow-none ring-0 hover:bg-brand/5',
                          isPending ? 'cursor-default' : 'cursor-pointer',
                          // キーボード操作の目印は影（ring）ではなく、行から少し離したくっきりした枠線にする。
                          'has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-brand'
                        )}
                      >
                        <Button
                          variant='ghost'
                          className={cn(
                            'h-8 gap-2 px-0 transition-none hover:bg-transparent focus-visible:ring-0 dark:hover:bg-transparent',
                            'after:absolute after:inset-0 after:rounded-md',
                            isActive && 'font-semibold'
                          )}
                          aria-pressed={isActive}
                          disabled={isPending}
                          onClick={() => {
                            setSelectedCandidate(candidate.eventUUID)
                            setLinkOpen(false)
                            setConfirmAction(null)
                          }}
                        >
                          {isActive ? (
                            <CircleCheck className='size-4' />
                          ) : (
                            <Circle className='size-4 text-muted-foreground' />
                          )}
                          {candidate.item}
                        </Button>
                        <WebhookStatusBadge status={candidate.status} />
                        {candidate.eventId !== null && (
                          <Link
                            to='/events/$uuid'
                            params={{ uuid: candidate.eventId }}
                            className='relative z-10 text-sm hover:underline'
                          >
                            登録イベント
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>Clef の回答</h2>
            {isWebhookJobJudging(job.status) ? (
              <p role='status' className='text-sm text-muted-foreground'>
                判定中です。結果が出ると自動で更新されます。
              </p>
            ) : job.answers === null ? (
              <p className='text-sm text-muted-foreground'>回答の記録なし</p>
            ) : (
              <WebhookAnswerTable answers={job.answers} thresholds={thresholds} />
            )}
          </section>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>判定・イベント登録</h2>
            <dl>
              <BotSettingRow label='判定状態'>
                <WebhookStatusBadge status={job.status} />
              </BotSettingRow>
              <BotSettingRow label='イベント判定スコア'>
                <span className='font-mono tabular-nums'>{detectionScoreLabel(job.confidence)}</span>
              </BotSettingRow>
              <BotSettingRow label='判定モデル'>{job.model ? job.model : '未判定'}</BotSettingRow>
              <BotSettingRow label='質問の版'>{job.questionVersion ? job.questionVersion : '未判定'}</BotSettingRow>
              <BotSettingRow label='判定理由'>
                {job.reasons.length > 0 ? (
                  <ul className='space-y-1'>
                    {job.reasons.map((reason) => (
                      <li key={reason} className='break-words' title={reason}>
                        {reasonLabel(reason)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '理由の記録なし'
                )}
              </BotSettingRow>
              <BotSettingRow label='処理回数'>
                <span className='font-mono tabular-nums'>{job.attempts}</span>
              </BotSettingRow>
              <BotSettingRow label='登録イベント'>
                {job.eventId ? (
                  <Link to='/events/$uuid' params={{ uuid: job.eventId }} className='hover:underline'>
                    {job.eventId}
                  </Link>
                ) : (
                  '未登録'
                )}
              </BotSettingRow>
              <BotSettingRow label='受信日時'>{dayjs(job.createdAt).format('YYYY/MM/DD HH:mm:ss')}</BotSettingRow>
              <BotSettingRow label='最終更新'>{dayjs(job.updatedAt).format('YYYY/MM/DD HH:mm:ss')}</BotSettingRow>
            </dl>
            {job.lastError && <p className='mt-3 text-sm text-destructive'>処理エラー: {job.lastError}</p>}
            <p className='mt-3 text-sm text-muted-foreground'>
              AIスコアは正解率を保証しません。保留を解決する際は元投稿と内容を照合してください。
            </p>
          </section>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>Discord 通知</h2>
            <dl>
              <BotSettingRow label='通知状態'>
                <WebhookStatusBadge status={job.notificationStatus} notification />
              </BotSettingRow>
              <BotSettingRow label='通知試行回数'>
                <span className='font-mono tabular-nums'>{job.notificationAttempts}</span>
              </BotSettingRow>
              <BotSettingRow label='メッセージID'>{job.notificationId ? job.notificationId : '記録なし'}</BotSettingRow>
            </dl>
            {job.notificationError && (
              <p className='mt-3 text-sm text-destructive'>通知エラー: {job.notificationError}</p>
            )}
            {job.notificationStatus === 'unknown' && (
              <p className='mt-3 text-sm text-destructive'>{notificationRetryWarning('unknown')}</p>
            )}
          </section>
        </div>
      )}
      <BotActionConfirmation
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title={confirmAction ? CONFIRM_TITLES[confirmAction] : '操作を確認'}
        description={confirmDescription}
        actionLabel={confirmAction === 'reject' ? '対象外にする' : '実行する'}
        isPending={isPending}
        onConfirm={confirm}
      />
      <Dialog open={linkOpen} onOpenChange={isPending ? undefined : setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>既存イベントへ紐付け</DialogTitle>
            <DialogDescription>
              管理画面のイベントURL末尾にあるUUIDを入力してください。既存イベントの内容は変更しません。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <label htmlFor='link-event-id' className='text-sm font-medium'>
              イベントUUID
            </label>
            <Input
              id='link-event-id'
              value={linkEventId}
              onChange={(event) => {
                setLinkEventId(event.target.value)
                setLinkError(false)
              }}
              placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
              disabled={isPending}
              aria-invalid={linkError}
            />
            {linkError && (
              <p role='alert' className='text-sm text-destructive'>
                有効なイベントUUIDを入力してください。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              className='border-card-border'
              onClick={() => setLinkOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              className='bg-brand text-brand-foreground hover:bg-brand/90'
              onClick={link}
              disabled={!availability.canResolve || isPending}
            >
              紐付ける
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BotSettingsLayout>
  )
}

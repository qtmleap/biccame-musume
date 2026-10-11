import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, ExternalLink, FilePlus2, Link2, RefreshCw, RotateCcw, Send, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import { BotSettingRow, BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import { EventForm } from '@/components/admin/event-form'
import {
  detectionScoreLabel,
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
import { useAdminWebhookJob, useResolveAdminWebhookJob, useRetryAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import { cn } from '@/lib/utils'

type ConfirmAction = 'processing' | 'notification' | 'reject'

const CONFIRM_TITLES: Record<ConfirmAction, string> = {
  processing: '投稿の判定を再試行しますか？',
  notification: 'Discord通知を再送しますか？',
  reject: 'この投稿を対象外にしますか？'
}

export const WebhookJobDetail = ({ postId }: { postId: string }) => {
  const jobQuery = useAdminWebhookJob(postId)
  const retry = useRetryAdminWebhookJob()
  const resolve = useResolveAdminWebhookJob()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkEventId, setLinkEventId] = useState('')
  const [linkError, setLinkError] = useState(false)
  const job = jobQuery.data
  const isPending = retry.isPending || resolve.isPending
  const availability = job
    ? webhookActionAvailability(job.status, job.notificationStatus)
    : {
        canResolve: false,
        canRetryProcessing: false,
        canRetryNotification: false
      }

  const confirm = async () => {
    if (!job || !confirmAction) return
    try {
      if (confirmAction === 'reject') {
        await resolve.mutateAsync({ postId, data: { action: 'reject' } })
      } else {
        await retry.mutateAsync({
          postId,
          data: {
            notificationOnly: confirmAction === 'notification',
            allowUnknown: confirmAction === 'notification' && job.notificationStatus === 'unknown'
          }
        })
      }
      setConfirmAction(null)
      setShowForm(false)
    } catch {
      // mutationが失敗を表示する。再操作には改めて確認が必要。
    }
  }

  const register = async (event: EventRequest) => {
    await resolve.mutateAsync({ postId, data: { action: 'register', event: { ...event, shouldTweet: false } } })
    setShowForm(false)
  }

  const link = async () => {
    const parsed = z.uuid().safeParse(linkEventId.trim())
    setLinkError(!parsed.success)
    if (!parsed.success) return
    try {
      await resolve.mutateAsync({ postId, data: { action: 'link', eventId: parsed.data } })
      setLinkOpen(false)
      setShowForm(false)
    } catch {
      // mutationのエラー表示を使用する。
    }
  }

  const confirmDescription =
    confirmAction === 'notification' && job
      ? notificationRetryWarning(job.notificationStatus)
      : confirmAction === 'reject'
        ? 'この投稿はイベント登録せず、対象外として保存します。既存イベントは変更しません。'
        : '失敗した投稿の判定を再試行します。AI呼び出しが発生する場合があります。'

  return (
    <BotSettingsLayout
      title='Webhook 受信詳細'
      description='元投稿、判定根拠、イベント登録、Discord通知を確認します。保留は不足情報を補って解決できます。'
      actions={
        <>
          <Button variant='outline' asChild>
            <Link to='/admin/webhooks'>
              <ArrowLeft className='size-4' />
              受信履歴
            </Link>
          </Button>
          <Button variant='outline' onClick={() => jobQuery.refetch()} disabled={jobQuery.isFetching || isPending}>
            <RefreshCw className={cn('size-4', jobQuery.isFetching && 'animate-spin')} />
            更新
          </Button>
        </>
      }
    >
      <div aria-live='polite' className='mb-4 text-sm'>
        {jobQuery.isPending && <p className='text-muted-foreground'>受信詳細を取得しています。</p>}
        {jobQuery.isError && (
          <p className='text-destructive'>受信詳細を取得できませんでした。更新から再試行できます。</p>
        )}
      </div>
      <div className='mb-6 flex flex-wrap gap-2 border-b pb-5'>
        <Button
          className='bg-brand text-brand-foreground hover:bg-brand/90'
          onClick={() => setShowForm((current) => !current)}
          disabled={!availability.canResolve || isPending}
        >
          <FilePlus2 className='size-4' />
          補完して登録
        </Button>
        <Button variant='outline' onClick={() => setLinkOpen(true)} disabled={!availability.canResolve || isPending}>
          <Link2 className='size-4' />
          既存へ紐付け
        </Button>
        <Button
          variant='outline'
          onClick={() => setConfirmAction('reject')}
          disabled={!availability.canResolve || isPending}
        >
          <X className='size-4' />
          対象外にする
        </Button>
        <Button
          variant='outline'
          onClick={() => setConfirmAction('processing')}
          disabled={!availability.canRetryProcessing || isPending}
        >
          <RotateCcw className='size-4' />
          判定を再試行
        </Button>
        <Button
          variant='outline'
          onClick={() => setConfirmAction('notification')}
          disabled={!availability.canRetryNotification || isPending}
        >
          <Send className='size-4' />
          通知を再送
        </Button>
      </div>
      {job && (
        <div className='space-y-8'>
          <section>
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
            <p className='mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed'>{job.post.text}</p>
            <p className='mt-3 text-xs text-muted-foreground'>
              投稿日: {dayjs(job.post.createdAt).format('YYYY/MM/DD HH:mm:ss')}
            </p>
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
                      <li key={reason} className='break-words'>
                        {reason}
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
                  <Link to='/admin/events/$uuid' params={{ uuid: job.eventId }} className='hover:underline'>
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
          {showForm && availability.canResolve && (
            <section className='border-t pt-6'>
              <h2 className='mb-2 text-lg font-semibold md:text-xl'>不足情報を補完</h2>
              <p className='mb-5 text-sm text-muted-foreground'>
                元投稿を確認し、必要な情報を入力してください。この操作ではXに投稿しません。
              </p>
              <EventForm
                key={job.postId}
                allowTweet={false}
                defaultValues={
                  job.candidate
                    ? { ...job.candidate, shouldTweet: false }
                    : {
                        uuid: job.eventUUID,
                        isVerified: true,
                        isPreliminary: false,
                        shouldTweet: false,
                        referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: job.sourceUrl }]
                      }
                }
                onSubmitPayload={register}
              />
            </section>
          )}
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
            <Button variant='outline' onClick={() => setLinkOpen(false)} disabled={isPending}>
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

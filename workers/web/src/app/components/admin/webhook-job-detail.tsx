import type { DetectionThresholds } from '@biccame/shared/event-detect/detection'
import type { EventRequestQuery } from '@biccame/shared/schemas/event.dto'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ExternalLink, FilePlus2, Pencil, RefreshCw, Send, X } from 'lucide-react'
import { useState } from 'react'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import { BotSettingRow, BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { WebhookCandidateList } from '@/components/admin/webhook-candidate-list'
import { WebhookDiscoveryPanel } from '@/components/admin/webhook-discovery-panel'
import { WebhookEventLinkDialog } from '@/components/admin/webhook-event-link-dialog'
import { webhookEventCreateSearch } from '@/components/admin/webhook-form-defaults'
import {
  isWebhookJobJudging,
  notificationRetryWarning,
  REJUDGE_DESCRIPTION,
  rejudgeConfirmation,
  webhookActionAvailability
} from '@/components/admin/webhook-labels'
import { WebhookPromptDialog } from '@/components/admin/webhook-prompt-dialog'
import { WebhookReasonRows } from '@/components/admin/webhook-reason-rows'
import { WebhookStatusBadge } from '@/components/admin/webhook-status-badge'
import { Button } from '@/components/ui/button'
import { useAdminBotStatus } from '@/hooks/use-admin-bot'
import {
  useAdminWebhookJob,
  useRejudgeAdminWebhookJob,
  useResolveAdminWebhookJob,
  useRetryAdminWebhookJob
} from '@/hooks/use-admin-webhooks'
import { cn } from '@/lib/utils'

type ConfirmAction = 'notification' | 'reject' | 'rejudge'

const CONFIRM_TITLES: Record<ConfirmAction, string> = {
  notification: 'Discord通知を再送しますか？',
  reject: 'この投稿を対象外にしますか？',
  rejudge: '再実行しますか？'
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
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)
  const parentJob = jobQuery.data
  const selected = parentJob?.candidates.find((candidate) => candidate.eventUUID === selectedCandidate)
  const firstDetected = parentJob?.candidates.find((candidate) => candidate.discovery?.relevance === 'detected')
  const active =
    selected === undefined ? (firstDetected === undefined ? parentJob?.candidates[0] : firstDetected) : selected
  const job = active === undefined ? parentJob : { ...active, candidates: [] }
  const candidateSelection = active === undefined ? {} : { candidateId: active.eventUUID }
  // 回答に店舗・ビッカメ娘の質問が無い旧版の保存データでも表に出せるよう、判定結果（登録候補、無ければ下書き）の関連先を渡す。
  const outcome =
    job === undefined
      ? undefined
      : job.candidate === null
        ? job.draft === null
          ? undefined
          : job.draft
        : job.candidate
  // 選択中の候補の登録候補・下書きを作成ページの初期値にする。読み込み中は初期値なしでリンクだけ出す。
  // 作成したイベントはこの受信ジョブ（複数候補なら選択中の候補）へ自動で紐付ける。紐付け先を渡すかどうかは保留の状態かで決まる。
  const createSearch: EventRequestQuery =
    job === undefined
      ? {}
      : webhookEventCreateSearch(job, {
          link: { postId, ...candidateSelection },
          ...(active === undefined ? {} : { item: active.item })
        })
  const isPending = retry.isPending || resolve.isPending || rejudge.isPending
  const availability = job
    ? webhookActionAvailability(job.status, job.notificationStatus, job.reasons)
    : {
        canResolve: false,
        canLink: false,
        canRejudge: false,
        canRetryNotification: false
      }

  // 「再実行」は状態によらず押せて、押すと必ず確認が出る。実行できない状態（人の却下・処理中など）は、
  // 確認の説明に理由を出して実行ボタンを無効にする。可否の規則はサーバーの 409 と同じ（rejudgeBlockedReason）。
  // 自動登録済みも実行できる。その説明は、登録とDiscord通知を変えず、現在の設定で回答と判定結果だけを更新すると伝える（rejudgeConfirmation）。
  const rejudgeState = job === undefined ? undefined : rejudgeConfirmation(job.status, job.reasons)
  const rejudgeBlocked = rejudgeState === undefined || rejudgeState.blocked

  const confirm = async () => {
    if (!job || !confirmAction) return
    // 実行できない状態では何もせず閉じる（連打やダイアログを経由しない呼び出しでも、サーバーの 409 に頼らない）。
    if (confirmAction === 'rejudge' && rejudgeBlocked) {
      setConfirmAction(null)
      return
    }
    try {
      if (confirmAction === 'reject') {
        await resolve.mutateAsync({ postId, data: { action: 'reject', ...candidateSelection } })
      } else if (confirmAction === 'rejudge') {
        await rejudge.mutateAsync({ postId, ...candidateSelection })
      } else {
        // 残る確認は通知の再送だけ。処理の再実行は「再実行」（rejudge）が担う。
        await retry.mutateAsync({
          postId,
          data: {
            ...candidateSelection,
            notificationOnly: true,
            allowUnknown: job.notificationStatus === 'unknown'
          }
        })
      }
      setConfirmAction(null)
    } catch {
      // mutationが失敗を表示する。再操作には改めて確認が必要。
    }
  }

  const confirmDescription =
    confirmAction === 'notification' && job
      ? notificationRetryWarning(job.notificationStatus)
      : confirmAction === 'reject'
        ? 'この投稿はイベント登録せず、対象外として保存します。既存イベントは変更しません。'
        : rejudgeState === undefined
          ? REJUDGE_DESCRIPTION
          : rejudgeState.description

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
      <div className='mb-6 flex flex-wrap gap-2'>
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
        <WebhookEventLinkDialog
          key={`${postId}:${active === undefined ? 'post' : active.eventUUID}`}
          disabled={!availability.canLink}
          isPending={isPending}
          replacing={job !== undefined && job.status === 'registered'}
          onLink={async (eventId) =>
            await resolve.mutateAsync({ postId, data: { ...candidateSelection, action: 'link', eventId } })
          }
        />
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
          onClick={() => setConfirmAction('rejudge')}
          // 状態では無効にしない。受信詳細を取得できていない間（job が無い間）だけは、確認で状態を示せず実行もできないため押せなくする。
          disabled={job === undefined || isPending}
          title='押すと確認が出ます'
        >
          <RefreshCw className='size-4' />
          再実行
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
          <WebhookDiscoveryPanel job={job} />
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
              <WebhookCandidateList
                candidates={parentJob.candidates}
                activeId={active?.eventUUID}
                isPending={isPending}
                onSelect={(id) => {
                  setSelectedCandidate(id)
                  setConfirmAction(null)
                }}
              />
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
              <WebhookAnswerTable
                answers={job.answers}
                thresholds={thresholds}
                stores={outcome === undefined ? [] : outcome.stores}
                characterIds={outcome === undefined ? [] : outcome.characterIds}
                itemCountAudit={parentJob?.itemCountAudit}
              />
            )}
          </section>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>判定・イベント登録</h2>
            <dl>
              <BotSettingRow label='判定状態'>
                <WebhookStatusBadge status={job.status} />
              </BotSettingRow>
              <BotSettingRow label='判定モデル'>{job.model ? job.model : '未判定'}</BotSettingRow>
              <BotSettingRow label='プロンプトバージョン'>
                <WebhookPromptDialog
                  key={`${postId}:${active === undefined ? 'post' : active.eventUUID}`}
                  postId={postId}
                  candidateId={active?.eventUUID}
                  questionVersion={job.questionVersion}
                />
              </BotSettingRow>
              <WebhookReasonRows reasons={job.reasons} />
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
        actionDisabled={confirmAction === 'rejudge' && rejudgeBlocked}
        onConfirm={confirm}
      />
    </BotSettingsLayout>
  )
}

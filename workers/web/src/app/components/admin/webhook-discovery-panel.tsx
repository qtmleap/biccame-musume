import { judgmentReasons, reasonLabel } from '@biccame/shared/event-detect/answer-view'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { Link } from '@tanstack/react-router'
import { BotSettingRow } from '@/components/admin/bot-settings-layout'
import {
  webhookDiscoveryActionLabel,
  webhookDiscoveryEvidenceLabel,
  webhookDiscoveryLabel,
  webhookMissingFieldLabel
} from '@/components/admin/webhook-discovery-labels'
import { detectionScoreLabel, webhookJobLabel } from '@/components/admin/webhook-labels'

/** 元告知への返信・引用から見つかった登録済みイベント。検出の記録とは無関係なので、単独でも描画できる。 */
const RelatedEvents = ({ job, className }: { job: WebhookJob; className?: string }) => {
  const related = job.relatedEvents
  if (related === undefined || related === null || related.events.length === 0) return null
  return (
    <div className={className}>
      <h3 className='font-semibold'>元告知に対応する登録済みイベント</h3>
      <p className='mt-1 text-sm text-muted-foreground'>
        参照投稿の一致だけで提案しています。イベント本体は自動更新しません。
      </p>
      <ul className='mt-2 space-y-2'>
        {related.events.map((event) => (
          <li key={event.eventId} className='flex items-center gap-2'>
            <Link
              to='/admin/events/$uuid/edit'
              params={{ uuid: event.eventId }}
              className='text-brand underline underline-offset-4'
            >
              {event.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const WebhookDiscoveryPanel = ({ job }: { job: WebhookJob }) => {
  const discovery = job.discovery
  // 検出の記録が無い古い履歴では、検出と登録可否のパネルは出さず、元告知に対応するイベントだけを出す。
  if (discovery === undefined || discovery === null) return <RelatedEvents job={job} />
  // 店舗の補完・タイトルの作成など画面に出さない情報用のコードは、判定の理由ではないので除く。
  const registrationReasons = judgmentReasons(discovery.reasons)
  return (
    <section aria-label='検出と登録可否'>
      <h2 className='mb-2 text-lg font-semibold md:text-xl'>検出と登録可否</h2>
      <p className='mb-3 text-sm text-muted-foreground'>
        検出済みでも、未発表の情報や既存イベントの更新は自動で新規登録しません。
      </p>
      <dl>
        <BotSettingRow label='検出結果'>{webhookDiscoveryLabel(discovery)}</BotSettingRow>
        <BotSettingRow label='登録処理'>{webhookJobLabel(job.status)}</BotSettingRow>
        <BotSettingRow label='判定時の提案'>{webhookDiscoveryActionLabel(discovery.action)}</BotSettingRow>
        {(discovery.action === 'update' || discovery.action === 'end') && (
          <BotSettingRow label='更新・終了の連携先'>
            {job.eventId !== null ? '連携済み' : '未確認（参照候補を確認するか、連携先を選択してください）'}
          </BotSettingRow>
        )}
        <BotSettingRow label='AIイベント判定の確信度'>
          <div className='flex items-center'>
            <span className='font-mono tabular-nums leading-[0]'>{detectionScoreLabel(discovery.confidence)}</span>
          </div>
        </BotSettingRow>
        <BotSettingRow label='判定時の不足・未確定'>
          {discovery.missingFields.length === 0
            ? 'なし'
            : discovery.missingFields.map(webhookMissingFieldLabel).join('、')}
        </BotSettingRow>
        <BotSettingRow label='検出の根拠'>
          {discovery.evidence.length === 0 ? (
            '記録なし'
          ) : (
            <ul className='space-y-1 break-words'>
              {discovery.evidence.map((evidence) => (
                <li key={evidence}>{webhookDiscoveryEvidenceLabel(evidence)}</li>
              ))}
            </ul>
          )}
        </BotSettingRow>
        <BotSettingRow label='判定時の登録理由'>
          {registrationReasons.length === 0
            ? 'なし'
            : registrationReasons
                .map((reason) =>
                  reason === 'not_distribution_event'
                    ? 'AIのイベント判定は対象外（本文の根拠による検出判定とは別）'
                    : reasonLabel(reason)
                )
                .join('、')}
        </BotSettingRow>
      </dl>
      <RelatedEvents job={job} className='mt-4' />
    </section>
  )
}

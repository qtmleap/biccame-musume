import { judgmentReasons, reasonLabel } from '@biccame/shared/event-detect/answer-view'
import { BotSettingRow } from '@/components/admin/bot-settings-layout'

const ReasonList = ({ reasons }: { reasons: readonly string[] }) => (
  <ul className='space-y-1'>
    {reasons.map((reason) => (
      <li key={reason} className='break-words' title={reason}>
        {reasonLabel(reason)}
      </li>
    ))}
  </ul>
)

/**
 * 受信詳細の「判定理由」の行。
 * 保存した理由コードはそのままで、表示では判定の理由だけを出す。店舗の補完やタイトルの作成など、画面には出さない情報用のコードは除く。
 */
export const WebhookReasonRows = ({ reasons }: { reasons: readonly string[] }) => {
  const judgment = judgmentReasons(reasons)
  return (
    <BotSettingRow label='判定理由'>
      {judgment.length > 0 ? <ReasonList reasons={judgment} /> : '理由の記録なし'}
    </BotSettingRow>
  )
}

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
 * 自動登録できなかったことだけを示す auto_registration_not_allowed は、具体的な理由が併記されるときは除き、それだけのときは残す。
 * 二段組の「判定・イベント登録」の中で両列にまたがらせられるよう、行の className を受け取る。
 */
export const WebhookReasonRows = ({ reasons, className }: { reasons: readonly string[]; className?: string }) => {
  const judgment = judgmentReasons(reasons)
  return (
    <BotSettingRow label='判定理由' className={className}>
      {judgment.length > 0 ? <ReasonList reasons={judgment} /> : '理由の記録なし'}
    </BotSettingRow>
  )
}

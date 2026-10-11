import type { DiscordDeliveryResult, DiscordStatus } from '@biccame/shared/bot'
import { type ClefModel, ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CheckCircle2, Inbox, RefreshCw, Send, XCircle } from 'lucide-react'
import { useState } from 'react'
import { BotActionConfirmation } from '@/components/admin/bot-action-confirmation'
import { BotSettingRow, BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import { detectionScoreLabel } from '@/components/admin/webhook-labels'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useAdminBotConfiguration,
  useAdminBotConnection,
  useAdminBotStatus,
  useAdminBotTest
} from '@/hooks/use-admin-bot'
import { cn } from '@/lib/utils'

const CONNECTION_LABELS: Record<DiscordStatus['connection'], string> = {
  unchecked: '未確認（接続確認を押してください）',
  unconfigured: '未設定または形式不正',
  connected: '認証・チャンネルアクセス成功',
  authentication: 'Discord認証失敗',
  authorization: 'チャンネルへのアクセス不可',
  rate_limit: 'Discordのレート制限',
  network: '通信失敗',
  upstream: 'Discord側の障害',
  unexpected_response: '応答を確認できません'
}

const CONFIGURATION_LABELS: Record<DiscordStatus['settings']['token'], string> = {
  valid: '設定済み',
  missing: '未設定',
  invalid: '形式不正'
}

const PERMISSION_LABELS: Record<DiscordStatus['sendPermission'], string> = {
  unknown: '未確認（チャンネルを読めても、送信できるとは限りません）',
  allowed: '権限あり（実際の送信はテストで確認してください）',
  denied: '送信権限なし'
}

const SettingStatus = ({ success, label }: { success: boolean; label: string }) => (
  <span className={cn('inline-flex items-center gap-2', success && 'text-status-ongoing-foreground')}>
    {success && <CheckCircle2 className='size-4' aria-hidden='true' />}
    {label}
  </span>
)

const SettingFlag = ({ enabled, configured = false }: { enabled: boolean; configured?: boolean }) => {
  if (configured) {
    return <SettingStatus success={enabled} label={enabled ? '設定済み' : '未設定'} />
  }
  return (
    <span className={cn('inline-flex items-center gap-2', enabled ? 'text-foreground' : 'text-muted-foreground')}>
      {enabled ? (
        <CheckCircle2 className='size-4' aria-hidden='true' />
      ) : (
        <XCircle className='size-4' aria-hidden='true' />
      )}
      {enabled ? '有効' : '無効'}
    </span>
  )
}

const TestResult = ({ result }: { result: DiscordDeliveryResult }) => {
  if (result.status === 'sent') {
    return <p className='text-sm'>テスト送信成功 · メッセージID: {result.messageId}</p>
  }
  if (result.status === 'unknown') {
    return (
      <p className='text-sm text-destructive'>
        送信結果不明です。Discordに届いている可能性があるため、自動では再送しません。
      </p>
    )
  }
  return <p className='text-sm text-destructive'>テスト送信失敗: {result.kind}</p>
}

export const BotManagement = () => {
  const status = useAdminBotStatus()
  const test = useAdminBotTest()
  const connection = useAdminBotConnection()
  const configuration = useAdminBotConfiguration()
  const [selectedModel, setSelectedModel] = useState<ClefModel | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const currentModel = status.data?.webhook.model
  const discord = status.data?.discord
  const canTest =
    status.data?.botConnected === true &&
    discord !== null &&
    discord !== undefined &&
    discord.configured.token &&
    discord.configured.channel &&
    discord.sendPermission !== 'denied'

  const sendTest = async () => {
    try {
      await test.mutateAsync()
      setConfirmOpen(false)
    } catch {
      // 送信失敗はmutationの通知に任せ、確認画面を維持する。
    }
  }

  return (
    <BotSettingsLayout
      title='Bot 設定・接続状態'
      description='Discord通知とWebhook自動登録の設定を確認します。シークレットの値は表示しません。'
      actions={
        <>
          <Button
            variant='outline'
            onClick={() => connection.mutate()}
            disabled={status.isFetching || connection.isPending || test.isPending}
          >
            <RefreshCw className={cn('size-4', connection.isPending && 'animate-spin')} />
            接続確認
          </Button>
          <Button
            className='bg-brand text-brand-foreground hover:bg-brand/90'
            onClick={() => setConfirmOpen(true)}
            disabled={!canTest || connection.isPending || test.isPending}
          >
            <Send className='size-4' />
            送信テスト
          </Button>
        </>
      }
    >
      <div aria-live='polite' className='mb-5 text-sm'>
        {status.isPending && <p className='text-muted-foreground'>設定を取得しています。</p>}
        {status.isError && <p className='text-destructive'>設定を取得できませんでした。接続確認から再試行できます。</p>}
        {status.data && (
          <p className='text-muted-foreground'>
            設定取得: {dayjs(status.data.fetchedAt).format('YYYY/MM/DD HH:mm:ss')}
          </p>
        )}
        {test.data && (
          <div className='mt-2'>
            <TestResult result={test.data} />
          </div>
        )}
      </div>
      {status.data && (
        <div className='space-y-8'>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>Bot 接続</h2>
            <dl>
              <BotSettingRow label='Service Binding'>
                <SettingFlag enabled={status.data.botConnected} configured />
              </BotSettingRow>
              <BotSettingRow label='Discord Token'>
                {discord ? (
                  <SettingStatus
                    success={discord.settings.token === 'valid'}
                    label={CONFIGURATION_LABELS[discord.settings.token]}
                  />
                ) : (
                  '設定を取得できない'
                )}
              </BotSettingRow>
              <BotSettingRow label='通知先チャンネル設定'>
                {discord ? (
                  <SettingStatus
                    success={discord.settings.channel === 'valid'}
                    label={CONFIGURATION_LABELS[discord.settings.channel]}
                  />
                ) : (
                  '設定を取得できない'
                )}
              </BotSettingRow>
              <BotSettingRow label='Discord 接続状態'>
                {connection.isPending ? (
                  '接続を確認しています。'
                ) : discord ? (
                  <SettingStatus
                    success={discord.connection === 'connected'}
                    label={CONNECTION_LABELS[discord.connection]}
                  />
                ) : (
                  '設定を取得できない'
                )}
              </BotSettingRow>
              <BotSettingRow label='前回の確認'>
                {discord && discord.connection !== 'unchecked' && discord.connection !== 'unconfigured'
                  ? dayjs(discord.fetchedAt).format('YYYY/MM/DD HH:mm:ss')
                  : '未確認'}
              </BotSettingRow>
              <BotSettingRow label='Bot アカウント'>
                {discord?.bot ? `${discord.bot.username} (${discord.bot.id})` : '未確認'}
              </BotSettingRow>
              <BotSettingRow label='通知先チャンネル'>
                {discord?.channel ? `${discord.channel.name} (${discord.channel.id})` : '未確認'}
              </BotSettingRow>
              <BotSettingRow label='送信権限'>
                {discord ? (
                  <SettingStatus
                    success={discord.sendPermission === 'allowed'}
                    label={PERMISSION_LABELS[discord.sendPermission]}
                  />
                ) : (
                  '未確認'
                )}
              </BotSettingRow>
            </dl>
            <p className='mt-3 text-sm text-muted-foreground'>
              必要な設定はDISCORD_TOKENとDISCORD_CHANNEL_IDです。OAuthのApplication ID・Client ID・Client
              Secretは不要です。設定の形式確認では、実際の認証や接続は確認しません。
              接続状態は前回の確認結果です。現在の状態は接続確認で更新してください。
            </p>
            {status.data.error && <p className='mt-3 text-sm text-destructive'>{status.data.error}</p>}
          </section>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>機能の設定</h2>
            <dl>
              <BotSettingRow label='Discordイベント通知'>常時有効</BotSettingRow>
              <BotSettingRow label='X 投稿'>
                {discord ? <SettingFlag enabled={discord.xPostingEnabled} /> : '未確認'}
              </BotSettingRow>
              <BotSettingRow label='タイムライン通知'>
                {discord ? <SettingFlag enabled={discord.timelineNotificationsEnabled} /> : '未確認'}
              </BotSettingRow>
            </dl>
            <p className='mt-3 text-sm text-muted-foreground'>
              X投稿とタイムライン通知はWebhook受信とは別機能です。設定の変更はWorkerの設定管理から行います。
              この画面では本番X投稿を有効化しません。
            </p>
          </section>
          <section>
            <h2 className='mb-2 text-lg font-semibold md:text-xl'>Webhook 自動登録</h2>
            <dl>
              <BotSettingRow label='HMACシークレット'>
                <SettingFlag enabled={status.data.webhook.configured} configured />
              </BotSettingRow>
              <BotSettingRow label='処理Queue'>
                <SettingFlag enabled={status.data.webhook.queueConfigured} configured />
              </BotSettingRow>
              <BotSettingRow label='判定モデル' className='sm:items-center'>
                <Select
                  value={selectedModel === null ? status.data.webhook.model : selectedModel}
                  disabled={configuration.isPending}
                  onValueChange={(value) => {
                    const model = ClefModelSchema.safeParse(value)
                    if (model.success) {
                      setSelectedModel(model.data)
                      configuration.reset()
                    }
                  }}
                >
                  <SelectTrigger aria-label='判定モデル' className='w-40'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='clef'>clef</SelectItem>
                    <SelectItem value='clef-flash'>clef-flash</SelectItem>
                  </SelectContent>
                </Select>
              </BotSettingRow>
              <BotSettingRow label='イベント判定の登録閾値'>
                {detectionScoreLabel(status.data.webhook.eventThreshold)}
              </BotSettingRow>
              <BotSettingRow label='必須項目の選択閾値'>
                {detectionScoreLabel(status.data.webhook.choiceThreshold)}
              </BotSettingRow>
              <BotSettingRow label='対象外判定の閾値'>
                {detectionScoreLabel(status.data.webhook.ignoreThreshold)}
              </BotSettingRow>
            </dl>
            <p className='mt-3 text-sm leading-relaxed text-muted-foreground'>
              判定スコアは正解率を保証しません。必須情報が不足する投稿は、スコアが高くても保留になります。
            </p>
            <Button variant='outline' asChild className='mt-4'>
              <Link to='/admin/webhooks'>
                <Inbox className='size-4' />
                受信履歴
              </Link>
            </Button>
          </section>
        </div>
      )}
      <footer className='mt-8 flex justify-end border-t pt-4'>
        <Button
          className='bg-brand text-brand-foreground hover:bg-brand/90'
          disabled={
            currentModel === undefined ||
            selectedModel === null ||
            selectedModel === currentModel ||
            configuration.isPending ||
            status.isFetching ||
            connection.isPending ||
            test.isPending
          }
          onClick={() => {
            if (selectedModel !== null && selectedModel !== currentModel) {
              configuration.mutate({ model: selectedModel })
            }
          }}
        >
          {configuration.isPending ? '保存中' : '保存'}
        </Button>
      </footer>
      <BotActionConfirmation
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='Discordにテスト通知を送信しますか？'
        description='設定されている通知先チャンネルへ、確認用のメッセージを1件送信します。Xへの投稿は行いません。'
        actionLabel='送信する'
        isPending={test.isPending}
        onConfirm={sendTest}
      />
    </BotSettingsLayout>
  )
}

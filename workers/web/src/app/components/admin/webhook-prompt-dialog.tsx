import { promptVersionLabel } from '@biccame/shared/event-detect/answer-view'
import type { WebhookPrompt, WebhookPromptDefinition } from '@biccame/shared/schemas/webhook.dto'
import { FileText, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { useAdminWebhookPrompt } from '@/hooks/use-admin-webhooks'

// 表示名が保存されているIDと違うときだけ、IDを併記する（未登録のIDは表示名と同じなので重複させない）。
const PromptVersionId = ({ version }: { version: string }) =>
  promptVersionLabel(version) === version ? null : (
    <p className='break-all text-xs text-muted-foreground'>ID: {version}</p>
  )

const WebhookPromptDefinitionRecord = ({ definition }: { definition: WebhookPromptDefinition }) => (
  <section aria-label='D1に保存されたプロンプト定義' className='space-y-4'>
    <h3 className='border-b border-separator pb-2 font-semibold'>
      プロンプト定義 · {promptVersionLabel(definition.questionVersion)}
    </h3>
    <PromptVersionId version={definition.questionVersion} />
    <p className='break-words text-xs text-muted-foreground'>定義の出典：{definition.origin}</p>
    <div>
      <h4 className='mb-2 text-sm font-medium'>本文テンプレート（state）</h4>
      <pre className='whitespace-pre-wrap break-all bg-muted/40 p-3 text-xs leading-relaxed'>
        {definition.stateTemplate}
      </pre>
    </div>
    <div>
      <h4 className='mb-2 text-sm font-medium'>質問定義（questions）</h4>
      <pre className='whitespace-pre-wrap break-all bg-muted/40 p-3 text-xs leading-relaxed'>
        {JSON.stringify(definition.questions, null, 2)}
      </pre>
    </div>
    <div>
      <h4 className='mb-2 text-sm font-medium'>動的な選択肢の生成規則</h4>
      <p className='whitespace-pre-wrap break-words text-sm text-muted-foreground'>{definition.dynamicCriteria}</p>
    </div>
  </section>
)

export const WebhookPromptRecord = ({ questionVersion, requests, source, definition }: WebhookPrompt) => (
  <div className='space-y-6'>
    <div className='space-y-1'>
      <p className='text-sm text-muted-foreground'>
        プロンプトバージョン：{questionVersion === null ? '記録なし' : promptVersionLabel(questionVersion)}
      </p>
      {questionVersion !== null && <PromptVersionId version={questionVersion} />}
    </div>
    {source === 'recorded' ? (
      <p className='text-sm text-muted-foreground'>
        判定時に保存された送信試行の入力です。バッチごとの本文と質問を表示します。
      </p>
    ) : source === 'definition' ? (
      <p role='note' className='text-sm text-muted-foreground'>
        D1に保存された当該バージョンのプロンプト定義です。当時の実送信記録ではありません。投稿ごとの本文・日付などの動的な選択肢は復元していません。
      </p>
    ) : (
      <p className='text-sm text-muted-foreground'>このバージョンの送信入力・プロンプト定義は保存されていません。</p>
    )}
    {requests.map((request, index) => (
      <section key={`${index}:${request.model}`} aria-label={`バッチ${index + 1}`} className='space-y-3'>
        <h3 className='border-b border-separator pb-2 font-semibold'>
          バッチ{index + 1} · {request.model} · {Object.keys(request.questions).length}問
        </h3>
        <div>
          <h4 className='mb-2 text-sm font-medium'>入力本文（state）</h4>
          <pre className='whitespace-pre-wrap break-all bg-muted/40 p-3 text-xs leading-relaxed'>{request.state}</pre>
        </div>
        <div>
          <h4 className='mb-2 text-sm font-medium'>質問（questions）</h4>
          <pre className='whitespace-pre-wrap break-all bg-muted/40 p-3 text-xs leading-relaxed'>
            {JSON.stringify(request.questions, null, 2)}
          </pre>
        </div>
      </section>
    ))}
    {definition !== null &&
      (source === 'recorded' ? (
        <details className='border-t border-separator pt-3'>
          <summary className='cursor-pointer text-sm font-medium text-brand'>このバージョンの定義を表示</summary>
          <div className='mt-4'>
            <WebhookPromptDefinitionRecord definition={definition} />
          </div>
        </details>
      ) : (
        <WebhookPromptDefinitionRecord definition={definition} />
      ))}
  </div>
)

const WebhookPromptContent = ({ postId, candidateId }: { postId: string; candidateId?: string }) => {
  const prompt = useAdminWebhookPrompt(postId, candidateId)
  return (
    <DialogContent className='flex max-h-[85dvh] flex-col border-card-border sm:max-w-4xl'>
      <DialogHeader>
        <DialogTitle>Clefのプロンプト</DialogTitle>
        <DialogDescription>
          保存済みの送信入力と、バージョンごとのプロンプト定義を確認できます。認証情報や通信ヘッダーは含みません。
        </DialogDescription>
      </DialogHeader>
      <div className='min-h-0 overflow-y-auto'>
        {prompt.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            プロンプトを取得しています。
          </p>
        ) : prompt.isError ? (
          <div role='alert' className='space-y-3'>
            <p className='text-sm text-destructive'>プロンプトを取得できませんでした。</p>
            <Button variant='outline' className='border-card-border' onClick={() => prompt.refetch()}>
              <RefreshCw className='size-4' />
              再取得
            </Button>
          </div>
        ) : prompt.data === undefined ? (
          <p className='text-sm text-muted-foreground'>このバージョンのプロンプトは取得できませんでした。</p>
        ) : (
          <WebhookPromptRecord {...prompt.data} />
        )}
      </div>
    </DialogContent>
  )
}

export const WebhookPromptDialog = ({
  postId,
  candidateId,
  questionVersion
}: {
  postId: string
  candidateId?: string
  questionVersion: string | null
}) => {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-auto min-h-0 w-fit items-center justify-start px-0 py-0 text-brand underline underline-offset-4 hover:bg-transparent hover:text-brand/80 has-[>svg]:px-0'
          aria-label='Clefのプロンプトを表示'
          title={
            questionVersion === null
              ? '送信入力とプロンプト定義を確認'
              : `送信入力とプロンプト定義を確認 · ${questionVersion}`
          }
        >
          {questionVersion === null ? '未判定' : promptVersionLabel(questionVersion)}
          <FileText className='size-4' aria-hidden='true' />
        </Button>
      </DialogTrigger>
      {open && (
        <WebhookPromptContent
          key={`${postId}:${candidateId === undefined ? 'post' : candidateId}`}
          postId={postId}
          candidateId={candidateId}
        />
      )}
    </Dialog>
  )
}

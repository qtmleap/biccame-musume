import { describe, expect, test } from 'bun:test'
import type { WebhookCandidate, WebhookJob, WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookEventLinkBody } from '@/components/admin/webhook-event-link-dialog'
import { webhookLinkAsk } from '@/components/admin/webhook-event-link-stage'
import {
  isEndedPost,
  LINKED_EVENT_ENDED_NOTE,
  linkedEventConfirmation,
  linkedEventEffectNote
} from '@/components/admin/webhook-linked-event-confirm'
import { Dialog } from '@/components/ui/dialog'
import { REFERENCE_URL_TYPE_LABELS } from '@/locales/app.content'
import { makeJob } from './fixtures/webhook-d1-jobs'

const suggestion: WebhookLinkedEvent = {
  eventId: '550e8400-e29b-41d4-a716-446655440077',
  title: '缶バッジで繋ぐビッカメ娘旅',
  probability: 0.793
}
const TITLE = '缶バッジで繋ぐビッカメ娘旅'

/** 終了判定の投稿を連携したときの説明。参考URLへの追加・実際の終了日（日付）の書き込み・更新の投稿（X・Discord）の予約・書き込まない条件を伝える。 */
const ENDED =
  '終了ツイートのリンクを参考URLに「終了」として入れます。実際の終了日が未設定なら、この投稿の日付（日本時間）を書き込み、更新の投稿（X・Discord）を予約します（投稿が有効な環境でのみ送信されます）。投稿日が開始日より前のときは書き込みません。'
/** 終了判定以外の投稿の説明。連携しても既存イベントを変更しない。 */
const UNCHANGED = '既存イベントの内容は変更しません。'
const REPLACING = '登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'
const NON_ENDED: { postStatus: WebhookJob['postStatus'] }[] = [
  { postStatus: 'announce' },
  { postStatus: 'start' },
  { postStatus: 'ongoing' },
  { postStatus: null }
]

describe('終了判定かどうか（連携の対象にした投稿の postStatus）', () => {
  test('end だけが終了判定。告知・開始・継続・判定なしは終了判定ではない', () => {
    expect(isEndedPost({ postStatus: 'end' })).toBe(true)
    for (const { postStatus } of NON_ENDED) expect(isEndedPost({ postStatus })).toBe(false)
  })

  test('複数候補: 親ジョブの postStatus ではなく、操作の対象にした候補の postStatus で決まる', () => {
    const candidate = (postStatus: WebhookJob['postStatus']): WebhookCandidate => ({
      ...makeJob(),
      postStatus,
      item: 'ステッカー',
      storeKey: null
    })
    const parent: WebhookJob = {
      ...makeJob(),
      postStatus: 'announce',
      candidates: [candidate('end'), candidate('announce')]
    }
    const [ended, announced] = parent.candidates
    expect(isEndedPost(parent)).toBe(false)
    expect(isEndedPost(ended)).toBe(true)
    expect(isEndedPost(announced)).toBe(false)
    const endedParent: WebhookJob = { ...parent, postStatus: 'end', candidates: [candidate('announce')] }
    expect(isEndedPost(endedParent)).toBe(true)
    expect(isEndedPost(endedParent.candidates[0])).toBe(false)
  })

  test('説明は終了判定のときだけ、終了日などを書き込む旨に切り替わる', () => {
    expect(LINKED_EVENT_ENDED_NOTE).toBe(ENDED)
    expect(linkedEventEffectNote(true)).toBe(ENDED)
    expect(linkedEventEffectNote(false)).toBe(UNCHANGED)
    expect(ENDED).not.toContain('既存イベントの内容は変更しません')
  })

  test('終了判定の説明: 書き込むのは日付（日時ではない）で、X だけでなく Discord にも触れ、参考URLの種別はフォームと同じ「終了」', () => {
    expect(ENDED).not.toContain('日時')
    expect(ENDED).toContain('投稿の日付（日本時間）')
    expect(ENDED).toContain('X・Discord')
    expect(ENDED).toContain('投稿日が開始日より前のときは書き込みません。')
    expect(ENDED).toContain(`「${REFERENCE_URL_TYPE_LABELS.end}」として入れます`)
    expect(REFERENCE_URL_TYPE_LABELS.end).toBe('終了')
    expect(LINKED_EVENT_ENDED_NOTE).not.toContain('日時')
    expect(LINKED_EVENT_ENDED_NOTE.split('。').filter((sentence) => sentence !== '')).toHaveLength(3)
  })
})

describe('確認ダイアログの文言（提案から直接連携）', () => {
  test('終了判定: 既存イベントを変更しない旨は出さず、参考URLへの追加・実際の終了日・更新の投稿を伝える', () => {
    const { title, description, actionLabel } = linkedEventConfirmation(TITLE, { replacing: false, ended: true })
    expect(title).toBe('このイベントと連携しますか？')
    expect(actionLabel).toBe('連携する')
    expect(description).toBe(`「${TITLE}」と連携します。${ENDED}`)
    expect(description).not.toContain(UNCHANGED)
  })

  test('終了判定で登録済み: 置き換えの追記は従来どおり末尾に付く', () => {
    const { description } = linkedEventConfirmation(TITLE, { replacing: true, ended: true })
    expect(description).toBe(`「${TITLE}」と連携します。${ENDED}${REPLACING}`)
    expect(description).not.toContain(UNCHANGED)
  })

  test.each(NON_ENDED)('終了判定以外（postStatus: $postStatus）の文言は従来のまま', ({ postStatus }) => {
    const ended = isEndedPost({ postStatus })
    expect(linkedEventConfirmation(TITLE, { replacing: false, ended }).description).toBe(
      '「缶バッジで繋ぐビッカメ娘旅」と連携します。既存イベントの内容は変更しません。'
    )
    expect(linkedEventConfirmation(TITLE, { replacing: true, ended }).description).toBe(
      '「缶バッジで繋ぐビッカメ娘旅」と連携します。既存イベントの内容は変更しません。登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'
    )
  })
})

describe('「このイベントですか？」の段階の文言', () => {
  test('終了判定: 確率に続けて、終了日などを書き込む旨を出す。既存イベントを変更しない旨は出さない', () => {
    const ask = webhookLinkAsk(suggestion, { replacing: false, ended: true })
    expect(ask.detail).toBe(`確率 79.3%。${ENDED}`)
    expect(ask.detail).not.toContain(UNCHANGED)
    expect(webhookLinkAsk(suggestion, { replacing: true, ended: true }).detail).toBe(`確率 79.3%。${ENDED}${REPLACING}`)
  })

  test.each(NON_ENDED)('終了判定以外（postStatus: $postStatus）の文言は従来のまま', ({ postStatus }) => {
    const ended = isEndedPost({ postStatus })
    expect(webhookLinkAsk(suggestion, { replacing: false, ended }).detail).toBe(
      '確率 79.3%。既存イベントの内容は変更しません。'
    )
    expect(webhookLinkAsk(suggestion, { replacing: true, ended }).detail).toBe(
      '確率 79.3%。既存イベントの内容は変更しません。登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'
    )
  })
})

type Options = { suggestion?: WebhookLinkedEvent; replacing?: boolean; ended: boolean }

/** Dialog のコンテキストの中で、連携ダイアログの中身（提案があれば確認の段階、なければ検索の段階）を静的に描画する。 */
const renderBody = ({ suggestion: proposed, replacing = false, ended }: Options) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['admin-events'], [])
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          Dialog,
          { open: true },
          createElement(WebhookEventLinkBody, {
            ...(proposed === undefined ? {} : { suggestion: proposed }),
            disabled: false,
            isPending: false,
            replacing,
            ended,
            scope: { stores: [], postedAt: '2026-10-02T03:00:00.000Z' },
            onLink: async () => {},
            onClose: () => {}
          })
        )
      )
    )
  } finally {
    client.clear()
  }
}

describe('連携ダイアログの画面', () => {
  test('提案の確認の段階: 終了判定なら終了日などを書き込む旨、それ以外なら従来の文言', () => {
    const endedMarkup = renderBody({ suggestion, ended: true })
    expect(endedMarkup).toContain(ENDED)
    expect(endedMarkup).not.toContain(UNCHANGED)
    const markup = renderBody({ suggestion, ended: false })
    expect(markup).toContain(UNCHANGED)
    expect(markup).not.toContain('終了ツイートのリンク')
    expect(markup).not.toContain('更新の投稿')
  })

  test('検索の段階: 終了判定なら終了日などを書き込む旨、それ以外なら従来の文言。置き換えの追記は両方に付く', () => {
    const endedMarkup = renderBody({ ended: true })
    expect(endedMarkup).toContain('投稿の時点で終わっていないイベントを表示しています。')
    expect(endedMarkup).toContain(ENDED)
    expect(endedMarkup).not.toContain(UNCHANGED)
    const markup = renderBody({ ended: false })
    expect(markup).toContain(UNCHANGED)
    expect(markup).not.toContain('終了ツイートのリンク')
    for (const ended of [true, false]) expect(renderBody({ replacing: true, ended })).toContain(REPLACING)
    for (const ended of [true, false]) expect(renderBody({ ended })).not.toContain(REPLACING)
  })
})

describe('呼び出し元は、操作の対象にした候補から終了判定を決める', () => {
  const read = async (name: string) => await Bun.file(`workers/web/src/app/components/admin/${name}`).text()

  test('詳細ページ: 選択中の候補を反映した job（親ジョブではない）から決め、連携ダイアログへ渡す', async () => {
    const detail = await read('webhook-job-detail.tsx')
    expect(detail).toContain('const job = active === undefined ? parentJob : { ...active, candidates: [] }')
    expect(detail).toContain('ended={job !== undefined && isEndedPost(job)}')
    expect(detail).not.toMatch(/isEndedPost\(parentJob/)
    expect(detail).not.toMatch(/parentJob\??\.postStatus/)
    expect(detail.match(/isEndedPost\(/g)).toHaveLength(1)
  })

  test('提案の節: 受け取った job（呼び出し側が選択中の候補を渡す）から決める', async () => {
    const proposal = await read('webhook-linked-event-proposal.tsx')
    expect(proposal).toMatch(
      /linkedEventConfirmation\(proposal\.title, \{\s*replacing: job\.status === 'registered',\s*ended: isEndedPost\(job\)\s*\}\)/
    )
  })

  test('連携ダイアログ: ended を確認の段階へそのまま渡し、検索の段階は自分の説明に使う', async () => {
    const dialog = await read('webhook-event-link-dialog.tsx')
    expect(dialog).toContain('ended={props.ended}')
    expect(dialog).toContain('{linkedEventEffectNote(ended)}')
    expect(dialog).not.toContain(`${UNCHANGED}\n`)
    const confirm = await read('webhook-event-link-confirm.tsx')
    expect(confirm).toContain('webhookLinkAsk(suggestion, { replacing, ended })')
  })
})

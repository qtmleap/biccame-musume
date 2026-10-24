import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { useRef } from 'react'
import { toast } from 'sonner'
import { useResolveAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import { useCreateEvent } from '@/hooks/use-events'

/** 作成したイベントを紐付ける受信ジョブ。複数候補の投稿では candidateId が必要（単一ジョブでは付けない） */
export type WebhookLinkTarget = { postId: string; candidateId?: string }

export const WEBHOOK_LINK_FAILED_MESSAGE =
  'イベントは登録しましたが、受信履歴への紐付けに失敗しました。受信詳細の「連携」から連携してください'

type CreateThenLink = {
  /** イベントを作成する。失敗したら throw する（このときは紐付けない） */
  createEvent: (event: EventRequest) => Promise<{ uuid: string }>
  /** 作成したイベントを受信ジョブへ紐付ける。失敗したら throw する */
  linkEvent: (target: WebhookLinkTarget, eventId: string) => Promise<unknown>
}

/**
 * イベントを作成し、成功した直後に受信ジョブへ紐付ける。
 * 作成に失敗したら throw して紐付けを呼ばない（呼び出し側のフォームが再送できる状態へ戻る）。
 * 紐付けに失敗してもイベントは作成済みなので throw せず linked: false を返す（throw すると再送でイベントが二重に作られる）。
 * 紐付けには入力の uuid ではなく、作成 API が返したイベントの uuid を使う。
 */
export const createEventThenLink = async (
  deps: CreateThenLink,
  payload: EventRequest,
  target: WebhookLinkTarget
): Promise<{ linked: boolean }> => {
  const created = await deps.createEvent(payload)
  try {
    await deps.linkEvent(target, created.uuid)
    return { linked: true }
  } catch {
    return { linked: false }
  }
}

/**
 * 実行中の処理があれば、それと同じ結果を待つ（二重に始めない）。終わったら（成功でも失敗でも）次の実行を受け付ける。
 */
export const runSingleFlight = <T>(slot: { current: Promise<T> | null }, run: () => Promise<T>): Promise<T> => {
  if (slot.current !== null) return slot.current
  const running = run().finally(() => {
    slot.current = null
  })
  slot.current = running
  return running
}

/**
 * 受信詳細から開いた作成ページ用。イベントの作成に成功したら、その受信ジョブへ紐付ける（resolve の link）。
 * 紐付けに失敗したときは作成は成功のまま、エラーを表示して続行する。
 * 既存の useCreateEvent（「イベントを登録しました」）と useResolveAdminWebhookJob（「保留を解決しました」）を再利用するので、
 * 両方成功したときはトーストが 2 つ出る。EventForm の onSubmitPayload に submit を渡す。
 * 紐付け先（target）が無いとき（通常の作成）は submit も undefined で、EventForm の既定の作成に任せる。
 */
export const useCreateEventWithWebhookLink = (target: WebhookLinkTarget | undefined) => {
  const createEvent = useCreateEvent()
  const resolve = useResolveAdminWebhookJob()
  const inFlight = useRef<Promise<void> | null>(null)

  const submit =
    (linkTarget: WebhookLinkTarget) =>
    (payload: EventRequest): Promise<void> =>
      runSingleFlight(inFlight, async () => {
        const { linked } = await createEventThenLink(
          {
            createEvent: createEvent.mutateAsync,
            linkEvent: (destination, eventId) =>
              resolve.mutateAsync({
                postId: destination.postId,
                data: {
                  action: 'link',
                  eventId,
                  ...(destination.candidateId === undefined ? {} : { candidateId: destination.candidateId })
                }
              })
          },
          payload,
          linkTarget
        )
        if (!linked) toast.error(WEBHOOK_LINK_FAILED_MESSAGE)
      })

  return { submit: target === undefined ? undefined : submit(target) }
}

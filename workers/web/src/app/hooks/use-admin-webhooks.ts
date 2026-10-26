import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useRef } from 'react'
import { toast } from 'sonner'
import type { WebhookFilter } from '@/atoms/webhook-filter-atom'
import { type WebhookJobPollWindow, webhookJobPoll } from '@/components/admin/webhook-labels'
import { client } from '@/utils/client'

export const ADMIN_WEBHOOK_QUERY_KEY = ['admin', 'webhooks'] as const
export const WEBHOOK_PAGE_SIZE = 25

/** 絞り込み・並べ替えの値を API のクエリにする。null（指定なし）は送らない。 */
const webhookJobQueries = (cursor: string | null, filter: WebhookFilter) => ({
  limit: WEBHOOK_PAGE_SIZE,
  screenName: filter.screenName === null ? undefined : filter.screenName,
  discovery: filter.discovery === null ? undefined : filter.discovery,
  cursor: cursor === null ? undefined : cursor,
  range: filter.range === null ? undefined : filter.range,
  sort: filter.sort,
  order: filter.order,
  verdict: filter.verdict === null ? undefined : filter.verdict,
  postStatus: filter.postStatus === null ? undefined : filter.postStatus
})

/** 一覧のクエリキー。条件ごとに別のキャッシュにする（cursor は条件ごとの並びの続きなので、条件が違えば使い回せない）。 */
export const webhookJobListQueryKey = (cursor: string | null, filter: WebhookFilter) =>
  [...ADMIN_WEBHOOK_QUERY_KEY, 'list', cursor, filter] as const

export const useAdminWebhookJobs = (cursor: string | null, filter: WebhookFilter) =>
  useQuery({
    queryKey: webhookJobListQueryKey(cursor, filter),
    queryFn: () => client.listAdminWebhookJobs({ queries: webhookJobQueries(cursor, filter) }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    networkMode: 'always',
    meta: { persist: false },
    refetchOnWindowFocus: false
  })

/**
 * 受信詳細。再判定や通知待ちのように結果がまだ動いている間だけ、約2秒ごとに再取得する。
 * 進行中でなくなれば自動で止まり、進行中のまま約3分続いたら諦める（再取得は手動更新・再読み込み・invalidate で行う）。
 * 再取得に失敗しても TanStack Query は直前のデータを残す。
 */
export const useAdminWebhookJob = (postId: string) => {
  // 進行中の状態が始まった時刻。進行中でなくなったら null に戻し、次の進行中でまた3分使えるようにする。
  const pollWindow = useRef<WebhookJobPollWindow | null>(null)
  return useQuery({
    queryKey: [...ADMIN_WEBHOOK_QUERY_KEY, postId],
    queryFn: () => client.getAdminWebhookJob({ params: { postId } }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    networkMode: 'always',
    meta: { persist: false },
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const poll = webhookJobPoll(pollWindow.current, query.state.data, dayjs().valueOf())
      pollWindow.current = poll.window
      return poll.interval
    }
  })
}

/** 実送信記録は大きいため、プロンプトダイアログを開いたときだけ取得し永続キャッシュに入れない。 */
export const useAdminWebhookPrompt = (postId: string, candidateId?: string) =>
  useQuery({
    queryKey: [...ADMIN_WEBHOOK_QUERY_KEY, postId, 'prompt', candidateId === undefined ? null : candidateId],
    queryFn: () => client.getAdminWebhookPrompt({ params: { postId }, queries: { candidateId } }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    networkMode: 'always',
    meta: { persist: false }
  })

/** 画面から呼ぶのは「通知を再送」だけ。「再実行」（useRejudgeAdminWebhookJob）と同じトーストにならないよう、通知の再送と分かる文言にする。 */
export const useRetryAdminWebhookJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, data }: { postId: string; data: Parameters<typeof client.retryAdminWebhookJob>[0] }) =>
      client.retryAdminWebhookJob(data, { params: { postId } }),
    retry: false,
    onSuccess: async () => {
      toast.success('通知の再送を受け付けました')
      await queryClient.invalidateQueries({ queryKey: ADMIN_WEBHOOK_QUERY_KEY })
    },
    onError: () => toast.error('通知の再送を受け付けられませんでした')
  })
}

/** 「再実行」。保存済みの回答と判定結果を消して queued に戻し、AI で最初から判定し直す。 */
export const useRejudgeAdminWebhookJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, candidateId }: { postId: string; candidateId?: string }) =>
      client.rejudgeAdminWebhookJob(undefined, { params: { postId }, queries: { candidateId } }),
    retry: false,
    onSuccess: async () => {
      toast.success('再実行を受け付けました')
      await queryClient.invalidateQueries({ queryKey: ADMIN_WEBHOOK_QUERY_KEY })
    },
    onError: () => toast.error('再実行を受け付けられませんでした')
  })
}

export const useResolveAdminWebhookJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, data }: { postId: string; data: Parameters<typeof client.resolveAdminWebhookJob>[0] }) =>
      client.resolveAdminWebhookJob(data, { params: { postId } }),
    retry: false,
    onSuccess: async () => {
      toast.success('保留を解決しました')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_WEBHOOK_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      ])
    },
    onError: () => toast.error('保留を解決できませんでした')
  })
}

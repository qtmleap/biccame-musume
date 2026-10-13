import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/utils/client'

export const ADMIN_WEBHOOK_QUERY_KEY = ['admin', 'webhooks'] as const
export const WEBHOOK_PAGE_SIZE = 25

export const useAdminWebhookJobs = (cursor: string | null) =>
  useQuery({
    queryKey: [...ADMIN_WEBHOOK_QUERY_KEY, 'list', cursor],
    queryFn: () =>
      client.listAdminWebhookJobs({
        queries: { limit: WEBHOOK_PAGE_SIZE, cursor: cursor === null ? undefined : cursor }
      }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    networkMode: 'always',
    meta: { persist: false },
    refetchOnWindowFocus: false
  })

export const useAdminWebhookJob = (postId: string) =>
  useQuery({
    queryKey: [...ADMIN_WEBHOOK_QUERY_KEY, postId],
    queryFn: () => client.getAdminWebhookJob({ params: { postId } }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    networkMode: 'always',
    meta: { persist: false },
    refetchOnWindowFocus: false
  })

export const useRetryAdminWebhookJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, data }: { postId: string; data: Parameters<typeof client.retryAdminWebhookJob>[0] }) =>
      client.retryAdminWebhookJob(data, { params: { postId } }),
    retry: false,
    onSuccess: async () => {
      toast.success('再試行を受け付けました')
      await queryClient.invalidateQueries({ queryKey: ADMIN_WEBHOOK_QUERY_KEY })
    },
    onError: () => toast.error('再試行を受け付けられませんでした')
  })
}

export const useRejudgeAdminWebhookJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ postId }: { postId: string }) => client.rejudgeAdminWebhookJob(undefined, { params: { postId } }),
    retry: false,
    onSuccess: async () => {
      toast.success('再判定を受け付けました')
      await queryClient.invalidateQueries({ queryKey: ADMIN_WEBHOOK_QUERY_KEY })
    },
    onError: () => toast.error('再判定を受け付けられませんでした')
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

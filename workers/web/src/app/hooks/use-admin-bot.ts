import type { AdminBotConfigurationRequest, AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { restoreDiscordConnection, saveDiscordConnection } from '@/hooks/discord-connection-cache'
import { client } from '@/utils/client'

export const ADMIN_BOT_QUERY_KEY = ['admin', 'bot', 'status'] as const

export const useAdminBotStatus = () =>
  useQuery({
    queryKey: ADMIN_BOT_QUERY_KEY,
    queryFn: async () => restoreDiscordConnection(await client.getAdminBotStatus()),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    networkMode: 'always',
    meta: { persist: false },
    refetchOnWindowFocus: false
  })

export const useAdminBotTest = () =>
  useMutation({
    mutationFn: () => client.testAdminBotNotification({ requestId: crypto.randomUUID() }),
    retry: false,
    onError: () => toast.error('テスト送信に失敗しました。接続状態を確認してください')
  })

export const useAdminBotConnection = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => client.checkAdminBotConnection(undefined),
    retry: false,
    onSuccess: (result) => {
      saveDiscordConnection(result)
      queryClient.setQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY, (status) =>
        status ? { ...result, webhook: { ...result.webhook, model: status.webhook.model } } : result
      )
    },
    onError: () => toast.error('接続状態を取得できませんでした')
  })
}

export const useAdminBotConfiguration = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (configuration: AdminBotConfigurationRequest) => client.saveAdminBotConfiguration(configuration),
    retry: false,
    onSuccess: (configuration) => {
      queryClient.setQueryData<AdminBotStatus>(ADMIN_BOT_QUERY_KEY, (status) =>
        status ? { ...status, webhook: { ...status.webhook, model: configuration.model } } : status
      )
      toast.success('保存しました')
    },
    onError: () => toast.error('保存できませんでした')
  })
}

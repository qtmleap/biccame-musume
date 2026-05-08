import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 管理者向け: 登録ユーザー一覧を取得
 */
export const useAdminUsers = () => {
  return useSuspenseQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => client.getAdminUsers(),
    staleTime: 0
  })
}

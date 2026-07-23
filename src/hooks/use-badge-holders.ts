import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 指定バッジの獲得者一覧を取得。
 * 呼び出し元は Dialog の内側（open 時のみマウント）で使うことを前提に、
 * enabled 制御は不要で useSuspenseQuery を採用する。
 */
export const useBadgeHolders = (code: string) => {
  return useSuspenseQuery({
    queryKey: ['badges', code, 'holders'],
    queryFn: () => client.getBadgeHolders({ params: { code } }),
    staleTime: 60 * 1000
  })
}

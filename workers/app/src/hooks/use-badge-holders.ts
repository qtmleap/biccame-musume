import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * 指定バッジの獲得人数を取得（公開API、個人情報を含まない）。
 * 呼び出し元は Dialog の内側（open 時のみマウント）で使うことを前提に、
 * enabled 制御は不要で useSuspenseQuery を採用する。
 */
export const useBadgeHoldersCount = (code: string) => {
  return useSuspenseQuery({
    queryKey: ['badges', code, 'holders-count'],
    queryFn: () => client.getBadgeHoldersCount({ params: { code } }),
    staleTime: 60 * 1000
  })
}

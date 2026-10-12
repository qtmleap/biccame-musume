import { useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

/**
 * キャラクター一覧取得用のクエリキー
 */
export const charactersQueryKey = ['characters'] as const

/**
 * キャラクター一覧を取得するカスタムフック
 * Suspenseと連携して使用
 */
export const useCharacters = () => {
  return useSuspenseQuery({
    queryKey: charactersQueryKey,
    queryFn: () => client.getCharacters(),
    staleTime: 1000 * 60 * 5 // 5分間キャッシュ
  })
}

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { client } from '@/utils/client'

const queryKey = ['me', 'favorites']

/**
 * お気に入りキャラクター取得・操作カスタムフック
 * - 呼び出し側はログイン済みであることを保証する責務（未ログインで呼ぶと Suspense throw）
 * - 上位は <Suspense fallback={...}> 境界で囲むこと
 */
export const useFavorites = () => {
  const queryClient = useQueryClient()

  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: () => client.getFavoriteCharacters()
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const addFavorite = useMutation({
    mutationFn: (characterId: string) => client.addFavoriteCharacter(undefined, { params: { characterId } }),
    onSuccess: invalidate
  })

  const removeFavorite = useMutation({
    mutationFn: (characterId: string) => client.removeFavoriteCharacter(undefined, { params: { characterId } }),
    onSuccess: invalidate
  })

  return {
    favorites: data.favorites,
    isFavorite: (characterId: string) => data.favorites.includes(characterId),
    addFavorite: addFavorite.mutate,
    removeFavorite: removeFavorite.mutate,
    isAddPending: addFavorite.isPending,
    isRemovePending: removeFavorite.isPending
  }
}

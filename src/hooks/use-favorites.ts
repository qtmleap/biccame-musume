import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useAccountMutation } from '@/hooks/use-account-mutation'
import { useAuth } from '@/hooks/use-auth'
import { userQueryKeys } from '@/lib/user-query-keys'
import { client } from '@/utils/client'

/**
 * お気に入りキャラクター取得・操作カスタムフック
 * - 呼び出し側はログイン済みであることを保証する責務（未ログインで呼ぶと Suspense throw）
 * - 上位は <Suspense fallback={...}> 境界で囲むこと
 */
export const useFavorites = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const queryKey = userQueryKeys.favorites(user === null ? '' : user.uid)

  const { data } = useSuspenseQuery({
    queryKey,
    meta: { persist: false },
    queryFn: () => client.getFavoriteCharacters()
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const addFavorite = useAccountMutation('add-favorite', {
    mutationFn: (characterId: string) => client.addFavoriteCharacter(undefined, { params: { characterId } }),
    onSuccess: invalidate
  })

  const removeFavorite = useAccountMutation('remove-favorite', {
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

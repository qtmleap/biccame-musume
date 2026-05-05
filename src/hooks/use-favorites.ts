import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { client } from '@/utils/client'

const queryKey = ['me', 'favorites']

/**
 * お気に入りキャラクター取得・操作カスタムフック
 */
export const useFavorites = () => {
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()

  const { data } = useQuery({
    queryKey,
    queryFn: () => client.getFavoriteCharacters(),
    enabled: isAuthenticated
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
    favorites: data?.favorites ?? [],
    isFavorite: (characterId: string) => data?.favorites.includes(characterId) ?? false,
    addFavorite: addFavorite.mutate,
    removeFavorite: removeFavorite.mutate,
    isAddPending: addFavorite.isPending,
    isRemovePending: removeFavorite.isPending,
    isLoaded: data !== undefined
  }
}

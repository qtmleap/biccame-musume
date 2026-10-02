export const useFavorites = () => ({
  isFavorite: (_id: string) => false,
  addFavorite: (_id: string) => {},
  removeFavorite: (_id: string) => {},
  isAddPending: false,
  isRemovePending: false
})

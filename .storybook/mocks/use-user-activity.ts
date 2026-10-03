export const useUserActivity = () => ({
  isVisited: (_id: string) => false,
  addVisitedStore: (_id: string) => {},
  isAddVisitedStorePending: false
})

// Layout-only authenticated boundary: no Firebase session or auth behavior is tested.
export const useAuth = () => ({ isAuthenticated: true, user: { uid: 'character-detail-fixture' } })

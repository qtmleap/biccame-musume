// Cookie creation and deletion must finish in order. An in-flight authentication
// request must not re-create the cookie after a successful logout.
let pendingSessionOperation: Promise<unknown> = Promise.resolve()

export const serializeSessionOperation = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = pendingSessionOperation.then(operation)
  pendingSessionOperation = result.catch(() => undefined)
  return result
}

export const establishBackendSession = (): Promise<void> => {
  // Keep the queue usable without initializing the browser-only Firebase SDK.
  const dependencies = Promise.all([import('@/lib/firebase'), import('@/utils/client')]).then(
    ([{ auth }, { client }]) => ({ auth, client, user: auth.currentUser })
  )
  return serializeSessionOperation(async () => {
    const { auth, client, user } = await dependencies
    if (!user || auth.currentUser?.uid !== user.uid) return
    const token = await user.getIdToken()
    if (auth.currentUser?.uid !== user.uid) return
    const response = await client.authenticate(undefined, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.success) throw new Error('セッションを確立できませんでした')
  })
}

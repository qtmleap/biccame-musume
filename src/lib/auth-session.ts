// Cookie creation and deletion must finish in order. An in-flight authentication
// request must not re-create the cookie after a successful logout.
let pendingSessionOperation: Promise<unknown> = Promise.resolve()

export const serializeSessionOperation = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = pendingSessionOperation.then(operation)
  pendingSessionOperation = result.catch(() => undefined)
  return result
}

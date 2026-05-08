export const clearAllCaches = async (): Promise<void> => {
  if (typeof caches === 'undefined') return
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}

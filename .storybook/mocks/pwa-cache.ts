import { runtime } from '../catalogue/runtime'
// Exercise the production update UI without deleting browser caches from the Storybook origin.
export const clearAllCaches = async (): Promise<void> => {
  runtime.calls.push('syntheticClearCaches')
}

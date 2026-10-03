import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { useMemo } from 'react'
import { routeTree } from '@/app/routeTree.gen'
/** Actual production router: route params, search validation, beforeLoad, layouts and outlets all execute. */
export const PageExample = ({ path }: { path: string }) => {
  const router = useMemo(
    () => createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) }),
    [path]
  )
  return (
    <div data-testid='production-page' data-fixture-path={path}>
      <RouterProvider router={router} />
    </div>
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/events/$uuid/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/admin/events/$uuid/edit', params: { uuid: params.uuid } })
  }
})

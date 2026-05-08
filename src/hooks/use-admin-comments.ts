import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/utils/client'

export const useAllComments = (includeDeleted: boolean) => {
  return useSuspenseQuery({
    queryKey: ['comments', 'admin', 'all', { includeDeleted }],
    queryFn: () => client.getAdminComments({ queries: { includeDeleted: includeDeleted ? '1' : '0' } }),
    staleTime: 0
  })
}

export const useDeleteAdminComment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, commentId }: { eventId: string; commentId: string }) =>
      client.deleteEventComment(undefined, { params: { uuid: eventId, commentId } }),
    onSuccess: () => {
      toast.success('コメントを削除しました')
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    },
    onError: () => {
      toast.error('コメントの削除に失敗しました')
    }
  })
}

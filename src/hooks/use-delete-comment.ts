import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/utils/client'

export const useDeleteComment = (eventUuid: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => client.deleteEventComment(undefined, { params: { uuid: eventUuid, commentId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', eventUuid, 'comments'] })
      toast.success('コメントを削除しました')
    },
    onError: () => {
      toast.error('削除に失敗しました')
    }
  })
}

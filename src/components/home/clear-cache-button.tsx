import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export const ClearCacheButton = () => {
  const queryClient = useQueryClient()

  const handleClearCache = () => {
    queryClient.clear()
    localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
    toast.success('オフラインキャッシュをリセットしたよ！')
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  if (!import.meta.env.DEV) return null

  return (
    <Button
      type='button'
      onClick={handleClearCache}
      variant='outline'
      size='sm'
      className='fixed bottom-4 right-4 z-100 gap-2 shadow-lg'
    >
      <Trash2 className='h-4 w-4' />
      キャッシュリセット
    </Button>
  )
}

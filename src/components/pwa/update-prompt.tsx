import { RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const SW_UPDATE_EVENT = 'sw:needsRefresh'

export const dispatchSwUpdateEvent = () => {
  window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT))
}

export const UpdatePrompt = () => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener(SW_UPDATE_EVENT, handler)
    return () => window.removeEventListener(SW_UPDATE_EVENT, handler)
  }, [])

  if (!visible) return null

  return (
    <div className='fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-gray-900 px-4 py-3 text-white shadow-lg md:bottom-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:rounded-xl md:px-5'>
      <div className='flex items-center gap-2 text-sm'>
        <RefreshCw className='size-4 shrink-0 text-green-400' />
        <span>新しいバージョンが利用可能です</span>
      </div>
      <div className='flex items-center gap-2'>
        <Button
          size='sm'
          className='h-7 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-100'
          onClick={() => window.location.reload()}
        >
          更新
        </Button>
        <button
          type='button'
          aria-label='閉じる'
          className='rounded p-1 text-white/60 transition-colors hover:text-white'
          onClick={() => setVisible(false)}
        >
          <X className='size-4' />
        </button>
      </div>
    </div>
  )
}

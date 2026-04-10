import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

const UPDATE_START_EVENT = 'sw:updating'
const RELOAD_DELAY_MS = 1200

const triggerUpdate = () => {
  window.dispatchEvent(new CustomEvent(UPDATE_START_EVENT))
}

export const showUpdatePrompt = () => {
  toast.custom(
    (id) => (
      <div className='flex items-center justify-between gap-3 w-[356px] max-w-[calc(100vw-32px)] rounded-xl bg-gray-900 px-4 py-3 shadow-lg'>
        <div className='flex items-start gap-3 min-w-0'>
          <RefreshCw className='size-5 shrink-0 text-green-400 mt-0.5' />
          <div className='flex flex-col gap-0.5 min-w-0'>
            <p className='text-sm font-medium text-white'>新しいバージョンが利用可能です</p>
            <p className='text-xs text-gray-300'>ページを更新すると最新版に切り替わります</p>
          </div>
        </div>
        <Button
          size='sm'
          className='shrink-0 h-8 bg-pink-600 px-3 text-xs font-medium text-white hover:bg-pink-700'
          onClick={() => {
            toast.dismiss(id)
            triggerUpdate()
          }}
        >
          更新
        </Button>
      </div>
    ),
    { duration: Number.POSITIVE_INFINITY }
  )
}

const isStaging = import.meta.env.MODE === 'staging'

export const UpdatePrompt = () => {
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isStaging) showUpdatePrompt()

    const handler = () => {
      setUpdating(true)
      requestAnimationFrame(() => setProgress(100))
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    }
    window.addEventListener(UPDATE_START_EVENT, handler)
    return () => window.removeEventListener(UPDATE_START_EVENT, handler)
  }, [])

  if (!updating) return null

  return (
    <div className='fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-black/80 backdrop-blur-sm'>
      <p className='text-white text-lg font-medium'>更新中...</p>
      <Progress
        value={progress}
        className='w-64 h-2 bg-white/20 [&>div]:bg-white [&>div]:transition-all [&>div]:duration-1000 [&>div]:ease-out'
      />
    </div>
  )
}

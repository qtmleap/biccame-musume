import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'

const UPDATE_START_EVENT = 'sw:updating'
const RELOAD_DELAY_MS = 1200

const triggerUpdate = () => {
  window.dispatchEvent(new CustomEvent(UPDATE_START_EVENT))
}

export const showUpdatePrompt = () => {
  toast('新しいバージョンが利用可能です', {
    description: 'ページを更新すると最新版に切り替わります',
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: '更新',
      onClick: triggerUpdate
    },
    classNames: {
      toast: 'flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 shadow-lg',
      title: 'text-sm font-medium text-white',
      description: 'text-xs text-gray-300',
      actionButton: '!bg-pink-600 !text-white !px-3 !py-1.5 !rounded-md !text-xs !font-medium hover:!bg-pink-700'
    }
  })
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

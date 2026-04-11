import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { clearAllCaches } from '@/lib/pwa-cache'
import { UpdateOverlay, type UpdateOverlayStatus } from './update-overlay'

let dispatchUpdate: (() => void) | null = null

const triggerUpdate = () => {
  dispatchUpdate?.()
}

export const showUpdatePrompt = () => {
  toast('新しいバージョンが利用可能です', {
    id: 'pwa-update-prompt',
    description: 'ページを更新すると最新版に切り替わります',
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: '更新',
      onClick: triggerUpdate
    },
    classNames: {
      toast: '!bg-white !border-pink-100 !rounded-xl !shadow-lg',
      title: '!text-gray-900 !text-sm !font-medium',
      description: '!text-gray-600 !text-xs',
      actionButton: '!bg-pink-600 !text-white hover:!bg-pink-700'
    }
  })
}

const isProduction = import.meta.env.MODE === 'production'

export const UpdatePrompt = () => {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UpdateOverlayStatus>('clearing')

  useEffect(() => {
    dispatchUpdate = () => {
      setStatus('clearing')
      setOpen(true)
      toast.dismiss('pwa-update-prompt')

      clearAllCaches()
        .catch(() => {})
        .finally(() => {
          setStatus('reloading')
          window.setTimeout(() => window.location.reload(), 3000)
        })
    }

    if (!isProduction) showUpdatePrompt()

    return () => {
      dispatchUpdate = null
    }
  }, [])

  return <UpdateOverlay open={open} status={status} />
}

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PERSISTED_ATOM_KEYS } from '@/lib/persisted-atom-keys'
import { clearAllCaches } from '@/lib/pwa-cache'
import { UpdateOverlay, type UpdateOverlayStatus } from './update-overlay'

const UPDATE_START_EVENT = 'sw:updating'

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
      toast: '!bg-white !border-pink-100 !rounded-xl !shadow-lg',
      title: '!text-gray-900 !text-sm !font-medium',
      description: '!text-gray-600 !text-xs',
      actionButton: '!bg-pink-600 !text-white hover:!bg-pink-700'
    }
  })
}

const isStaging = import.meta.env.MODE === 'staging'

export const UpdatePrompt = () => {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<UpdateOverlayStatus>('clearing')

  useEffect(() => {
    if (isStaging) showUpdatePrompt()

    const handler = () => {
      setStatus('clearing')
      setOpen(true)

      clearAllCaches()
        .then(() => {
          for (const key of PERSISTED_ATOM_KEYS) {
            localStorage.removeItem(key)
          }
          setStatus('reloading')
          window.setTimeout(() => window.location.reload(), 800)
        })
        .catch(() => {
          setStatus('reloading')
          window.setTimeout(() => window.location.reload(), 800)
        })
    }

    window.addEventListener(UPDATE_START_EVENT, handler)
    return () => window.removeEventListener(UPDATE_START_EVENT, handler)
  }, [])

  return <UpdateOverlay open={open} status={status} />
}

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
    actionButtonStyle: {
      background: 'oklch(59.2% 0.249 0.584)',
      color: 'white'
    },
    classNames: {
      toast: '!bg-card !border-card !rounded-xl !shadow-lg',
      title: '!text-foreground !text-sm !font-medium',
      description: '!text-muted-foreground !text-xs',
      actionButton: 'hover:!brightness-110'
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
          // サブルートでリロードすると404になるためトップに遷移
          window.setTimeout(() => window.location.replace('/'), 3000)
        })
    }

    if (!isProduction) showUpdatePrompt()

    return () => {
      dispatchUpdate = null
    }
  }, [])

  return <UpdateOverlay open={open} status={status} />
}

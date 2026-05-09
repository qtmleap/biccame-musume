import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { clearAllCaches } from '@/lib/pwa-cache'
import { UpdateOverlay, type UpdateOverlayStatus } from './update-overlay'

let dispatchUpdate: (() => void) | null = null
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

const triggerUpdate = () => {
  dispatchUpdate?.()
}

export const setUpdateServiceWorker = (fn: (reloadPage?: boolean) => Promise<void>) => {
  updateServiceWorker = fn
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

      const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms))

      const applyUpdate = async () => {
        await clearAllCaches().catch(() => {})
        // clearing ステータスのアニメーションを見せる時間
        await wait(1500)

        setStatus('reloading')
        // SW を新バージョンに切り替え (skipWaiting メッセージ送信)。
        // reloadPage=false なので自分でトップへリダイレクトする。
        await updateServiceWorker?.(false).catch(() => {})
        // reloading ステータスのアニメーションを見せる時間
        await wait(1500)
      }

      applyUpdate().finally(() => {
        // サブルートでリロードすると404になるためトップに遷移
        window.location.replace('/')
      })
    }

    if (!isProduction) showUpdatePrompt()

    return () => {
      dispatchUpdate = null
    }
  }, [])

  return <UpdateOverlay open={open} status={status} />
}

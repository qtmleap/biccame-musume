import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

const STORAGE_KEY = 'pwa:ios-install-prompt-dismissed-at'
const SUPPRESSION_DAYS = 14

const isIos = (): boolean => {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isIosDevice || isIpadOs
}

const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

const isSuppressed = (): boolean => {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  const diff = Date.now() - new Date(raw).getTime()
  return diff < SUPPRESSION_DAYS * 24 * 60 * 60 * 1000
}

const dismiss = () => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, new Date().toISOString())
}

export const IosInstallPrompt = () => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isIos() && !isStandalone() && !isSuppressed()) {
        setOpen(true)
      }
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [])

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      dismiss()
    }
    setOpen(value)
  }

  const handleClose = () => {
    dismiss()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className='bg-card border-pink-100 rounded-xl shadow-lg max-w-sm'>
        <DialogHeader>
          <DialogTitle className='text-gray-900 text-base font-semibold'>ホーム画面に追加</DialogTitle>
          <DialogDescription className='sr-only'>このアプリをホーム画面に追加する手順</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-3 text-sm text-gray-700'>
          <ul className='list-disc list-inside space-y-1 text-gray-600 text-xs'>
            <li>全画面表示で快適に利用できます</li>
            <li>オフラインでも一部機能が使えます</li>
          </ul>
          <ol className='list-decimal list-inside space-y-2'>
            <li>Safari 下部の共有ボタン（□に↑のアイコン）をタップ</li>
            <li>メニューから「ホーム画面に追加」を選択</li>
            <li>右上の「追加」をタップ</li>
          </ol>
        </div>
        <DialogFooter>
          <button
            type='button'
            onClick={handleClose}
            className='w-full rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 transition-colors'
          >
            閉じる
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

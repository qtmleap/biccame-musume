import { Copy, Share, X } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type EventShareButtonProps = {
  title: string
  uuid: string
}

/**
 * イベント詳細ページのシェアボタン
 * Web Share API 利用可なら直接呼ぶ、 不可なら X リンク + URL コピーの Popover を出す
 */
export const EventShareButton = ({ title, uuid }: EventShareButtonProps) => {
  const shareUrl = `${window.location.origin}/events/${uuid}`
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share

  const handleShare = async () => {
    try {
      await navigator.share({ title, text: title, url: shareUrl })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error)
      }
    }
  }

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(shareUrl)
    toast.success('URLをコピーしました')
  }

  if (canNativeShare) {
    return (
      <button
        type='button'
        onClick={handleShare}
        className='flex items-center gap-1.5 text-sm text-foreground/70 hover:text-brand transition-colors group'
      >
        <Share className='h-5 w-5 transition-all group-hover:scale-110' />
      </button>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='flex items-center gap-1.5 text-sm text-foreground/70 hover:text-brand transition-colors group'
        >
          <Share className='h-5 w-5 transition-all group-hover:scale-110' />
        </button>
      </PopoverTrigger>
      <PopoverContent className='w-48 p-2' align='end'>
        <div className='flex flex-col gap-1'>
          <a
            href={twitterShareUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors'
          >
            <X className='h-4 w-4' />
            Xでシェア
          </a>
          <button
            type='button'
            onClick={handleCopyUrl}
            className='flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors w-full text-left'
          >
            <Copy className='h-4 w-4' />
            URLをコピー
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

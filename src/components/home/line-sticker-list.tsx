import { Sticker } from 'lucide-react'
import { LINE_STICKER_LABELS } from '@/locales/app.content'
import { LineStickerListItem } from './line-sticker-list-item'

const stickers = [
  {
    url: 'https://store.line.me/stickershop/product/1391834/ja',
    title: LINE_STICKER_LABELS.biccameMusume,
    description: LINE_STICKER_LABELS.originalStamp,
    delay: 0
  },
  {
    url: 'https://store.line.me/stickershop/product/4137675/ja',
    title: `${LINE_STICKER_LABELS.biccameMusume} 第2弾`,
    description: LINE_STICKER_LABELS.dailyConversation,
    delay: 0.1
  }
]

/**
 * LINEスタンプ一覧セクション
 */
export const LineStickerList = () => {
  return (
    <section className='bg-linear-to-br from-green-50 to-emerald-50'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='flex items-center gap-2 mb-4'>
          <Sticker className='h-5 w-5 text-[#00B900]' />
          <h2 className='text-base font-bold text-gray-800'>LINEスタンプ</h2>
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2'>
          {stickers.map((sticker) => (
            <LineStickerListItem
              key={sticker.url}
              url={sticker.url}
              title={sticker.title}
              description={sticker.description}
              delay={sticker.delay}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

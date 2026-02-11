import { motion } from 'motion/react'
import { useEffect } from 'react'
import { SHARE_LABELS } from '@/locales/app.content'

/**
 * Xシェアボタンセクション
 */
export const XShareSection = () => {
  /**
   * Xウィジェットスクリプトを読み込む
   */
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.charset = 'utf-8'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <section className='py-6 bg-amber-50'>
      <div className='container mx-auto px-4'>
        <div className='max-w-2xl mx-auto text-center'>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className='flex flex-col items-center gap-2'
          >
            <p className='text-sm text-gray-600'>このサイトをシェア</p>
            <a
              href='https://twitter.com/share?ref_src=twsrc%5Etfw'
              className='twitter-share-button'
              data-show-count='false'
              data-lang='ja'
              data-hashtags={SHARE_LABELS.hashtag}
              data-text={SHARE_LABELS.text}
            >
              Tweet
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

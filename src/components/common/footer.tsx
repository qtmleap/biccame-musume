import dayjs from 'dayjs'
import Link from 'next/link'

/**
 * 共通フッターコンポーネント
 */
export const Footer = () => {
  return (
    <footer className='text-center text-xs text-gray-500 px-4 py-4 border-t border-gray-200 bg-gray-50'>
      <div className='container mx-auto space-y-2'>
        <div className='flex flex-wrap justify-center gap-3'>
          <Link href='/about' className='text-gray-600 hover:text-[#e50012] transition-colors'>
            サイトについて
          </Link>
          <span className='text-gray-400'>|</span>
          <a
            href='https://biccame.jp/'
            target='_blank'
            rel='noopener noreferrer'
            className='text-gray-600 hover:text-[#e50012] transition-colors'
          >
            公式サイト
          </a>
          <span className='text-gray-400'>|</span>
          <a
            href='https://x.com/biccameraE'
            target='_blank'
            rel='noopener noreferrer'
            className='text-gray-600 hover:text-[#e50012] transition-colors'
          >
            公式X
          </a>
          <span className='text-gray-400'>|</span>
          <a
            href='https://biccame.jp/guideline/'
            target='_blank'
            rel='noopener noreferrer'
            className='text-gray-600 hover:text-[#e50012] transition-colors'
          >
            ガイドライン
          </a>
          <span className='text-gray-400'>|</span>
          <Link href='/contact' className='text-gray-600 hover:text-[#e50012] transition-colors'>
            お問い合わせ
          </Link>
        </div>
        <div className='space-y-2'>
          <p className='text-gray-500'>
            本サイトに掲載されているビッカメ娘の画像等は、株式会社ビックカメラに帰属します。
            <br className='hidden sm:inline' />
            画像の再利用は禁止されています。
          </p>
          <p className='text-gray-500'>
            © {dayjs().year()}{' '}
            <a
              href='https://www.itall.co.jp/'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:text-[#e50012] transition-colors'
            >
              itall
            </a>
            {' / '}
            <a
              href='https://qleap.jp/'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:text-[#e50012] transition-colors'
            >
              QuantumLeap
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

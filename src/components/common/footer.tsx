import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'

/**
 * 共通フッターコンポーネント
 */
export const Footer = () => {
  return (
    <footer className='text-center text-xs text-gray-500 px-4 py-4 border-t border-gray-200 bg-gray-50'>
      <div className='container mx-auto space-y-2'>
        <div className='flex flex-wrap justify-center gap-3'>
          <Link to='/about' className='text-gray-600 hover:text-[#e50012] transition-colors'>
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
        </div>
        <p className='text-gray-400'>
          © {dayjs().year()} QuantumLeap
        </p>
      </div>
    </footer>
  )
}

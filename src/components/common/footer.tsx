import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'

/**
 * 共通フッターコンポーネント
 */
export const Footer = () => {
  return (
    <footer className='text-center text-xs text-muted-foreground px-4 py-4 border-t border-border bg-muted'>
      <div className='container mx-auto space-y-2'>
        <div className='flex flex-wrap justify-center gap-3'>
          <Link to='/about' className='text-muted-foreground hover:text-brand transition-colors'>
            サイトについて
          </Link>
          <span className='text-muted-foreground/50'>|</span>
          <a
            href='https://biccame.jp/guideline/'
            target='_blank'
            rel='noopener noreferrer'
            className='text-muted-foreground hover:text-brand transition-colors'
          >
            ガイドライン
          </a>
          <span className='text-muted-foreground/50'>|</span>
          <Link to='/contact' className='text-muted-foreground hover:text-brand transition-colors'>
            お問い合わせ
          </Link>
          <span className='text-muted-foreground/50'>|</span>
          <Link to='/admin/events' className='text-muted-foreground hover:text-brand transition-colors'>
            管理
          </Link>
        </div>
        <div className='space-y-1'>
          <p className='text-muted-foreground'>
            v{__APP_VERSION__} ({__GIT_HASH__})
          </p>
          <p className='text-muted-foreground'>
            © {dayjs().year()}{' '}
            <a
              href='https://www.itall.co.jp/'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:text-brand transition-colors'
            >
              itall
            </a>
            {' / '}
            <a
              href='https://qleap.jp/'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:text-brand transition-colors'
            >
              QuantumLeap
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

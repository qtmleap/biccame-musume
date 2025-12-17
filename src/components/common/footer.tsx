/**
 * 共通フッターコンポーネント
 */
export const Footer = () => {
  return (
    <footer className='mt-6 text-center text-xs text-gray-500 px-4 py-4 border-t border-gray-200'>
      <div className='container mx-auto space-y-1'>
        <p>このサイトはビックカメラ及びビッカメ娘の非公式ファンサイトです</p>
        <p>キャラクターの著作権は株式会社ビックカメラに帰属します</p>
        <p>
          <a
            href='https://biccame.jp/guideline/'
            target='_blank'
            rel='noopener noreferrer'
            className='text-[#e50012] hover:underline'
          >
            キャラクター使用のガイドライン
          </a>
          に基づき運営しています
        </p>
        <div className='flex flex-wrap justify-center gap-2 pt-1'>
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
            公式X (Twitter)
          </a>
        </div>
        <p className='text-gray-400 pt-1'>
          © {new Date().getFullYear()} ビッカメ娘非公式ファンサイト
        </p>
      </div>
    </footer>
  )
}

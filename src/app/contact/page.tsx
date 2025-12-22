import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: 'ビッカメ娘ファンサイトへのお問い合わせ。不具合報告、機能要望、ご意見・ご感想はこちらから。',
  openGraph: {
    title: 'お問い合わせ | ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-',
    description: 'ビッカメ娘ファンサイトへのお問い合わせ。不具合報告、機能要望、ご意見・ご感想はこちらから。'
  }
}

/**
 * お問い合わせページ
 */
const ContactPage = () => {
  return (
    <div className='min-h-screen bg-linear-to-b from-blue-50 to-white'>
      <div className='container mx-auto px-4 py-12'>
        <h1 className='text-3xl md:text-4xl font-bold mb-12 text-center text-[#e50012]'>お問い合わせ</h1>

        <div className='max-w-3xl mx-auto space-y-12'>
          {/* 注意事項 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              ご注意ください
            </h2>
            <div className='space-y-3 text-gray-700'>
              <p>このサイトはファンメイドのファンサイトです。</p>
              <p>
                ビックカメラ公式やビッカメ娘に関する公式のお問い合わせは、
                <a
                  href='https://www.biccamera.co.jp/company/contact.html'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-[#e50012] hover:underline inline-flex items-center gap-1'
                >
                  ビックカメラ公式サイト
                  <ExternalLink className='h-4 w-4' />
                </a>
                からお願いいたします。
              </p>
            </div>
          </section>

          {/* サイトに関するお問い合わせ */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              当サイトに関するお問い合わせ
            </h2>
            <div className='space-y-4 text-gray-700'>
              <p>当サイトの不具合報告、改善のご提案、その他ご意見・ご要望は、以下の方法でお寄せください。</p>

              <div className='space-y-4 mt-6'>
                <div>
                  <h3 className='font-bold text-gray-800 mb-2'>GitHub Issues（推奨）</h3>
                  <p className='text-sm mb-3'>技術的な不具合報告や機能要望は、GitHubのIssuesでお願いします。</p>
                  <a
                    href='https://github.com/qtmleap/biccame-musume/issues'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm'
                  >
                    <ExternalLink className='h-3.5 w-3.5' />
                    GitHubでIssueを作成
                  </a>
                </div>

                <div>
                  <h3 className='font-bold text-gray-800 mb-2'>Googleフォーム (簡単なお問い合わせ) </h3>
                  <p className='text-sm mb-3'>簡単なご意見・ご要望はこちらのフォームからお寄せください。</p>
                  <a
                    href='https://forms.gle/kpD1EQZQRZdeNDUQ6'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#673AB7] text-white rounded-lg hover:bg-[#552a99] transition-colors font-medium text-sm'
                  >
                    <ExternalLink className='h-3.5 w-3.5' />
                    Googleフォームで送信
                  </a>
                </div>

                <div>
                  <h3 className='font-bold text-gray-800 mb-2'>X (旧Twitter)</h3>
                  <p className='text-sm mb-3'>カジュアルなご意見やご感想は、Xでお気軽にお寄せください。</p>
                  <a
                    href='https://x.com/ultemica'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm'
                  >
                    <ExternalLink className='h-3.5 w-3.5' />
                    @ultemica をフォロー
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* よくある質問 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              よくある質問
            </h2>
            <div className='space-y-4 text-gray-700'>
              <div>
                <h3 className='font-bold text-gray-800 mb-2'>Q. 投票は何回できますか？</h3>
                <p className='text-sm'>A. 1日1回、お好きなキャラクターに投票できます。</p>
              </div>
              <div>
                <h3 className='font-bold text-gray-800 mb-2'>Q. データの更新頻度は？</h3>
                <p className='text-sm'>
                  A. キャラクター情報は不定期で更新しています。最新情報は公式サイトをご確認ください。
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ContactPage

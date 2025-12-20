import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

/**
 * サイトについて・権利情報ページ
 */
const RouteComponent = () => {
  return (
    <div className='min-h-screen bg-linear-to-b from-blue-50 to-white'>
      <div className='container mx-auto px-4 py-12'>
        <h1 className='text-3xl md:text-4xl font-bold mb-12 text-center text-[#e50012]'>当ウェブサイトについて</h1>

        <div className='max-w-3xl mx-auto space-y-12'>
          {/* サイト概要 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              このサイトについて
            </h2>
            <div className='space-y-3 text-gray-700'>
              <p>このサイトは、ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援するファンサイトです。</p>
              <p>ビッカメ娘の情報を整理・集約し、ファンの皆様がキャラクターをより楽しめることを目的としています。</p>
            </div>
          </section>

          {/* 著作権情報 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              著作権について
            </h2>
            <div className='space-y-3 text-gray-700'>
              <p>ビッカメ娘に関する著作権は、株式会社ビックカメラおよびアイティオール株式会社に帰属します。</p>
              <p>
                本サイトは、
                <a
                  href='https://biccame.jp/guideline/'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-[#e50012] hover:underline inline-flex items-center gap-1'
                >
                  キャラクター使用のガイドライン
                </a>
                に基づき、非営利のファン活動として運営しています。広告等を利用した収入を得ることは一切ありません。
              </p>
            </div>
          </section>

          {/* 画像について */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              画像の取り扱いについて
            </h2>
            <div className='space-y-3 text-gray-700'>
              <p>本サイトで表示されるキャラクター画像は、公式サイトから参照しています。</p>
              <p>
                画像の複製や再配布は行っておらず、CDN(Content Delivery
                Network)を経由して配信することで、公式サーバーへの負荷がかからないよう配慮しています。
              </p>
            </div>
          </section>

          {/* 公式リンク */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              公式サイト・SNS
            </h2>
            <div className='flex flex-col gap-3'>
              <a
                href='https://biccame.jp/'
                target='_blank'
                rel='noopener noreferrer'
                className='text-[#e50012] hover:underline inline-flex items-center gap-2 text-lg'
              >
                <ExternalLink className='h-5 w-5' />
                ビッカメ娘公式サイト
              </a>
              <a
                href='https://x.com/biccameraE'
                target='_blank'
                rel='noopener noreferrer'
                className='text-[#e50012] hover:underline inline-flex items-center gap-2 text-lg'
              >
                <ExternalLink className='h-5 w-5' />
                公式X (Twitter) @biccameraE
              </a>
              <a
                href='https://www.biccamera.com/'
                target='_blank'
                rel='noopener noreferrer'
                className='text-[#e50012] hover:underline inline-flex items-center gap-2 text-lg'
              >
                <ExternalLink className='h-5 w-5' />
                株式会社ビックカメラ
              </a>
            </div>
          </section>

          {/* 免責事項 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-gray-800 border-b-2 border-[#e50012] pb-2'>
              免責事項
            </h2>
            <div className='space-y-3 text-gray-700 text-sm'>
              <p>
                本サイトの情報は、公式サイトから取得したデータに基づいていますが、情報の正確性や最新性を保証するものではありません。
              </p>
              <p>本サイトの利用により生じたいかなる損害についても、運営者は責任を負いかねます。</p>
              <p>最新の正確な情報は、必ず公式サイトをご確認ください。</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/about/')({
  component: RouteComponent
})

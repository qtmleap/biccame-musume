import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

/**
 * サイトについて・権利情報ページ
 */
const RouteComponent = () => {
  return (
    <div className='min-h-screen'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <h1 className='text-2xl font-bold mb-8 text-foreground'>当ウェブサイトについて</h1>

        <div className='space-y-12'>
          {/* サイト概要 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-foreground border-b-2 border-brand pb-2'>
              このサイトについて
            </h2>
            <div className='space-y-3 text-muted-foreground'>
              <p>このサイトは、ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援するファンサイトです。</p>
              <p>ビッカメ娘の情報を整理・集約し、ファンの皆様がキャラクターをより楽しめることを目的としています。</p>
            </div>
          </section>

          {/* 著作権情報 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-foreground border-b-2 border-brand pb-2'>
              著作権について
            </h2>
            <div className='space-y-3 text-muted-foreground'>
              <p>ビッカメ娘に関する著作権は、株式会社ビックカメラおよびアイティオール株式会社（© itall）に帰属します。</p>
              <p>
                本サイトは、
                <a
                  href='https://biccame.jp/guideline/'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-brand hover:underline inline-flex items-center gap-1'
                >
                  キャラクター使用のガイドライン
                </a>
                を踏まえた、個人運営の非営利ファン活動として運営しています。具体的な遵守内容は次節をご覧ください。
              </p>
            </div>
          </section>

          {/* ガイドライン遵守 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-foreground border-b-2 border-brand pb-2'>
              ガイドライン遵守について
            </h2>
            <p className='text-muted-foreground mb-4'>
              本サイトは、
              <a
                href='https://biccame.jp/guideline/'
                target='_blank'
                rel='noopener noreferrer'
                className='text-brand hover:underline inline-flex items-center gap-1'
              >
                キャラクター使用のガイドライン
              </a>
              の各条項を以下のとおり遵守しています。
            </p>
            <ol className='space-y-4 text-muted-foreground'>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  1
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第二条（使用許諾）</p>
                  <p className='text-sm'>
                    本サイトは非営利かつ無償のウェブサイトであり、第二条に列挙される「ウェブサイト、ブログ、ＳＮＳでの本キャラクターの紹介」の使用許諾要件を満たしています。
                  </p>
                </div>
              </li>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  2
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第三条（本キャラクターの使用に関する注意事項）</p>
                  <p className='text-sm'>
                    本サイトでは、ビッカメ娘の公式画像をそのまま参照表示するにあたり、著作権者「© itall」を表示するとともに、
                    <strong className='text-foreground'>本サイトを経由したキャラクター画像の再使用・転載を固くお断りすることをここに明記</strong>
                    します。
                  </p>
                  <p className='text-xs text-muted-foreground/70'>
                    ※ ガイドライン原文では「citall」と表記されていますが、アイティオール株式会社（itall Inc.）の英文表記および公式X（@itallinc）等を踏まえ「© itall」と解釈しています。
                  </p>
                </div>
              </li>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  3
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第四条（使用禁止）</p>
                  <p className='text-sm'>本サイトは、第四条に定める以下の使用を一切行っておりません。</p>
                  <ul className='text-sm list-disc list-inside space-y-1 pl-1'>
                    <li>ビッカメ娘および二次創作物の著作者の社会的評価を損なうような使用</li>
                    <li>他者の権利を侵害する、または侵害のおそれがある使用</li>
                    <li>公序良俗に反する態様、その他ビッカメ娘のイメージを損なうと判断される態様での使用</li>
                  </ul>
                  <p className='text-sm'>
                    また、株式会社ビックカメラまたはアイティオール株式会社の判断により、使用の差止め・許諾内容の変更・許諾停止等の措置がとられた場合は、速やかにこれに従います。
                  </p>
                </div>
              </li>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  4
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第五条（使用許諾の終了）</p>
                  <p className='text-sm'>
                    本サイトは、ガイドラインに違反した場合に使用許諾が自動的に終了することを認識しており、その場合は速やかにキャラクターの使用を停止します。
                  </p>
                </div>
              </li>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  5
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第六条（営利活動）</p>
                  <p className='text-sm'>
                    本サイトは第六条で指定される営利活動を一切行っておらず、アイティオール株式会社による別途の使用許諾を必要としません。
                  </p>
                </div>
              </li>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  6
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第七条（ガイドライン変更への追従）</p>
                  <p className='text-sm'>
                    ガイドラインが変更された場合は、変更後の内容に従って本サイトの運営方針および記載内容を速やかに更新します。
                  </p>
                </div>
              </li>
              <li className='flex gap-3'>
                <span className='shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-bold'>
                  7
                </span>
                <div className='flex-1 space-y-1'>
                  <p className='font-bold text-foreground'>第八条 第1項（法令遵守）</p>
                  <p className='text-sm'>
                    本サイトは、ガイドラインのほか、著作権法その他の適用法令を遵守して運営しています。
                  </p>
                </div>
              </li>
            </ol>
          </section>

          {/* 画像について */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-foreground border-b-2 border-brand pb-2'>
              画像の取り扱いについて
            </h2>
            <div className='space-y-3 text-muted-foreground'>
              <p>本サイトで表示されるキャラクター画像は、公式サイトから参照しています。</p>
              <p>
                画像の複製や再配布は行っておらず、CDN(Content Delivery
                Network)を経由して配信することで、公式サーバーへの負荷がかからないよう配慮しています。
              </p>
              <p>
                ガイドラインに基づき、キャラクター画像の著作権は「© itall」（アイティオール株式会社）に帰属することを明記いたします。
                <strong className='text-foreground'>
                  本サイトに掲載されている画像の再使用・転載は固くお断りいたします。
                </strong>
                画像をご利用になりたい場合は、必ず公式サイトおよびガイドラインをご確認のうえ、公式サーバーから直接ご取得ください。
              </p>
            </div>
          </section>

          {/* 公式リンク */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-foreground border-b-2 border-brand pb-2'>
              公式サイト・SNS
            </h2>
            <div className='flex flex-col gap-3'>
              <a
                href='https://biccame.jp/'
                target='_blank'
                rel='noopener noreferrer'
                className='text-brand hover:underline inline-flex items-center gap-1.5 text-sm'
              >
                <ExternalLink className='h-4 w-4' />
                ビッカメ娘公式サイト
              </a>
              <a
                href='https://x.com/biccameraE'
                target='_blank'
                rel='noopener noreferrer'
                className='text-brand hover:underline inline-flex items-center gap-1.5 text-sm'
              >
                <ExternalLink className='h-4 w-4' />
                公式X (Twitter) @biccameraE
              </a>
              <a
                href='https://www.biccamera.com/'
                target='_blank'
                rel='noopener noreferrer'
                className='text-brand hover:underline inline-flex items-center gap-1.5 text-sm'
              >
                <ExternalLink className='h-4 w-4' />
                株式会社ビックカメラ
              </a>
            </div>
          </section>

          {/* 免責事項 */}
          <section>
            <h2 className='text-xl md:text-2xl font-bold mb-4 text-foreground border-b-2 border-brand pb-2'>
              免責事項
            </h2>
            <div className='space-y-3 text-muted-foreground text-sm'>
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

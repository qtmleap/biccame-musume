import type { Metadata } from 'next'
import { Footer } from '@/components/common/footer'
import Header from '@/components/common/header'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Providers from './providers'
import '@/index.css'

export const metadata: Metadata = {
  title: 'ビッカメ娘ファンサイト',
  description: 'ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援するファンサイト',
  keywords: ['ビッカメ娘', 'ビックカメラ', 'キャラクター', 'ファンサイト'],
  authors: [{ name: '@QuantumLeap' }],
  openGraph: {
    title: 'ビッカメ娘ファンサイト',
    description: 'ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援するファンサイト',
    type: 'website',
    locale: 'ja_JP'
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@ultemica'
  }
}

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang='ja' suppressHydrationWarning>
      <body className='min-h-screen flex flex-col antialiased'>
        <Providers>
          <ThemeProvider attribute='class' defaultTheme='right' enableSystem disableTransitionOnChange>
            <div className='min-h-screen flex flex-col bg-pink-50 select-none'>
              <Header />
              <main className='flex-1'>{children}</main>
              <Footer />
            </div>
            <Toaster />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}

export default RootLayout

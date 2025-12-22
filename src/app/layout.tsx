import type { Metadata, Viewport } from 'next'
import { Footer } from '@/components/common/footer'
import Header from '@/components/common/header'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Providers from './providers'
import '@/index.css'

const siteName = 'ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-'
const siteDescription = '#ビッカメ娘 公式WEB -ビックカメラ店舗擬人化プロジェクト- https://biccame.jp/'
const siteUrl = 'https://bicqlo.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`
  },
  description: siteDescription,
  keywords: [
    'ビッカメ娘',
    'ビックカメラ',
    'キャラクター',
    'ファンサイト',
    '擬人化',
    '誕生日',
    'カレンダー',
    '店舗',
    'マップ'
  ],
  authors: [{ name: '@QuantumLeap', url: 'https://github.com/qtmleap' }],
  creator: '@QuantumLeap',
  publisher: 'ビッカメ娘応援プロジェクト',
  formatDetection: {
    email: false,
    address: false,
    telephone: false
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    siteName: siteName,
    images: [
      {
        url: '/og_image.webp',
        width: 1200,
        height: 630,
        alt: siteName
      }
    ],
    type: 'website',
    locale: 'ja_JP'
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
    creator: '@ultemica',
    images: ['/og_image.webp']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  alternates: {
    canonical: siteUrl
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  },
  manifest: '/manifest.json'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#252525' }
  ]
}

/**
 * JSON-LD構造化データ
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      description: siteDescription,
      inLanguage: 'ja',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/characters?search={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'ビッカメ娘応援プロジェクト',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/og_image.webp`,
        width: 1200,
        height: 630
      },
      sameAs: ['https://x.com/search?q=%23ビッカメ娘']
    }
  ]
}

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang='ja' suppressHydrationWarning>
      <head>
        <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
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

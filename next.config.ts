import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // React Strict Mode
  reactStrictMode: true,

  compiler: {
    removeConsole: {
      exclude: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'log']
    }
  },

  // 画像最適化
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'biccame.jp'
      }
    ]
  },

  // 静的ファイル
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          }
        ]
      }
    ]
  }
}

export default nextConfig

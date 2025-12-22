import type { MetadataRoute } from 'next'

const robots = (): MetadataRoute.Robots => {
  const baseUrl = 'https://bicqlo.vercel.app'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/']
    },
    sitemap: `${baseUrl}/sitemap.xml`
  }
}

export default robots

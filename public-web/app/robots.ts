import type { MetadataRoute } from 'next'
import { fetchActiveMarkets } from '../lib/content-api'
export const dynamic = 'force-dynamic'
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = process.env.PUBLIC_WEB_BASE_URL || 'https://invalid.local'
  const markets = await fetchActiveMarkets()
  if (!markets.length) return { rules: { userAgent: '*', disallow: '/' }, host: origin }
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] }, sitemap: markets.flatMap((market) => market.supportedLocales.map((locale) => `${origin}/${market.code.toLowerCase()}/${locale.toLowerCase()}/sitemap.xml`)), host: origin }
}

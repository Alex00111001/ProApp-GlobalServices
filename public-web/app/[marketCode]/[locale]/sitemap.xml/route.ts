import { fetchSitemap } from '../../../../lib/content-api'
export const dynamic = 'force-dynamic'
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
export async function GET(_request: Request, { params }: { params: Promise<{ marketCode: string; locale: string }> }) {
  const { marketCode, locale } = await params
  const result = await fetchSitemap(marketCode, locale)
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${result.urls.map((url) => `<url><loc>${escape(url.location)}</loc><lastmod>${escape(new Date(url.lastModified).toISOString())}</lastmod></url>`).join('')}</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=300', 'x-content-type-options': 'nosniff' } })
}

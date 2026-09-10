import 'server-only'

export type ContentBlock = { type: 'heading' | 'paragraph' | 'list' | 'faq' | 'callout' | 'service_summary' | 'location_summary'; text?: string; level?: number; items?: string[]; question?: string; answer?: string }
export type PublishedPage = { key: string; type: string; marketCode: string; locale: string; title: string; summary: string; body: ContentBlock[]; seo: { title: string; description: string; canonical: string; robots: string; alternates?: Record<string, string>; openGraph?: Record<string, unknown>; structuredData?: Record<string, unknown> }; publishedAt: string; etag: string }
export type ActiveMarket = { code: string; supportedLocales: string[] }
const API = process.env.CORE_API_BASE_URL || 'http://127.0.0.1:5000/api'
const segment = (value: string) => encodeURIComponent(value)

export async function fetchPage(params: { marketCode: string; locale: string; type: string; slug: string }): Promise<PublishedPage | null> {
  const url = `${API}/v1/public/content/${segment(params.marketCode)}/${segment(params.locale)}/${segment(params.type)}/${segment(params.slug)}`
  const response = await fetch(url, { next: { revalidate: 60 }, headers: { accept: 'application/json' } })
  if (response.status === 404 || response.status === 503) return null
  if (!response.ok) throw new Error(`Public content API failed with ${response.status}`)
  return response.json() as Promise<PublishedPage>
}

export async function fetchSitemap(marketCode: string, locale: string): Promise<{ urls: { location: string; lastModified: string }[] }> {
  const response = await fetch(`${API}/v1/public/sitemap/${segment(marketCode)}/${segment(locale)}`, { next: { revalidate: 300 }, headers: { accept: 'application/json' } })
  if (!response.ok) return { urls: [] }
  return response.json() as Promise<{ urls: { location: string; lastModified: string }[] }>
}

export async function fetchActiveMarkets(): Promise<ActiveMarket[]> {
  const response = await fetch(`${API}/v1/markets`, { next: { revalidate: 300 }, headers: { accept: 'application/json' } })
  if (!response.ok) return []
  const body = await response.json() as { items?: ActiveMarket[] }
  return Array.isArray(body.items) ? body.items.slice(0, 50) : []
}

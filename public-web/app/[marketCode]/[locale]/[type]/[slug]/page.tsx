import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchPage, type ContentBlock } from '../../../../../lib/content-api'

type Props = { params: Promise<{ marketCode: string; locale: string; type: string; slug: string }> }
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await fetchPage(await params)
  if (!page) return { title: 'Contenido no disponible', robots: { index: false, follow: false } }
  const index = page.seo.robots === 'index,follow'
  return {
    title: page.seo.title, description: page.seo.description, alternates: { canonical: page.seo.canonical, languages: page.seo.alternates },
    robots: { index, follow: index }, openGraph: { title: page.seo.title, description: page.seo.description, url: page.seo.canonical, type: 'website' },
  }
}

function Block({ block, index }: { block: ContentBlock; index: number }) {
  if (block.type === 'heading') { const Tag = block.level === 3 ? 'h3' : block.level === 4 ? 'h4' : 'h2'; return <Tag>{block.text}</Tag> }
  if (block.type === 'list') return <ul>{block.items?.map((item) => <li key={item}>{item}</li>)}</ul>
  if (block.type === 'faq') return <dl><div><dt>{block.question}</dt><dd>{block.answer}</dd></div></dl>
  if (block.type === 'callout') return <aside className="callout">{block.text}</aside>
  return <p data-block={block.type} data-position={index}>{block.text}</p>
}

export default async function PublishedContent({ params }: Props) {
  const page = await fetchPage(await params)
  if (!page) notFound()
  const jsonLd = page.seo.structuredData ? JSON.stringify(page.seo.structuredData).replaceAll('<', '\\u003c') : null
  return <article><h1>{page.title}</h1><p className="summary">{page.summary}</p>{page.body.map((block, index) => <Block key={`${block.type}-${index}`} block={block} index={index} />)}{jsonLd ? <script type="application/ld+json">{jsonLd}</script> : null}</article>
}

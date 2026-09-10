import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Mercado no seleccionado', robots: { index: false, follow: false } }
export default function Home() { return <article><h1>HomeServices</h1><p className="summary">Selecciona una página publicada desde una experiencia de mercado admitida.</p></article> }

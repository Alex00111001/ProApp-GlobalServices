import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Contenido no disponible', robots: { index: false, follow: false } }
export default function NotFound() { return <article><h1>Contenido no disponible</h1><p className="summary">Esta página no existe, fue retirada o no está habilitada para este mercado.</p></article> }

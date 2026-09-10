import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = { title: { default: 'HomeServices', template: '%s · HomeServices' }, robots: { index: false, follow: false } }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><header><Link href="/">HomeServices</Link><span>Servicios locales de confianza</span></header><main>{children}</main><footer>La disponibilidad depende del mercado activo y de contenido editorial aprobado.</footer></body></html>
}

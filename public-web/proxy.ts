import { NextRequest, NextResponse } from 'next/server'

const API = process.env.CORE_API_BASE_URL || 'http://127.0.0.1:5000/api'
const safeInternalPath = (value: unknown): value is string => typeof value === 'string'
  && value.startsWith('/') && !value.startsWith('//') && !value.includes('..') && !value.includes('\\')

const contentSecurityPolicy = (nonce: string) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

async function configuredRedirect(pathname: string) {
  try {
    const response = await fetch(`${API}/v1/public/redirect?path=${encodeURIComponent(pathname)}`, {
      cache: 'no-store', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return null
    const value = await response.json() as { targetPath?: unknown; httpStatus?: unknown } | null
    if (!value || !safeInternalPath(value.targetPath) || ![301, 308, 410].includes(Number(value.httpStatus))) return null
    return { targetPath: value.targetPath, httpStatus: Number(value.httpStatus) as 301 | 308 | 410 }
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const redirect = await configuredRedirect(request.nextUrl.pathname)
  if (redirect?.httpStatus === 410) {
    return new NextResponse(null, { status: 410, headers: { 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } })
  }
  if (redirect) return NextResponse.redirect(new URL(redirect.targetPath, request.url), redirect.httpStatus)

  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  const policy = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', policy)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', policy)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

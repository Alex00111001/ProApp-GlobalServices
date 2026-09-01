const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim()

if (configuredApiUrl) {
  const parsed = new URL(configuredApiUrl)
  if (parsed.username || parsed.password) throw new Error('VITE_API_URL must not contain credentials.')
  if (import.meta.env.PROD && parsed.protocol !== 'https:') throw new Error('VITE_API_URL must use HTTPS in production.')
}

// Same-origin is the secure production default; development keeps the explicit
// local API endpoint when no environment override is supplied.
export const API_URL = (configuredApiUrl || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api')).replace(/\/$/, '')

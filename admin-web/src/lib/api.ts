import { session } from '../state/session'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}), ...init.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) session.clear()
    throw new Error(body.error || body.message || `Request failed (${response.status})`)
  }
  return body as T
}

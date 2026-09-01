import { useSyncExternalStore } from 'react'
import { API_URL } from '../lib/config'
import { sessionResponseSchema } from '../lib/contracts'
import type { SessionResponse } from '../lib/contracts'

const CSRF_KEY = 'homeservices_admin_csrf'
type SessionStatus = 'loading' | 'anonymous' | 'authenticated'
type Snapshot = {
  status: SessionStatus
  accessToken: string | null
  csrfToken: string | null
  user: SessionResponse['user'] | null
  roles: SessionResponse['roles']
  permissions: ReadonlySet<string>
  expiresAt: Date | null
}

let snapshot: Snapshot = {
  status: 'loading', accessToken: null, csrfToken: sessionStorage.getItem(CSRF_KEY), user: null,
  roles: [], permissions: new Set(), expiresAt: null,
}
let initialized = false
let refreshPromise: Promise<boolean> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const setSnapshot = (next: Snapshot) => { snapshot = next; emit() }
const clear = () => {
  sessionStorage.removeItem(CSRF_KEY)
  setSnapshot({ status: 'anonymous', accessToken: null, csrfToken: null, user: null, roles: [], permissions: new Set(), expiresAt: null })
}
const apply = (result: SessionResponse) => {
  sessionStorage.setItem(CSRF_KEY, result.csrfToken)
  setSnapshot({
    status: 'authenticated', accessToken: result.accessToken, csrfToken: result.csrfToken,
    user: result.user, roles: result.roles, permissions: new Set(result.permissions), expiresAt: result.session.expiresAt,
  })
}
const authRequest = async (path: string, init: RequestInit) => {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error((body as { error?: string }).error || 'Authentication failed.'), { status: response.status })
  return sessionResponseSchema.parse(body)
}
const refresh = async () => {
  if (!snapshot.csrfToken) { clear(); return false }
  if (refreshPromise) return refreshPromise
  refreshPromise = authRequest('/v1/admin/auth/refresh', { method: 'POST', headers: { 'x-admin-csrf-token': snapshot.csrfToken } })
    .then((result) => { apply(result); return true })
    .catch(() => { clear(); return false })
    .finally(() => { refreshPromise = null })
  return refreshPromise
}
const initialize = async () => {
  if (initialized) return
  initialized = true
  if (!snapshot.csrfToken) { clear(); return }
  await refresh()
}
const login = async (email: string, password: string) => {
  const result = await authRequest('/v1/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  apply(result)
}
const logout = async () => {
  try {
    if (snapshot.accessToken) await fetch(`${API_URL}/v1/admin/auth/logout`, {
      method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${snapshot.accessToken}` },
    })
  } finally { clear() }
}

export const session = {
  clear, getSnapshot: () => snapshot, initialize, login, logout, refresh,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
}
export function useSession() {
  const current = useSyncExternalStore(session.subscribe, session.getSnapshot)
  return { ...current, initialize, login, logout, can: (permission: string) => current.permissions.has(permission) }
}

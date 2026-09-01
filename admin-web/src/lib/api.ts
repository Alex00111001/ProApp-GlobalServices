import type { ZodType } from 'zod'
import { API_URL } from './config'
import { session } from '../state/session'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly correlationId?: string
  constructor(message: string, status: number, code?: string, correlationId?: string) {
    super(message); this.status = status; this.code = code; this.correlationId = correlationId
  }
}
type ApiOptions<T> = RequestInit & { schema?: ZodType<T>; retryAuth?: boolean }

export async function api<T = unknown>(path: string, options: ApiOptions<T> = {}): Promise<T> {
  const { schema, retryAuth = true, ...init } = options
  const accessToken = session.getSnapshot().accessToken
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'x-correlation-id': crypto.randomUUID(),
      ...init.headers,
    },
  })
  if (response.status === 401 && retryAuth && await session.refresh()) return api(path, { ...options, retryAuth: false })
  if (response.status === 204) return undefined as T
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = body as { error?: string; message?: string; code?: string; correlationId?: string }
    throw new ApiError(error.error || error.message || `Request failed (${response.status})`, response.status, error.code, error.correlationId)
  }
  return schema ? schema.parse(body) : body as T
}

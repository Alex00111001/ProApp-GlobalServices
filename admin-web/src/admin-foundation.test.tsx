import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { navigation } from './navigation'
import { api } from './lib/api'
import { session } from './state/session'

const sessionPayload = {
  accessToken: 'access-token-with-more-than-twenty-characters',
  csrfToken: 'csrf-token-with-more-than-twenty-characters',
  accessTokenExpiresInSeconds: 900,
  session: { id: 'session-1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
  user: { id: 'user-1', email: 'admin@example.com', firstName: 'Ada', lastName: 'Admin', role: 'ADMIN', isActive: true, countryCode: 'ES' },
  roles: [{ id: 'role-1', key: 'OPERATIONS_ADMIN', name: 'Operations Admin' }],
  permissions: ['dashboard.read', 'users.read'],
}

afterEach(() => { session.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

describe('admin session boundary', () => {
  it('keeps the access token in memory and stores only the CSRF verifier in sessionStorage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionPayload), { status: 201, headers: { 'content-type': 'application/json' } })))
    await session.login('admin@example.com', 'correct-password')
    expect(session.getSnapshot().accessToken).toBe(sessionPayload.accessToken)
    expect(sessionStorage.getItem('homeservices_admin_csrf')).toBe(sessionPayload.csrfToken)
    expect(sessionStorage.getItem('homeservices_admin_token')).toBeNull()
  })

  it('surfaces stable API authorization errors with correlation evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Forbidden', code: 'INSUFFICIENT_PERMISSION', correlationId: 'corr-1' }), { status: 403, headers: { 'content-type': 'application/json' } })))
    await expect(api('/v1/admin/users')).rejects.toEqual(expect.objectContaining({ status: 403, code: 'INSUFFICIENT_PERMISSION', correlationId: 'corr-1' }))
  })
})

describe('permission-derived navigation', () => {
  it('declares a permission requirement for every control-center destination', () => {
    expect(navigation.every((item) => item.permissions.length > 0)).toBe(true)
    expect(navigation.find((item) => item.to === '/users')?.permissions).toContain('users.read')
  })

  it('renders only destinations granted by the effective session permissions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionPayload), { status: 201, headers: { 'content-type': 'application/json' } })))
    await session.login('admin@example.com', 'correct-password')
    render(<MemoryRouter><AdminLayout /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Auditoría' })).toBeNull()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminLayout } from './components/AdminLayout'
import { OperationsPage } from './pages/OperationsPage'
import { GrowthPage } from './pages/GrowthPage'
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
    expect(navigation.find((item) => item.to === '/marketing')?.permissions).toEqual(['marketing.read'])
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

describe('F5 operations control', () => {
  it('renders only operational modules granted by the backend permission set', async () => {
    const operationsSession = { ...sessionPayload, permissions: ['operations.read', 'errors.read', 'health.read'] }
    const overview = {
      generatedAt: new Date().toISOString(),
      health: { status: 'HEALTHY', checkedAt: new Date().toISOString(), service: 'homeservices-core-api', dependencies: { database: { service: 'database', status: 'HEALTHY', latencyMs: 4 } } },
      errors: { OPEN: 2 }, incidents: {}, jobs: {}, integrations: {}, support: {},
      financialAttention: { failedRefunds: 0, failedPayouts: 0, activeDisputes: 0, latestReconciliation: null },
      freshness: { latestErrorAt: null, latestIncidentAt: null, partialData: false },
    }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(operationsSession), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(overview), { status: 200, headers: { 'content-type': 'application/json' } })))
    await session.login('admin@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><OperationsPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Errores abiertos')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Errores' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Health' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Jobs, integraciones/ })).toBeNull()
  })
})

describe('F6 growth data', () => {
  it('renders defined first-party metrics without exposing campaign mutation to read-only sessions', async () => {
    const growthSession = { ...sessionPayload, permissions: ['marketing.read'] }
    const now = new Date().toISOString()
    const overview = {
      range: { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z', timezone: 'UTC', campaignId: null, countryCode: null },
      generatedAt: now,
      freshness: { latestEventReceivedAt: now, partialData: false },
      metrics: { events: 120, leads: 75, conversions: 20, activeCampaigns: 2 },
      conversions: { SIGNUP: 20 },
      definitions: {
        events: { label: 'Eventos aceptados', unit: 'count', source: 'MarketingEvent', description: 'Eventos first-party aceptados.' },
        leads: { label: 'Leads observados', unit: 'count', source: 'Lead', description: 'Sujetos seudónimos observados.' },
        conversions: { label: 'Conversiones', unit: 'count', source: 'Conversion', description: 'Hitos idempotentes.' },
        activeCampaigns: { label: 'Campañas activas', unit: 'count', source: 'Campaign', description: 'Campañas internas.' },
      },
    }
    const funnel = {
      range: overview.range,
      generatedAt: now,
      definition: 'Observed unique pseudonymous leads.',
      stages: [{ eventName: 'app_opened', key: 'visitors', label: 'App abierta', occurrences: 120, subjects: 75, rateFromFirst: '100.00', rateFromPrevious: '100.00' }],
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const value = url.includes('/auth/login') ? growthSession : url.includes('/growth/overview') ? overview : funnel
      return new Response(JSON.stringify(value), { status: url.includes('/auth/login') ? 201 : 200, headers: { 'content-type': 'application/json' } })
    }))
    await session.login('admin@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><GrowthPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Eventos aceptados')).toBeTruthy()
    expect(await screen.findByText('Sujetos únicos por etapa')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nueva campaña' })).toBeNull()
  })
})

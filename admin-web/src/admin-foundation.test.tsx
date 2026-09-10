import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminLayout } from './components/AdminLayout'
import { OperationsPage } from './pages/OperationsPage'
import { GrowthPage } from './pages/GrowthPage'
import { PrivacyAttributionPage } from './pages/PrivacyAttributionPage'
import { ReferralsAutomationPage } from './pages/ReferralsAutomationPage'
import { MarketsPage } from './pages/MarketsPage'
import { ExperimentsContentSeoPage } from './pages/ExperimentsContentSeoPage'
import { SupplyDemandAIPage } from './pages/SupplyDemandAIPage'
import { navigation } from './navigation'
import { aiExecutionListSchema, aiOperationListSchema, contentEntryListSchema, experimentListSchema, expansionListSchema, readinessEvaluationListSchema, seoRedirectListSchema, supplyDemandSnapshotListSchema } from './lib/contracts'
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
    expect(navigation.find((item) => item.to === '/privacy-attribution')?.permissions).toContain('privacy.policy.read')
    expect(navigation.find((item) => item.to === '/referrals-automation')?.permissions).toContain('automation.execution.read')
    expect(navigation.find((item) => item.to === '/markets')?.permissions).toContain('markets.read')
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

describe('F8.5 markets, identity, and geography', () => {
  it('renders server-owned lifecycle, policy, and official import evidence without read-only mutations', async () => {
    const f85Session = { ...sessionPayload, permissions: ['markets.read', 'geography.read', 'identity.policy.read'] }
    const now = new Date().toISOString()
    const markets = { items: [{ code: 'BR', countryCode: 'BR', status: 'DISABLED', currencyCode: 'BRL', defaultLocale: 'pt-BR', supportedLocales: ['pt-BR', 'en'], capabilities: { registration: true }, currentPolicyVersion: 1, effectiveAt: null, updatedAt: now, policy: { version: 1, status: 'DRAFT', reviewStatus: 'PENDING', reviewReference: null, schemaDigest: 'a'.repeat(64) }, counts: { users: 0, serviceAreas: 0 } }], pagination: { page: 1, limit: 50, totalItems: 1, totalPages: 1 } }
    const policies = { items: [{ id: 'policy-br-1', version: 1, status: 'DRAFT', reviewStatus: 'PENDING', reviewReference: null, schemaDigest: 'a'.repeat(64), createdBy: null, reviewedBy: null, reviewedAt: null, effectiveAt: null, retiredAt: null, createdAt: now, market: { code: 'BR', status: 'DISABLED' } }], pagination: markets.pagination }
    const imports = { items: [{ id: 'import-br-1', sourceKey: 'IBGE_DTB', sourceVersion: '2025', status: 'COMPLETED', rowCount: 5598, insertedCount: 5598, updatedCount: 0, deprecatedCount: 0, checksumSha256: 'b'.repeat(64), retrievedAt: now, completedAt: now, country: { isoAlpha2: 'BR' } }], pagination: markets.pagination }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const value = url.includes('/auth/login') ? f85Session : url.includes('/geography/imports') ? imports : url.includes('/identity/policies') ? policies : markets
      return new Response(JSON.stringify(value), { status: url.includes('/auth/login') ? 201 : 200, headers: { 'content-type': 'application/json' } })
    }))
    await session.login('admin@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><MarketsPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Mercados configurados')).toBeTruthy()
    expect(await screen.findByText('Políticas versionadas')).toBeTruthy()
    expect(await screen.findByText('Importaciones versionadas')).toBeTruthy()
    expect(screen.getByText('IBGE_DTB')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cambiar estado' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })
})

describe('F8 referrals and automation', () => {
  it('renders persisted program versions for a read-only referrals session', async () => {
    const f8Session = { ...sessionPayload, permissions: ['referrals.read'] }
    const now = new Date().toISOString()
    const programs = { items: [{
      id: 'program-1', key: 'client-es', name: 'Invita clientes ES', status: 'ACTIVE', currentVersion: 2, rowVersion: 3,
      featureFlagKey: 'referrals.client.es', effectiveAt: now, endsAt: null, createdAt: now, updatedAt: now,
      versions: [{ id: 'version-2', version: 2, referrerActorType: 'CLIENT', referredActorType: 'CLIENT', enabledMarkets: ['ES'], qualifyingEventType: 'booking.completed', waitingPeriodHours: 24, cancellationWindowHours: 48, maxCodesPerOwner: 1, maxUsesPerCode: 10, maxReferralsPerOwner: 10, rewardType: 'NON_MONETARY', referrerRewardAmount: null, referredRewardAmount: null, currency: null, nonMonetaryBenefitKey: 'priority-support', configurationDigest: 'a'.repeat(64), createdAt: now }],
      _count: { codes: 4, referrals: 7 },
    }], pagination: { page: 1, limit: 25, totalItems: 1, totalPages: 1 } }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); const value = url.includes('/auth/login') ? f8Session : programs
      return new Response(JSON.stringify(value), { status: url.includes('/auth/login') ? 201 : 200, headers: { 'content-type': 'application/json' } })
    }))
    await session.login('admin@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><ReferralsAutomationPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Invita clientes ES')).toBeTruthy()
    expect(screen.getByText('booking.completed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Automatizaciones' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por estado' }), { target: { value: 'DRAFT' } })
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('status=DRAFT'))).toBe(true))
  })
})

describe('F7 consent and attribution', () => {
  it('renders real versioned policies and hides lifecycle mutations from read-only sessions', async () => {
    const privacySession = { ...sessionPayload, permissions: ['privacy.policy.read'] }
    const policyList = { items: [{
      id: 'policy-1', key: 'marketing-es', purpose: 'marketing_attribution', version: 3, countryCode: 'ES', locale: 'es',
      status: 'ACTIVE', legalBasis: 'consent', enforcementMode: 'EXPLICIT_GRANT', documentReference: 'https://legal.example/v3', documentDigest: 'a'.repeat(64),
      effectiveAt: new Date().toISOString(), retiredAt: null, retentionDays: 365, reviewStatus: 'APPROVED', reviewReference: 'LEGAL-2026-03', reviewedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }], pagination: { page: 1, limit: 25, totalItems: 1, totalPages: 1 } }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); const value = url.includes('/auth/login') ? privacySession : policyList
      return new Response(JSON.stringify(value), { status: url.includes('/auth/login') ? 201 : 200, headers: { 'content-type': 'application/json' } })
    }))
    await session.login('admin@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><PrivacyAttributionPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('marketing-es v3')).toBeTruthy()
    expect(screen.getByText('EXPLICIT_GRANT')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nueva versión de política' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull()
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

describe('F9 experiments, content and SEO', () => {
  it('validates all three paginated operational contracts', () => {
    const pagination = { page: 1, limit: 25, totalItems: 0, totalPages: 1 }
    expect(experimentListSchema.parse({ items: [], pagination }).items).toHaveLength(0)
    expect(contentEntryListSchema.parse({ items: [], pagination }).items).toHaveLength(0)
    expect(seoRedirectListSchema.parse({ items: [], pagination }).items).toHaveLength(0)
  })

  it('publishes one permission-derived F9 navigation destination', () => {
    const item = navigation.find((candidate) => candidate.phase === 'F9')
    expect(item).toEqual(expect.objectContaining({ to: '/experiments-content-seo' }))
    expect(item?.permissions).toEqual(['experiments.read', 'content.read', 'seo.read'])
  })

  it('renders server-backed experiments without exposing activation to read-only analysts', async () => {
    const now = new Date().toISOString()
    const readSession = { ...sessionPayload, permissions: ['experiments.read', 'experiments.results.read'] }
    const list = { items: [{ id: 'experiment-1', key: 'booking-layout', name: 'Booking layout', description: null, status: 'RUNNING', currentVersion: 2, rowVersion: 4, layerKey: 'booking', surface: 'booking.checkout', featureFlagKey: 'experiments.booking', trafficAllocationBps: 5000, killSwitch: false, createdAt: now, updatedAt: now, market: { code: 'ES' }, versions: [{ id: 'version-1', version: 1, purpose: 'product_experimentation', timezone: 'Europe/Madrid', minimumSampleSize: 100, significanceAlpha: 0.05, configurationDigest: 'a'.repeat(64), startAt: now, endAt: null, analysisAt: null, audience: null, variants: [{ id: 'variant-1', key: 'control', name: 'Control', isControl: true, weightBps: 5000, payload: {} }, { id: 'variant-2', key: 'compact', name: 'Compact', isControl: false, weightBps: 5000, payload: {} }], metrics: [], snapshots: [] }] }], pagination: { page: 1, limit: 25, totalItems: 1, totalPages: 1 } }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { const url = String(input); return new Response(JSON.stringify(url.includes('/auth/login') ? readSession : list), { status: url.includes('/auth/login') ? 201 : 200, headers: { 'content-type': 'application/json' } }) }))
    await session.login('analyst@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><ExperimentsContentSeoPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Booking layout')).toBeTruthy()
    expect(screen.getByText('booking.checkout')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'PAUSED' })).toBeNull()
  })
})

describe('F10 supply, demand and AI Operations', () => {
  it('validates all persisted operational contracts', () => {
    const pagination = { page: 1, limit: 25, totalItems: 0, totalPages: 1 }
    for (const schema of [supplyDemandSnapshotListSchema, readinessEvaluationListSchema, expansionListSchema, aiOperationListSchema, aiExecutionListSchema]) {
      expect(schema.parse({ items: [], pagination }).items).toHaveLength(0)
    }
  })

  it('publishes one permission-derived F10 navigation destination', () => {
    const item = navigation.find((candidate) => candidate.phase === 'F10')
    expect(item).toEqual(expect.objectContaining({ to: '/supply-demand-ai' }))
    expect(item?.permissions).toEqual(['supplyDemand.read', 'readiness.read', 'expansion.read', 'ai.operations.read'])
  })

  it('renders deterministic snapshots without exposing AI or activation controls to a read-only analyst', async () => {
    const now = new Date().toISOString()
    const readSession = { ...sessionPayload, permissions: ['supplyDemand.read'] }
    const snapshots = { items: [{ id: 'snapshot-1', snapshotKey: 'a'.repeat(64), window: 'SEVEN_DAYS', windowStart: now, windowEnd: now, status: 'PARTIAL', components: { eligibleProfessionals: 4, verifiedProfessionals: 3, activeServiceAreas: 5, requestDemand: 10, unmetDemand: 4, bookingAttempts: 8 }, balance: { fulfilmentRate: 0.6, requestsPerProfessional: 2.5, geographicCoverage: 0.5 }, anomalies: [{ key: 'demand_spike' }], missingEvidence: ['time_to_match_unavailable'], algorithmVersion: 'supply-demand-v1', inputDigest: 'b'.repeat(64), generatedAt: now, market: { code: 'ES', status: 'DISABLED' }, division: null, service: null }], pagination: { page: 1, limit: 25, totalItems: 1, totalPages: 1 } }
    vi.stubGlobal('fetch', vi.fn(async (request: RequestInfo | URL) => { const url = String(request); return new Response(JSON.stringify(url.includes('/auth/login') ? readSession : snapshots), { status: url.includes('/auth/login') ? 201 : 200, headers: { 'content-type': 'application/json' } }) }))
    await session.login('analyst@example.com', 'correct-password')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter><SupplyDemandAIPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Oferta y demanda')).toBeTruthy()
    expect(screen.getByText('10 requests')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'AI Operations' })).toBeNull()
    expect(screen.getByText('DISABLED')).toBeTruthy()
  })
})

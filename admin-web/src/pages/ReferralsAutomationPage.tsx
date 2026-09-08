import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  automationDefinitionListSchema, automationExecutionListSchema,
  referralCodeListSchema, referralConversionListSchema, referralListSchema,
  referralProgramListSchema, referralRewardListSchema,
} from '../lib/contracts'
import { PageHeader, Pagination, QueryState, StatusBadge } from '../components/PagePrimitives'
import { dateTime } from '../lib/format'
import { useSession } from '../state/session'

type Section = 'programs' | 'codes' | 'referrals' | 'conversions' | 'rewards' | 'definitions' | 'executions' | 'dead-letter'

function usePage() {
  const [page, setPage] = useState(1)
  return { page, setPage, query: `page=${page}&limit=25` }
}

function ProgramsPanel() {
  const state = usePage()
  const query = useQuery({ queryKey: ['f8-programs', state.page], queryFn: () => api(`/v1/admin/referrals/programs?${state.query}`, { schema: referralProgramListSchema }) })
  return <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Programa</th><th>Estado</th><th>Versión</th><th>Mercados</th><th>Conversión</th><th>Uso</th></tr></thead><tbody>{query.data.items.map((item) => { const version = item.versions[0]; return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.key}</small></td><td><StatusBadge value={item.status} /></td><td>v{item.currentVersion}<small>{item.featureFlagKey}</small></td><td>{version?.enabledMarkets.join(', ') || '—'}</td><td>{version?.qualifyingEventType || '—'}<small>{version ? `${version.waitingPeriodHours} h de espera` : '—'}</small></td><td>{item._count.codes} códigos · {item._count.referrals} referrals</td></tr> })}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState>
}

function CodesPanel() {
  const state = usePage(); const query = useQuery({ queryKey: ['f8-codes', state.page], queryFn: () => api(`/v1/admin/referrals/codes?${state.query}`, { schema: referralCodeListSchema }) })
  return <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Código</th><th>Programa</th><th>Estado</th><th>Usos</th><th>Expira</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td><code>{item.code}</code></td><td>{item.program.name}<small>{item.program.key}</small></td><td><StatusBadge value={item.status} /></td><td>{item.useCount} / {item.maxUses}</td><td>{item.expiresAt ? dateTime(item.expiresAt) : 'Sin expiración'}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState>
}

function ReferralsPanel() {
  const state = usePage(); const query = useQuery({ queryKey: ['f8-referrals', state.page], queryFn: () => api(`/v1/admin/referrals/referrals?${state.query}`, { schema: referralListSchema }) })
  return <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Creado</th><th>Programa</th><th>Mercado</th><th>Estado</th><th>Riesgo</th><th>Evidencia</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{item.program.name}<small>{item.program.key}</small></td><td>{item.market}</td><td><StatusBadge value={item.status} /></td><td><StatusBadge value={item.riskStatus} /><small>{item.rejectionCode || 'Sin rechazo'}</small></td><td>{item._count.conversions} conversiones · {item._count.rewards} rewards</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState>
}

function ConversionsPanel() {
  const state = usePage(); const query = useQuery({ queryKey: ['f8-conversions', state.page], queryFn: () => api(`/v1/admin/referrals/conversions?${state.query}`, { schema: referralConversionListSchema }) })
  return <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Evento autoritativo</th><th>Estado</th><th>Conversion F6</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td>{dateTime(item.occurredAt)}</td><td>{item.eventType}<small><code>{item.sourceOutboxEventId}</code></small></td><td><StatusBadge value={item.status} /></td><td>{item.sourceConversionId || 'No enlazada'}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState>
}

function RewardsPanel() {
  const state = usePage(); const query = useQuery({ queryKey: ['f8-rewards', state.page], queryFn: () => api(`/v1/admin/referrals/rewards?${state.query}`, { schema: referralRewardListSchema }) })
  return <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Creado</th><th>Beneficiario</th><th>Tipo</th><th>Valor calculado</th><th>Estado</th><th>Intent financiero</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{item.beneficiarySide}</td><td>{item.rewardType}</td><td>{item.amount ? `${item.amount} ${item.currency}` : item.benefitKey || '—'}</td><td><StatusBadge value={item.status} /></td><td>{item.financialIntentId ? <code>{item.financialIntentId}</code> : 'No preparado'}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState>
}

function DefinitionsPanel() {
  const state = usePage(); const query = useQuery({ queryKey: ['f8-definitions', state.page], queryFn: () => api(`/v1/admin/automation/definitions?${state.query}`, { schema: automationDefinitionListSchema }) })
  return <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Automatización</th><th>Estado</th><th>Versión</th><th>Trigger</th><th>Acciones</th></tr></thead><tbody>{query.data.items.map((item) => { const version = item.versions.find((value) => value.version === item.currentVersion) || item.versions[0]; return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.key}</small></td><td><StatusBadge value={item.status} /></td><td>v{item.currentVersion}<small><code>{version?.configurationDigest.slice(0, 12)}</code></small></td><td>{version?.trigger.eventType || '—'}<small>schema v{version?.trigger.schemaVersion || 0}</small></td><td>{version?.actions.map((action) => action.actionType).join(', ') || '—'}</td></tr> })}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState>
}

function ExecutionsPanel({ deadLetter = false }: { deadLetter?: boolean }) {
  const state = usePage(); const path = deadLetter ? 'dead-letter' : 'executions'; const query = useQuery({ queryKey: [`f8-${path}`, state.page], queryFn: () => api(`/v1/admin/automation/${path}?${state.query}`, { schema: automationExecutionListSchema }) })
  return <><div className="freshness"><strong>Replay manual desactivado</strong><span>Las ejecuciones agotadas requieren investigación y una nueva señal autoritativa.</span></div><QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Creado</th><th>Definición</th><th>Estado</th><th>Intentos</th><th>Evento</th><th>Correlación</th><th>Error seguro</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{item.automationVersion.definition.name}<small>v{item.automationVersion.version}</small></td><td><StatusBadge value={item.status} /></td><td>{item.attemptCount}<small>{item.steps.length} pasos</small></td><td><code>{item.triggerEventId}</code></td><td><code>{item.correlationId || item.traceId || '—'}</code></td><td>{item.lastError || '—'}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={state.setPage} /></article>}</QueryState></>
}

export function ReferralsAutomationPage() {
  const { can } = useSession(); const [section, setSection] = useState<Section>('programs')
  const availableTabs: Array<{ key: Section; label: string; permission: string }> = [
    { key: 'programs', label: 'Programas', permission: 'referrals.read' }, { key: 'codes', label: 'Códigos', permission: 'referrals.read' }, { key: 'referrals', label: 'Referrals', permission: 'referrals.read' }, { key: 'conversions', label: 'Conversiones', permission: 'referrals.read' }, { key: 'rewards', label: 'Rewards', permission: 'referrals.rewards.read' }, { key: 'definitions', label: 'Automatizaciones', permission: 'automation.read' }, { key: 'executions', label: 'Ejecuciones', permission: 'automation.execution.read' }, { key: 'dead-letter', label: 'Dead-letter', permission: 'automation.execution.read' },
  ]
  const tabs = availableTabs.filter((tab) => can(tab.permission))
  return <div className="page"><PageHeader eyebrow="F8 Referrals & Automation" title="Referrals y automatización" description="Programas versionados, conversiones autoritativas, rewards sin desembolso y ejecuciones durables con idempotencia. Producción y replay manual permanecen desactivados." /><nav className="operations-tabs" aria-label="Módulos de referrals y automatización">{tabs.map((tab) => <button key={tab.key} className={section === tab.key ? 'active' : 'secondary'} onClick={() => setSection(tab.key)}>{tab.label}</button>)}</nav>{section === 'programs' && <ProgramsPanel />}{section === 'codes' && <CodesPanel />}{section === 'referrals' && <ReferralsPanel />}{section === 'conversions' && <ConversionsPanel />}{section === 'rewards' && <RewardsPanel />}{section === 'definitions' && <DefinitionsPanel />}{section === 'executions' && <ExecutionsPanel />}{section === 'dead-letter' && <ExecutionsPanel deadLetter />}</div>
}

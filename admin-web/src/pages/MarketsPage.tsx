import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { geographyImportListSchema, identityPolicyListSchema, marketListSchema } from '../lib/contracts'
import { PageHeader, QueryState, StatusBadge } from '../components/PagePrimitives'
import { useSession } from '../state/session'
import { dateTime } from '../lib/format'

const transitions: Record<string, string[]> = { DRAFT: ['DISABLED'], DISABLED: ['READY'], READY: ['DISABLED', 'ACTIVE'], ACTIVE: ['SUSPENDED'], SUSPENDED: ['ACTIVE', 'RETIRED'], RETIRED: [] }

export function MarketsPage() {
  const { can } = useSession()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<{ code: string; status: string } | null>(null)
  const [nextStatus, setNextStatus] = useState('')
  const [reason, setReason] = useState('')
  const [policyAction, setPolicyAction] = useState<{ id: string; action: 'review' | 'status'; next: string } | null>(null)
  const [policyReason, setPolicyReason] = useState('')
  const [reviewReference, setReviewReference] = useState('')
  const markets = useQuery({ queryKey: ['markets'], queryFn: () => api('/v1/admin/markets?page=1&limit=50', { schema: marketListSchema }) })
  const imports = useQuery({ queryKey: ['geography-imports'], queryFn: () => api('/v1/admin/geography/imports?page=1&limit=50', { schema: geographyImportListSchema }), enabled: can('geography.read') })
  const policies = useQuery({ queryKey: ['identity-policies'], queryFn: () => api('/v1/admin/identity/policies?page=1&limit=50', { schema: identityPolicyListSchema }), enabled: can('identity.policy.read') })
  const transition = useMutation({
    mutationFn: () => api(`/v1/admin/markets/${selected?.code}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus, reason }) }),
    onSuccess: async () => { setSelected(null); setReason(''); await queryClient.invalidateQueries({ queryKey: ['markets'] }) },
  })
  const changePolicy = useMutation({
    mutationFn: () => {
      if (!policyAction) throw new Error('Selecciona una acción de policy.')
      const isReview = policyAction.action === 'review'
      return api(`/v1/admin/identity/policies/${policyAction.id}/${isReview ? 'review' : 'status'}`, {
        method: isReview ? 'POST' : 'PATCH',
        body: JSON.stringify(isReview
          ? { decision: policyAction.next, reviewReference, reason: policyReason }
          : { status: policyAction.next, reason: policyReason }),
      })
    },
    onSuccess: async () => {
      setPolicyAction(null); setPolicyReason(''); setReviewReference('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['identity-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['markets'] }),
      ])
    },
  })
  return <div className="page"><PageHeader eyebrow="F8.5 Markets / Identity / Geography" title="Mercados y geografía" description="Country y Market están separados. Todas las reglas nacionales y la activación son server-authoritative; producción continúa inactiva." />
    <QueryState loading={markets.isLoading} error={markets.error} empty={!markets.data?.items.length}>{markets.data && <article className="panel table-panel"><header><div><p className="eyebrow">Ciclo de vida</p><h2>Mercados configurados</h2><p>Un país existente no implica un mercado activo. Las transiciones fallan cerradas si policy, revisión legal o geografía oficial no están listas.</p></div></header><div className="table-scroll"><table><thead><tr><th>Mercado</th><th>Estado</th><th>Locale / moneda</th><th>Policy</th><th>Uso</th><th /></tr></thead><tbody>{markets.data.items.map((market) => <tr key={market.code}><td><strong>{market.code}</strong><small>Country {market.countryCode}</small></td><td><StatusBadge value={market.status} /></td><td>{market.defaultLocale}<small>{market.currencyCode} · {market.supportedLocales.join(', ')}</small></td><td>{market.policy ? <><StatusBadge value={market.policy.status} /><small>v{market.policy.version} · revisión {market.policy.reviewStatus}</small></> : 'Sin policy'}</td><td>{market.counts.users} sujetos<small>{market.counts.serviceAreas} áreas</small></td><td>{can('markets.manage') && (transitions[market.status] || []).length > 0 && <button className="table-action" onClick={() => { setSelected({ code: market.code, status: market.status }); setNextStatus(transitions[market.status][0]); setReason('') }}>Cambiar estado</button>}</td></tr>)}</tbody></table></div></article>}</QueryState>
    {selected && <section className="action-panel"><label>Nuevo estado<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{transitions[selected.status].map((status) => <option key={status}>{status}</option>)}</select></label><label>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} /></label><button disabled={reason.trim().length < 8 || transition.isPending} onClick={() => transition.mutate()}>Aplicar transición</button><button className="secondary" onClick={() => setSelected(null)}>Cancelar</button>{transition.error && <p className="error" role="alert">{transition.error.message}</p>}</section>}
    {can('identity.policy.read') && <QueryState loading={policies.isLoading} error={policies.error} empty={!policies.data?.items.length}>{policies.data && <article className="panel table-panel"><header><div><p className="eyebrow">Identidad por mercado</p><h2>Políticas versionadas</h2><p>La revisión jurídica exige un segundo operador. El digest protege el esquema y la activación exige geografía oficial importada.</p></div></header><div className="table-scroll"><table><thead><tr><th>Mercado / versión</th><th>Revisión</th><th>Estado</th><th>Evidencia</th><th>Digest</th><th /></tr></thead><tbody>{policies.data.items.map((policy) => <tr key={policy.id}><td><strong>{policy.market.code} · v{policy.version}</strong><small>mercado {policy.market.status}</small></td><td><StatusBadge value={policy.reviewStatus} /><small>{policy.reviewedAt ? dateTime(policy.reviewedAt) : 'Pendiente'}</small></td><td><StatusBadge value={policy.status} /><small>{policy.effectiveAt ? dateTime(policy.effectiveAt) : 'Sin vigencia'}</small></td><td>{policy.reviewReference || 'Sin referencia'}</td><td><code>{policy.schemaDigest.slice(0, 12)}…</code></td><td>{can('identity.policy.manage') && <>{policy.status === 'DRAFT' && policy.reviewStatus === 'PENDING' && <><button className="table-action" onClick={() => { setPolicyAction({ id: policy.id, action: 'review', next: 'APPROVED' }); setPolicyReason(''); setReviewReference('') }}>Aprobar</button><button className="table-action danger" onClick={() => { setPolicyAction({ id: policy.id, action: 'review', next: 'REJECTED' }); setPolicyReason(''); setReviewReference('') }}>Rechazar</button></>}{policy.status === 'DRAFT' && policy.reviewStatus === 'APPROVED' && <button className="table-action" onClick={() => { setPolicyAction({ id: policy.id, action: 'status', next: 'ACTIVE' }); setPolicyReason('') }}>Activar</button>}{policy.status === 'ACTIVE' && !['ACTIVE', 'READY'].includes(policy.market.status) && <button className="table-action danger" onClick={() => { setPolicyAction({ id: policy.id, action: 'status', next: 'RETIRED' }); setPolicyReason('') }}>Retirar</button>}</>}</td></tr>)}</tbody></table></div></article>}</QueryState>}
    {policyAction && <section className="action-panel"><div><strong>{policyAction.action === 'review' ? `${policyAction.next === 'APPROVED' ? 'Aprobar' : 'Rechazar'} revisión jurídica` : `${policyAction.next === 'ACTIVE' ? 'Activar' : 'Retirar'} policy`}</strong><span>La operación queda registrada en auditoría.</span></div>{policyAction.action === 'review' && <label>Referencia de revisión<input value={reviewReference} onChange={(event) => setReviewReference(event.target.value)} minLength={8} /></label>}<label>Motivo<input value={policyReason} onChange={(event) => setPolicyReason(event.target.value)} minLength={8} /></label><button disabled={policyReason.trim().length < 8 || (policyAction.action === 'review' && reviewReference.trim().length < 8) || changePolicy.isPending} onClick={() => changePolicy.mutate()}>Confirmar</button><button className="secondary" onClick={() => setPolicyAction(null)}>Cancelar</button>{changePolicy.error && <p className="error" role="alert">{changePolicy.error.message}</p>}</section>}
    {can('geography.read') && <QueryState loading={imports.isLoading} error={imports.error} empty={!imports.data?.items.length}>{imports.data && <article className="panel table-panel"><header><div><p className="eyebrow">Fuentes oficiales</p><h2>Importaciones versionadas</h2><p>Los códigos sólo cambian mediante importación allowlisted, checksum y evidencia; no existe edición arbitraria.</p></div></header><div className="table-scroll"><table><thead><tr><th>País / fuente</th><th>Versión</th><th>Estado</th><th>Filas</th><th>Cambios</th><th>Checksum</th></tr></thead><tbody>{imports.data.items.map((item) => <tr key={item.id}><td><strong>{item.country.isoAlpha2.trim()}</strong><small>{item.sourceKey}</small></td><td>{item.sourceVersion}<small>{dateTime(item.retrievedAt)}</small></td><td><StatusBadge value={item.status} /></td><td>{item.rowCount}</td><td>+{item.insertedCount} · ~{item.updatedCount} · −{item.deprecatedCount}</td><td><code>{item.checksumSha256.slice(0, 12)}…</code></td></tr>)}</tbody></table></div></article>}</QueryState>}
  </div>
}

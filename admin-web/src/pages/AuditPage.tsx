import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { auditListSchema } from '../lib/contracts'
import { PageHeader, Pagination, QueryState, SearchBar, StatusBadge } from '../components/PagePrimitives'
import { dateTime } from '../lib/format'

export function AuditPage() {
  const [page, setPage] = useState(1)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey: ['admin-audit', page, search], queryFn: () => api(`/v1/admin/audit?page=${page}&limit=25&search=${encodeURIComponent(search)}`, { schema: auditListSchema }) })
  return <div className="page">
    <PageHeader eyebrow="Trazabilidad" title="Auditoría" description="Quién hizo qué, con resultado y correlación; separado de errores, incidentes y traces." actions={<SearchBar value={input} onChange={setInput} onSubmit={() => { setPage(1); setSearch(input.trim()) }} placeholder="Acción o recurso" />} />
    <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Recurso</th><th>Resultado</th><th>Correlación</th><th>Motivo</th></tr></thead><tbody>{query.data.items.map((entry) => <tr key={entry.id}><td>{dateTime(entry.createdAt)}</td><td>{entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : 'Sistema'}</td><td><code>{entry.action}</code></td><td>{entry.resourceType}<small>{entry.resourceId?.slice(0, 12) || '—'}</small></td><td><StatusBadge value={entry.outcome} /></td><td><code title={entry.correlationId || undefined}>{entry.correlationId?.slice(0, 12) || '—'}</code></td><td>{entry.reason || '—'}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={setPage} /></article>}</QueryState>
  </div>
}

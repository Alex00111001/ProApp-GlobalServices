import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { professionalListSchema } from '../lib/contracts'
import { PageHeader, Pagination, QueryState, SearchBar, StatusBadge } from '../components/PagePrimitives'
import { dateTime } from '../lib/format'
import { useSession } from '../state/session'

const statusOptions = ['APPROVED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE']
export function ProfessionalsPage() {
  const [page, setPage] = useState(1)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{ id: string; name: string; status: string } | null>(null)
  const [status, setStatus] = useState('APPROVED')
  const [reason, setReason] = useState('')
  const { can } = useSession()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['admin-professionals', page, search], queryFn: () => api(`/v1/admin/professionals?page=${page}&limit=25&search=${encodeURIComponent(search)}`, { schema: professionalListSchema }) })
  const mutation = useMutation({ mutationFn: () => api(`/v1/admin/professionals/${selected?.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }), onSuccess: async () => { setSelected(null); setReason(''); await queryClient.invalidateQueries({ queryKey: ['admin-professionals'] }) } })
  return <div className="page">
    <PageHeader eyebrow="Supply" title="Profesionales" description="Verificación, cobertura y estado operativo sin exponer documentos en el listado." actions={<SearchBar value={input} onChange={setInput} onSubmit={() => { setPage(1); setSearch(input.trim()) }} placeholder="Profesional o correo" />} />
    {selected && <section className="action-panel"><div><strong>Cambiar estado de {selected.name}</strong><span>Estado actual: {selected.status}</span></div><label>Nuevo estado<select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.filter((value) => value !== selected.status).map((value) => <option key={value}>{value}</option>)}</select></label><label>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} /></label><button disabled={reason.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>Confirmar</button><button className="secondary" onClick={() => setSelected(null)}>Cancelar</button>{mutation.error && <p className="error" role="alert">{mutation.error.message}</p>}</section>}
    <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Profesional</th><th>Estado</th><th>Experiencia</th><th>Reservas</th><th>Rating</th><th>Evidencia</th><th>Alta</th><th /></tr></thead><tbody>{query.data.items.map((professional) => <tr key={professional.id}><td><strong>{professional.user.firstName} {professional.user.lastName}</strong><small>{professional.user.emailMasked}</small></td><td><StatusBadge value={professional.status} /></td><td>{professional.yearsOfExperience ?? '—'} años</td><td>{professional.totalBookings}</td><td>{professional.averageRating.toFixed(1)} ({professional.totalReviews})</td><td>{professional._count.documents} docs · {professional._count.categories} categorías</td><td>{dateTime(professional.createdAt)}</td><td>{can('professionals.manage') && <button className="table-action" onClick={() => { setSelected({ id: professional.id, name: `${professional.user.firstName} ${professional.user.lastName}`, status: professional.status }); setStatus(statusOptions.find((value) => value !== professional.status) || 'APPROVED'); setReason('') }}>Gestionar</button>}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={setPage} /></article>}</QueryState>
  </div>
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { userListSchema } from '../lib/contracts'
import { PageHeader, Pagination, QueryState, SearchBar, StatusBadge } from '../components/PagePrimitives'
import { dateTime } from '../lib/format'
import { useSession } from '../state/session'

export function UsersPage() {
  const [page, setPage] = useState(1)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{ id: string; name: string; active: boolean } | null>(null)
  const [reason, setReason] = useState('')
  const { can } = useSession()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['admin-users', page, search], queryFn: () => api(`/v1/admin/users?page=${page}&limit=25&search=${encodeURIComponent(search)}`, { schema: userListSchema }) })
  const mutation = useMutation({
    mutationFn: () => api(`/v1/admin/users/${selected?.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !selected?.active, reason }) }),
    onSuccess: async () => { setSelected(null); setReason(''); await queryClient.invalidateQueries({ queryKey: ['admin-users'] }) },
  })
  return <div className="page">
    <PageHeader eyebrow="Identidad" title="Usuarios" description="Cuentas paginadas con PII enmascarada y cambios de estado auditados." actions={<SearchBar value={input} onChange={setInput} onSubmit={() => { setPage(1); setSearch(input.trim()) }} placeholder="Nombre o correo" />} />
    {selected && <section className="action-panel"><div><strong>{selected.active ? 'Desactivar' : 'Reactivar'} a {selected.name}</strong><span>La desactivación revoca todas sus sesiones administrativas.</span></div><label>Motivo operativo<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} /></label><button disabled={reason.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Aplicando…' : 'Confirmar'}</button><button className="secondary" onClick={() => setSelected(null)}>Cancelar</button>{mutation.error && <p className="error" role="alert">{mutation.error.message}</p>}</section>}
    <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>
      {query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Usuario</th><th>Contacto</th><th>Rol base</th><th>País</th><th>Estado</th><th>Último acceso</th><th /></tr></thead><tbody>{query.data.items.map((user) => <tr key={user.id}><td><strong>{user.firstName} {user.lastName}</strong><small>{user.id.slice(0, 8)}</small></td><td>{user.emailMasked}<small>{user.phoneMasked || 'Sin teléfono'}</small></td><td>{user.role}</td><td>{user.countryCode}</td><td><StatusBadge value={user.isActive ? 'ACTIVE' : 'INACTIVE'} /></td><td>{dateTime(user.lastLoginAt)}</td><td>{can('users.manage') && <button className="table-action" onClick={() => { setSelected({ id: user.id, name: `${user.firstName} ${user.lastName}`, active: user.isActive }); setReason('') }}>{user.isActive ? 'Desactivar' : 'Reactivar'}</button>}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={setPage} /></article>}
    </QueryState>
  </div>
}

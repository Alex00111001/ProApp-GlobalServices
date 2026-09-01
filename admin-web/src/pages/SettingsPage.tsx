import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { roleChangeRequestsSchema, rolesSchema, sessionsSchema, userListSchema } from '../lib/contracts'
import { PageHeader, QueryState, StatusBadge } from '../components/PagePrimitives'
import { dateTime } from '../lib/format'
import { useSession } from '../state/session'

export function SettingsPage() {
  const { can } = useSession()
  const queryClient = useQueryClient()
  const sessions = useQuery({ queryKey: ['admin-sessions'], queryFn: () => api('/v1/admin/auth/sessions', { schema: sessionsSchema }) })
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api('/v1/admin/roles', { schema: rolesSchema }), enabled: can('roles.read') })
  const requests = useQuery({ queryKey: ['admin-role-requests'], queryFn: () => api('/v1/admin/role-change-requests', { schema: roleChangeRequestsSchema }), enabled: can('roles.manage') })
  const [targetSearch, setTargetSearch] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const targetUsers = useQuery({
    queryKey: ['admin-role-targets', targetSearch],
    queryFn: () => api(`/v1/admin/users?page=1&limit=20&search=${encodeURIComponent(targetSearch.trim())}`, { schema: userListSchema }),
    enabled: can('roles.manage') && targetSearch.trim().length >= 2,
  })
  const [roleId, setRoleId] = useState('')
  const [action, setAction] = useState('GRANT')
  const [reason, setReason] = useState('')
  const [review, setReview] = useState<{ id: string; decision: 'approve' | 'reject' } | null>(null)
  const [reviewReason, setReviewReason] = useState('')
  const create = useMutation({ mutationFn: () => api('/v1/admin/role-change-requests', { method: 'POST', body: JSON.stringify({ targetUserId, roleId, action, reason, idempotencyKey: `admin-web:${crypto.randomUUID()}` }) }), onSuccess: async () => { setTargetSearch(''); setTargetUserId(''); setReason(''); await queryClient.invalidateQueries({ queryKey: ['admin-role-requests'] }) } })
  const decide = useMutation({ mutationFn: () => api(`/v1/admin/role-change-requests/${review?.id}/${review?.decision}`, { method: 'POST', body: JSON.stringify({ reason: reviewReason }) }), onSuccess: async () => { setReview(null); setReviewReason(''); await queryClient.invalidateQueries({ queryKey: ['admin-role-requests'] }); await queryClient.invalidateQueries({ queryKey: ['admin-roles'] }) } })
  return <div className="page">
    <PageHeader eyebrow="Identidad y acceso" title="Sesiones y RBAC" description="Sesiones revocables y cambios de rol con separación solicitante–revisor." />
    <section className="panel"><header><div><p className="eyebrow">Seguridad</p><h2>Mis sesiones administrativas</h2></div></header><QueryState loading={sessions.isLoading} error={sessions.error} empty={!sessions.data?.sessions.length}>{sessions.data && <div className="table-scroll"><table><thead><tr><th>Creada</th><th>Última actividad</th><th>Expira</th><th>Estado</th><th>Contexto</th></tr></thead><tbody>{sessions.data.sessions.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{dateTime(item.lastSeenAt)}</td><td>{dateTime(item.expiresAt)}</td><td><StatusBadge value={item.status} /></td><td>{item.current ? 'Sesión actual' : item.revocationReason || 'Otra sesión'}</td></tr>)}</tbody></table></div>}</QueryState></section>
    {can('roles.read') && <section className="panel access-section"><header><div><p className="eyebrow">Catálogo</p><h2>Roles del sistema</h2></div></header><QueryState loading={roles.isLoading} error={roles.error} empty={!roles.data?.roles.length}>{roles.data && <div className="role-grid">{roles.data.roles.map((role) => <article key={role.id}><strong>{role.name}</strong><span>{role._count.assignments} asignaciones</span><p>{role.permissions.map(({ permission }) => permission.key).join(' · ')}</p></article>)}</div>}</QueryState></section>}
    {can('roles.manage') && <section className="panel access-section"><header><div><p className="eyebrow">Cuatro ojos</p><h2>Solicitudes de cambio de rol</h2></div></header><form className="role-form" onSubmit={(event) => { event.preventDefault(); create.mutate() }}><label>Buscar usuario<input value={targetSearch} onChange={(event) => { setTargetSearch(event.target.value); setTargetUserId('') }} placeholder="Nombre o correo" minLength={2} required /></label><label>Usuario objetivo<select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} disabled={targetUsers.isLoading || !targetUsers.data?.items.length} required><option value="">{targetUsers.isLoading ? 'Buscando…' : 'Selecciona…'}</option>{targetUsers.data?.items.map((user) => <option value={user.id} key={user.id}>{user.firstName} {user.lastName} · {user.emailMasked}</option>)}</select></label><label>Rol<select value={roleId} onChange={(event) => setRoleId(event.target.value)} required><option value="">Selecciona…</option>{roles.data?.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label><label>Acción<select value={action} onChange={(event) => setAction(event.target.value)}><option>GRANT</option><option>REVOKE</option></select></label><label className="wide">Justificación<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} required /></label><button disabled={create.isPending}>Crear solicitud</button>{targetUsers.error && <p className="error" role="alert">{targetUsers.error.message}</p>}{create.error && <p className="error" role="alert">{create.error.message}</p>}</form>
      {review && <div className="action-panel"><strong>{review.decision === 'approve' ? 'Aprobar y ejecutar' : 'Rechazar'} solicitud</strong><label>Motivo de decisión<input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={10} /></label><button disabled={reviewReason.trim().length < 10 || decide.isPending} onClick={() => decide.mutate()}>Confirmar decisión</button><button className="secondary" onClick={() => setReview(null)}>Cancelar</button></div>}
      <QueryState loading={requests.isLoading} error={requests.error} empty={!requests.data?.requests.length}>{requests.data && <div className="table-scroll"><table><thead><tr><th>Objetivo</th><th>Rol</th><th>Acción</th><th>Solicitante</th><th>Motivo</th><th /></tr></thead><tbody>{requests.data.requests.map((request) => <tr key={request.id}><td>{request.targetUser.firstName} {request.targetUser.lastName}<small>{request.targetUser.emailMasked}</small></td><td>{request.role.name}</td><td><StatusBadge value={request.action} /></td><td>{request.requestedBy.firstName} {request.requestedBy.lastName}</td><td>{request.reason}</td><td><button className="table-action" onClick={() => { setReview({ id: request.id, decision: 'approve' }); setReviewReason('') }}>Aprobar</button><button className="table-action danger" onClick={() => { setReview({ id: request.id, decision: 'reject' }); setReviewReason('') }}>Rechazar</button></td></tr>)}</tbody></table></div>}</QueryState>
    </section>}
  </div>
}

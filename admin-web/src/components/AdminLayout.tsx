import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { navigation } from '../navigation'
import { useSession } from '../state/session'

export function AdminLayout() {
  const { logout, user, roles, permissions } = useSession()
  const navigate = useNavigate()
  const visible = navigation.filter((item) => item.permissions.some((permission) => permissions.has(permission)))
  const signOut = async () => { await logout(); navigate('/login') }
  return <div className="shell">
    <aside className="sidebar" aria-label="Navegación administrativa">
      <div className="brand"><span>HS</span><div>HomeServices<small>Control Center</small></div></div>
      <nav>{visible.map(({ to, label, phase }) => <NavLink key={to} to={to} end={to === '/'}><span>{label}</span>{phase && <small>{phase}</small>}</NavLink>)}</nav>
      <div className="identity"><strong>{user?.firstName} {user?.lastName}</strong><small>{roles.map((role) => role.name).join(', ')}</small></div>
      <button className="logout" onClick={() => void signOut()}>Cerrar sesión</button>
    </aside>
    <main>
      <header className="topbar"><div><strong>Espacio operativo</strong><span>Permisos evaluados por el Core API</span></div><div className="status"><i /> Sesión protegida</div></header>
      <Outlet />
    </main>
  </div>
}

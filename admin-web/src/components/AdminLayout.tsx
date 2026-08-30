import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '../state/session'

const navigation = [
  ['/', 'Dashboard'], ['/marketplace', 'Marketplace'], ['/users', 'Users'], ['/professionals', 'Professionals'],
  ['/bookings', 'Bookings'], ['/revenue', 'Revenue'], ['/marketing', 'Marketing'], ['/operations', 'Operations'],
  ['/support', 'Support'], ['/analytics', 'Analytics'], ['/audit', 'Audit'], ['/settings', 'Settings'],
]

export function AdminLayout() {
  const { logout } = useSession()
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span>HS</span><div>HomeServices<small>Control Center</small></div></div>
      <nav>{navigation.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
      <button className="logout" onClick={logout}>Cerrar sesión</button>
    </aside>
    <main><header className="topbar"><div><strong>Operations workspace</strong><span>Production overview</span></div><div className="status"><i /> Systems monitored</div></header><Outlet /></main>
  </div>
}

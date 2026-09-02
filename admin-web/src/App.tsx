import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { AuditPage } from './pages/AuditPage'
import { BookingsPage } from './pages/BookingsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePage } from './pages/ModulePage'
import { OperationsPage } from './pages/OperationsPage'
import { SupportPage } from './pages/SupportPage'
import { ProfessionalsPage } from './pages/ProfessionalsPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'
import { useSession } from './state/session'
import './App.css'

function RequireSession() {
  const { status } = useSession()
  if (status === 'loading') return <div className="app-loading" role="status">Validando sesión administrativa…</div>
  return status === 'authenticated' ? <AdminLayout /> : <Navigate to="/login" replace />
}
function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = useSession()
  return can(permission) ? children : <div className="page"><article className="panel denied"><span>403</span><h1>Permiso insuficiente</h1><p>El backend también bloqueará esta operación. Solicita el permiso <code>{permission}</code> mediante el flujo de acceso aprobado.</p></article></div>
}

export default function App() {
  const { initialize } = useSession()
  useEffect(() => { void initialize() }, [initialize])
  return <BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireSession />}>
      <Route path="/" element={<RequirePermission permission="dashboard.read"><DashboardPage /></RequirePermission>} />
      <Route path="/users" element={<RequirePermission permission="users.read"><UsersPage /></RequirePermission>} />
      <Route path="/professionals" element={<RequirePermission permission="professionals.read"><ProfessionalsPage /></RequirePermission>} />
      <Route path="/bookings" element={<RequirePermission permission="bookings.read"><BookingsPage /></RequirePermission>} />
      <Route path="/audit" element={<RequirePermission permission="audit.read"><AuditPage /></RequirePermission>} />
      <Route path="/operations" element={<RequirePermission permission="operations.read"><OperationsPage /></RequirePermission>} />
      <Route path="/support" element={<RequirePermission permission="support.read"><SupportPage /></RequirePermission>} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/:module" element={<ModulePage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>
}

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePage } from './pages/ModulePage'
import { useSession } from './state/session'
import './App.css'

const modules = ['marketplace', 'users', 'professionals', 'bookings', 'revenue', 'marketing', 'operations', 'support', 'analytics', 'audit', 'settings']

function ProtectedControlCenter() {
  const { token } = useSession()
  return token ? <AdminLayout /> : <Navigate to="/login" replace />
}

export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedControlCenter />}>
      <Route path="/" element={<DashboardPage />} />
      {modules.map((module) => <Route key={module} path={`/${module}/*`} element={<ModulePage module={module} />} />)}
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>
}

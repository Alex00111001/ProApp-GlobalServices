import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, status } = useSession()
  const navigate = useNavigate()
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      await login(email, password); navigate('/')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión') }
    finally { setLoading(false) }
  }
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <div className="login-page"><section className="login-panel"><div className="mark">HS</div><p className="eyebrow">HomeServices Global</p><h1>Control Center</h1><p>Sesión administrativa revocable con permisos de mínimo privilegio.</p>
    <form onSubmit={submit}><label htmlFor="admin-email">Correo administrativo<input id="admin-email" autoComplete="username" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label htmlFor="admin-password">Contraseña<input id="admin-password" autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <div className="error" role="alert">{error}</div>}<button disabled={loading}>{loading ? 'Verificando…' : 'Entrar al panel'}</button></form>
  </section><aside className="login-art"><div><span>Marketplace intelligence</span><h2>Una vista operativa de todo el negocio.</h2><p>Oferta, demanda, ingresos, incidencias y adquisición en un mismo centro de control.</p></div></aside></div>
}

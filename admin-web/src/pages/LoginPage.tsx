import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useSession } from '../state/session'

type LoginResponse = { token: string; user: { role: string } }

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setToken } = useSession()
  const navigate = useNavigate()
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const result = await api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      if (result.user.role !== 'ADMIN') throw new Error('Esta cuenta no tiene acceso administrativo.')
      setToken(result.token); navigate('/')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión') }
    finally { setLoading(false) }
  }
  return <div className="login-page"><section className="login-panel"><div className="mark">HS</div><p className="eyebrow">HomeServices Global</p><h1>Control Center</h1><p>Acceso protegido para operaciones, finanzas, growth y soporte.</p>
    <form onSubmit={submit}><label>Correo administrativo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <div className="error">{error}</div>}<button disabled={loading}>{loading ? 'Verificando…' : 'Entrar al panel'}</button></form>
  </section><aside className="login-art"><div><span>Marketplace intelligence</span><h2>Una vista operativa de todo el negocio.</h2><p>Oferta, demanda, ingresos, incidencias y adquisición en un mismo centro de control.</p></div></aside></div>
}

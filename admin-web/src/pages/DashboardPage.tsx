import { useEffect, useState } from 'react'
import { api } from '../lib/api'

type Dashboard = { kpis: Record<string, number>; recentBookings: unknown[] }
const cards = [['totalUsers', 'Usuarios'], ['totalProfessionals', 'Profesionales'], ['totalBookings', 'Reservas'], ['completedBookings', 'Completados'], ['totalRevenue', 'GMV procesado'], ['pendingProfessionals', 'Verificaciones']]

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<Dashboard>('/admin/dashboard').then(setData).catch((reason) => setError(reason.message)) }, [])
  return <div className="page"><div className="page-title"><div><p className="eyebrow">Vista general</p><h1>Dashboard</h1><p>Indicadores del marketplace y actividad reciente.</p></div><button onClick={() => location.reload()}>Actualizar</button></div>
    {error && <div className="error">{error}</div>}
    <section className="metric-grid">{cards.map(([key, label]) => <article className="metric" key={key}><span>{label}</span><strong>{data ? (data.kpis[key] ?? 0).toLocaleString('es-ES') : '—'}</strong><small>Datos del Core API</small></article>)}</section>
    <section className="panel-grid"><article className="panel wide"><header><div><p className="eyebrow">Marketplace pulse</p><h2>Actividad</h2></div><span className="pill">Live API</span></header><div className="empty-chart"><div className="bars">{[42,65,48,82,62,91,76,88,69,96,84,100].map((height, index) => <i key={index} style={{height: `${height}%`}} />)}</div><p>La serie temporal se activará con las proyecciones analíticas.</p></div></article><article className="panel"><header><div><p className="eyebrow">Operations</p><h2>Estado</h2></div></header><ul className="health-list"><li><i />Core API <b>Monitored</b></li><li><i />Database <b>Health endpoint</b></li><li><em />Payments <b>Integration</b></li><li><em />Workers <b>Pending</b></li></ul></article></section>
  </div>
}

import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { dashboardSchema } from '../lib/contracts'
import { PageHeader, QueryState, StatusBadge } from '../components/PagePrimitives'
import { dateTime, moneyValue } from '../lib/format'

const metricOrder = ['activeUsers', 'activeProfessionals', 'requests', 'bookings', 'completedServices', 'gmv', 'grossPlatformRevenue', 'netPlatformRevenue', 'platformFees', 'professionalCommissions', 'refunds', 'takeRate']

export function DashboardPage() {
  const query = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => api('/v1/admin/dashboard?currency=EUR&timezone=Europe%2FMadrid', { schema: dashboardSchema }) })
  const data = query.data
  return <div className="page">
    <PageHeader eyebrow="Vista general" title="Dashboard" description="Definiciones, periodo, moneda y frescura acompañan cada indicador." actions={<button onClick={() => void query.refetch()}>Actualizar</button>} />
    <QueryState loading={query.isLoading} error={query.error} empty={!data}>
      {data && <>
        <div className="freshness"><strong>{data.range.currency} · {data.range.timezone}</strong><span>Periodo: {dateTime(data.range.from)} — {dateTime(data.range.to)}</span><span>Generado: {dateTime(data.generatedAt)}</span>{data.freshness.partialData && <b>Datos parciales</b>}</div>
        <section className="metric-grid">{metricOrder.map((key) => {
          const definition = data.definitions[key]
          const value = data.metrics[key] ?? 0
          const formatted = definition.unit === 'money' ? moneyValue(value, data.range.currency) : definition.unit === 'percentage' ? `${value}%` : Number(value).toLocaleString('es-ES')
          return <article className="metric" key={key} title={`${definition.description} Fuente: ${definition.source}`}><span>{definition.label}</span><strong>{formatted}</strong><small>{definition.source}</small></article>
        })}</section>
        <section className="panel-grid">
          <article className="panel"><header><div><p className="eyebrow">Distribución</p><h2>Reservas por estado</h2></div></header><ul className="status-summary">{data.bookingsByStatus.map((item) => <li key={item.status}><StatusBadge value={item.status} /><strong>{item.count}</strong></li>)}</ul></article>
          <article className="panel wide"><header><div><p className="eyebrow">Actividad reciente</p><h2>Últimas reservas</h2></div></header><div className="table-scroll"><table><thead><tr><th>Reserva</th><th>Cliente</th><th>Profesional</th><th>Estado</th><th>Importe</th><th>Creada</th></tr></thead><tbody>{data.recentBookings.map((booking) => <tr key={booking.id}><td><code>{booking.id.slice(0, 8)}</code></td><td>{booking.clientName}</td><td>{booking.professionalName || 'Sin asignar'}</td><td><StatusBadge value={booking.status} /></td><td>{moneyValue(booking.totalPrice, booking.currency)}</td><td>{dateTime(booking.createdAt)}</td></tr>)}</tbody></table></div></article>
        </section>
      </>}
    </QueryState>
  </div>
}

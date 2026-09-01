import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { bookingListSchema } from '../lib/contracts'
import { PageHeader, Pagination, QueryState, SearchBar, StatusBadge } from '../components/PagePrimitives'
import { dateTime, moneyValue } from '../lib/format'

export function BookingsPage() {
  const [page, setPage] = useState(1)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey: ['admin-bookings', page, search], queryFn: () => api(`/v1/admin/bookings?page=${page}&limit=25&search=${encodeURIComponent(search)}`, { schema: bookingListSchema }) })
  return <div className="page">
    <PageHeader eyebrow="Marketplace" title="Reservas" description="Seguimiento paginado del ciclo de vida; los estados financiero y operativo permanecen separados." actions={<SearchBar value={input} onChange={setInput} onSubmit={() => { setPage(1); setSearch(input.trim()) }} placeholder="ID, ciudad o cliente" />} />
    <QueryState loading={query.isLoading} error={query.error} empty={!query.data?.items.length}>{query.data && <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Reserva</th><th>Cliente</th><th>Profesional</th><th>Ciudad</th><th>Servicio</th><th>Pago</th><th>Importe</th><th>Programada</th></tr></thead><tbody>{query.data.items.map((booking) => <tr key={booking.id}><td><code>{booking.id.slice(0, 8)}</code><small>{dateTime(booking.createdAt)}</small></td><td>{booking.clientName}</td><td>{booking.professionalName || 'Sin asignar'}</td><td>{booking.city}</td><td><StatusBadge value={booking.status} /></td><td>{booking.payment ? <StatusBadge value={booking.payment.status} /> : 'Sin pago'}</td><td>{moneyValue(booking.totalPrice, booking.currency)}</td><td>{dateTime(booking.scheduledDate)}</td></tr>)}</tbody></table></div><Pagination value={query.data.pagination} onChange={setPage} /></article>}</QueryState>
  </div>
}

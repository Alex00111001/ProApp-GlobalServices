import type { FormEvent, ReactNode } from 'react'
import type { Pagination as PaginationModel } from '../lib/contracts'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions}</div>
}
export function QueryState({ loading, error, empty, children }: { loading: boolean; error: Error | null; empty: boolean; children: ReactNode }) {
  if (loading) return <article className="panel query-state" role="status">Cargando datos autorizados…</article>
  if (error) return <article className="panel query-state error" role="alert"><strong>No se pudieron cargar los datos</strong><span>{error.message}</span></article>
  if (empty) return <article className="panel query-state">No hay resultados para los filtros seleccionados.</article>
  return children
}
export function SearchBar({ value, onChange, onSubmit, placeholder = 'Buscar' }: { value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder?: string }) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit() }
  return <form className="filters" onSubmit={submit}><label><span className="sr-only">{placeholder}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label><button type="submit">Buscar</button></form>
}
export function Pagination({ value, onChange }: { value: PaginationModel; onChange: (page: number) => void }) {
  return <div className="pagination" aria-label="Paginación"><span>{value.totalItems} resultados · Página {value.page} de {value.totalPages}</span><div><button disabled={value.page <= 1} onClick={() => onChange(value.page - 1)}>Anterior</button><button disabled={value.page >= value.totalPages} onClick={() => onChange(value.page + 1)}>Siguiente</button></div></div>
}
export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll('_', '-')
  return <span className={`badge badge-${normalized}`}>{value.replaceAll('_', ' ')}</span>
}

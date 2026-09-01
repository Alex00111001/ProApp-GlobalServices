import { useParams } from 'react-router-dom'
import { PageHeader } from '../components/PagePrimitives'

const modules: Record<string, { title: string; phase: string; description: string }> = {
  revenue: { title: 'Revenue', phase: 'F5', description: 'Supervisión financiera sobre las APIs F3 ya protegidas.' },
  operations: { title: 'Operaciones', phase: 'F5', description: 'Errores, incidentes, health, integraciones, jobs y alertas.' },
  marketing: { title: 'Marketing', phase: 'F6–F9', description: 'Campañas, attribution, audiences, referrals y automatización.' },
  analytics: { title: 'Analytics', phase: 'F6+', description: 'KPIs de marketplace, growth, revenue y operaciones.' },
}
export function ModulePage() {
  const key = useParams().module || ''
  const module = modules[key]
  if (!module) return <div className="page"><article className="panel denied"><h1>Módulo no disponible</h1></article></div>
  return <div className="page"><PageHeader eyebrow={`Dependencia ${module.phase}`} title={module.title} description={module.description} /><article className="panel phase-boundary"><span>Frontera publicada</span><h2>La activación funcional corresponde a {module.phase}</h2><p>F4 sólo expone esta navegación cuando el administrador posee el permiso correspondiente. No se presentan datos simulados ni acciones provisionales.</p></article></div>
}

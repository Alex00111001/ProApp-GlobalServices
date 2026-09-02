export type NavigationItem = { to: string; label: string; permissions: string[]; phase?: string }
export const navigation: NavigationItem[] = [
  { to: '/', label: 'Dashboard', permissions: ['dashboard.read'] },
  { to: '/users', label: 'Usuarios', permissions: ['users.read'] },
  { to: '/professionals', label: 'Profesionales', permissions: ['professionals.read'] },
  { to: '/bookings', label: 'Reservas', permissions: ['bookings.read'] },
  { to: '/revenue', label: 'Revenue', permissions: ['payments.read', 'refunds.manage', 'payouts.manage'], phase: 'F5' },
  { to: '/operations', label: 'Operaciones', permissions: ['operations.read'], phase: 'F5' },
  { to: '/support', label: 'Soporte', permissions: ['support.read'], phase: 'F5' },
  { to: '/marketing', label: 'Marketing', permissions: ['marketing.read'], phase: 'F6' },
  { to: '/analytics', label: 'Analytics', permissions: ['analytics.read'], phase: 'F6' },
  { to: '/audit', label: 'Auditoría', permissions: ['audit.read'] },
  { to: '/settings', label: 'Acceso', permissions: ['dashboard.read', 'roles.read', 'sessions.manage'] },
]

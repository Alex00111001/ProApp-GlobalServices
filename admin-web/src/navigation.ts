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
  { to: '/privacy-attribution', label: 'Privacidad y atribución', permissions: ['privacy.policy.read', 'privacy.consent.read', 'touchpoints.read', 'attribution.read'], phase: 'F7' },
  { to: '/referrals-automation', label: 'Referrals y automatización', permissions: ['referrals.read', 'referrals.rewards.read', 'automation.read', 'automation.execution.read'], phase: 'F8' },
  { to: '/markets', label: 'Mercados y geografía', permissions: ['markets.read', 'geography.read', 'identity.policy.read'], phase: 'F8.5' },
  { to: '/experiments-content-seo', label: 'Experimentos, contenido y SEO', permissions: ['experiments.read', 'content.read', 'seo.read'], phase: 'F9' },
  { to: '/supply-demand-ai', label: 'Supply, Demand e IA', permissions: ['supplyDemand.read', 'readiness.read', 'expansion.read', 'ai.operations.read'], phase: 'F10' },
  { to: '/analytics', label: 'Analytics', permissions: ['analytics.read'], phase: 'F6' },
  { to: '/audit', label: 'Auditoría', permissions: ['audit.read'] },
  { to: '/settings', label: 'Acceso', permissions: ['dashboard.read', 'roles.read', 'sessions.manage'] },
]

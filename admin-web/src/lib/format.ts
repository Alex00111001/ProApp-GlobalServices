export const dateTime = (value: string | Date | null | undefined) => value
  ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—'
export const moneyValue = (value: string | number, currency: string) => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(value))

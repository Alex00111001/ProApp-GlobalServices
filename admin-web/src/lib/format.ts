export const dateTime = (value: string | Date | null | undefined) => value
  ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—'
export const moneyValue = (value: string | number, currency: string) => {
  const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency })
  // ECMA-402 accepts exact decimal strings even though the TypeScript signature omits them.
  const format = formatter.format as (amount: string | number) => string
  return format(value)
}

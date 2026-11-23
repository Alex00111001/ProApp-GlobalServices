import { expect, test } from 'vitest'
import { moneyValue } from './format'

test('money formatting preserves decimal digits and currency conventions', () => {
  expect(moneyValue('1000000000000000.01', 'EUR')).toBe('1.000.000.000.000.000,01\u00a0€')
  expect(moneyValue('-1000000000000000.01', 'EUR')).toBe('-1.000.000.000.000.000,01\u00a0€')
  expect(moneyValue(12.5, 'EUR')).toBe('12,50\u00a0€')
})

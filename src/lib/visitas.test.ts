import { describe, expect, it } from 'vitest'
import { diasDesde, ultimaVisitaPorCliente } from './visitas'

const AHORA = new Date('2026-10-06T12:00:00Z').getTime()
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString()

describe('ultimaVisitaPorCliente', () => {
  it('toma la mas reciente de cada cliente e ignora las visitas sin cliente', () => {
    const m = ultimaVisitaPorCliente([
      { cliente_id: 'a', created_at: hace(10) },
      { cliente_id: 'a', created_at: hace(3) },
      { cliente_id: null, created_at: hace(1) },
      { cliente_id: 'b', created_at: hace(40) },
    ])
    expect(m.get('a')).toBe(hace(3))
    expect(m.get('b')).toBe(hace(40))
    expect(m.size).toBe(2)
  })
})

describe('diasDesde', () => {
  it('cuenta dias enteros', () => {
    expect(diasDesde(hace(5), AHORA)).toBe(5)
    expect(diasDesde(hace(0), AHORA)).toBe(0)
  })
})

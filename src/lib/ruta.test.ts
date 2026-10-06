import { describe, expect, it } from 'vitest'
import { diaConVisitas, distanciaKm, largoRutaKm } from './ruta'

// Asuncion y Ciudad del Este: unos 270 km en linea recta.
const ASUNCION = { lat: -25.2637, lng: -57.5759 }
const CDE = { lat: -25.5097, lng: -54.6111 }

describe('distanciaKm', () => {
  it('es 0 entre el mismo punto', () => {
    expect(distanciaKm(ASUNCION, ASUNCION)).toBe(0)
  })
  it('calcula una distancia razonable entre dos ciudades', () => {
    const d = distanciaKm(ASUNCION, CDE)
    expect(d).toBeGreaterThan(290)
    expect(d).toBeLessThan(310)
  })
})

describe('largoRutaKm', () => {
  it('suma los tramos en orden', () => {
    const ida = distanciaKm(ASUNCION, CDE)
    expect(largoRutaKm([ASUNCION, CDE, ASUNCION])).toBeCloseTo(ida * 2, 6)
  })
  it('es 0 con menos de dos puntos', () => {
    expect(largoRutaKm([])).toBe(0)
    expect(largoRutaKm([ASUNCION])).toBe(0)
  })
})

describe('diaConVisitas', () => {
  const dias = ['2026-08-27', '2026-08-26', '2026-08-26', '2026-09-03', '2026-07-30']

  it('busca el dia anterior con visitas', () => {
    expect(diaConVisitas(dias, '2026-09-03', -1)).toBe('2026-08-27')
    expect(diaConVisitas(dias, '2026-08-26', -1)).toBe('2026-07-30')
  })
  it('busca el siguiente dia con visitas', () => {
    expect(diaConVisitas(dias, '2026-08-27', 1)).toBe('2026-09-03')
    expect(diaConVisitas(dias, '2026-08-20', 1)).toBe('2026-08-26')
  })
  it('funciona desde un dia sin visitas y no cuenta el propio dia', () => {
    expect(diaConVisitas(dias, '2026-08-28', -1)).toBe('2026-08-27')
    expect(diaConVisitas(dias, '2026-08-26', 1)).toBe('2026-08-27')
  })
  it('devuelve null si no hay mas en ese sentido', () => {
    expect(diaConVisitas(dias, '2026-09-03', 1)).toBeNull()
    expect(diaConVisitas(dias, '2026-07-30', -1)).toBeNull()
    expect(diaConVisitas([], '2026-08-26', 1)).toBeNull()
  })
})

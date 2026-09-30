import { describe, expect, it } from 'vitest'
import {
  diaLocal,
  esMontoValido,
  formatFecha,
  formatFechaHora,
  formatGs,
  formatMiles,
  formatMilesInput,
  normalizar,
  normalizarNroOrden,
  parseEntero,
  sinAcentos,
} from './format'

describe('formatFecha', () => {
  it('pasa de ISO a dd/mm/aaaa', () => {
    expect(formatFecha('2026-08-03')).toBe('03/08/2026')
  })

  it('recorta la hora de un timestamp', () => {
    expect(formatFecha('2026-08-03T15:30:00Z')).toBe('03/08/2026')
  })

  it('muestra un guion cuando no hay fecha', () => {
    expect(formatFecha(null)).toBe('—')
  })

  it('deja pasar lo que no tiene forma de fecha', () => {
    expect(formatFecha('manana')).toBe('manana')
  })
})

describe('formatFechaHora', () => {
  it('muestra un guion cuando la fecha no es valida', () => {
    expect(formatFechaHora('no-es-una-fecha')).toBe('—')
    expect(formatFechaHora(undefined)).toBe('—')
  })
})

describe('normalizar', () => {
  it('saca tildes y mayusculas para poder buscar', () => {
    expect(normalizar('Categoría')).toBe('categoria')
  })

  it('tambien convierte la ñ en n', () => {
    // Efecto de descomponer en NFD y sacar todos los diacriticos. Es lo que
    // se busca: escribiendo "nandu" se encuentra "ñandú".
    expect(normalizar('  ÑANDÚ ')).toBe('nandu')
  })
})

describe('formatMiles / formatGs', () => {
  it('usa punto como separador de miles', () => {
    expect(formatMiles(9661600)).toBe('9.661.600')
    expect(formatGs(7063000)).toBe('Gs. 7.063.000')
    expect(formatMiles(0)).toBe('0')
    expect(formatMiles(null)).toBe('0')
  })
})

describe('parseEntero / esMontoValido', () => {
  it('descarta todo lo que no sea digito', () => {
    expect(parseEntero('9.661.600')).toBe(9661600)
    expect(parseEntero('Gs. 1 234')).toBe(1234)
    expect(parseEntero('abc')).toBeNull()
  })

  it('valida solo numeros mayores a cero', () => {
    expect(esMontoValido('7.063.000')).toBe(true)
    expect(esMontoValido('0')).toBe(false)
    expect(esMontoValido('12abc')).toBe(false)
    expect(esMontoValido('')).toBe(false)
  })

  it('formatea mientras se escribe', () => {
    expect(formatMilesInput('9661600')).toBe('9.661.600')
    expect(formatMilesInput('')).toBe('')
  })
})

describe('normalizarNroOrden', () => {
  it('ignora ceros a la izquierda y separadores', () => {
    expect(normalizarNroOrden('0011504')).toBe('11504')
    expect(normalizarNroOrden('11.504')).toBe('11504')
    expect(normalizarNroOrden(' 00-11504 ')).toBe('11504')
  })
})

describe('sinAcentos', () => {
  it('saca tildes y conserva mayusculas', () => {
    expect(sinAcentos('Ñandú Pérez')).toBe('Nandu Perez')
  })
})

describe('fechas en hora de Asuncion', () => {
  it('un timestamp de la noche se muestra en el dia en que se cargo', () => {
    // 01:30 UTC del 11/03 = 22:30 del 10/03 en Asuncion
    expect(formatFechaHora('2026-03-11T01:30:00Z')).toBe('10/03/2026 22:30')
    expect(formatFecha('2026-03-11T01:30:00Z')).toBe('10/03/2026')
    expect(diaLocal('2026-03-11T01:30:00Z')).toBe('2026-03-10')
  })
})

import { describe, expect, it } from 'vitest'
import { compararClientes, filasDeHoja, normalizarCodigo, textoDeCelda } from './clientesImport'
import type { Cliente } from './database.types'

const existente: Cliente = {
  id: 'id-1',
  codigo: '297109',
  razon_social: 'EJEMPLO S.A.',
  nombre_fantasia: 'TIENDA',
  ciudad: 'ASUNCION',
  zona: 'CENTRO',
  lat: -25.26,
  lng: -57.57,
  created_at: '',
  updated_at: '',
}

const fila = (o: Partial<Record<string, string>>, n = 2) => ({
  fila: n, codigo: '', razon_social: '', nombre_fantasia: '', ciudad: '', zona: '', lat: '', lng: '', ...o,
})

describe('normalizarCodigo', () => {
  it('trata 297109, 297109.0, 0297109 y espacios como el mismo codigo', () => {
    expect(normalizarCodigo('297109')).toBe('297109')
    expect(normalizarCodigo(' 297109.0 ')).toBe('297109')
    expect(normalizarCodigo('0297109')).toBe('297109')
    expect(normalizarCodigo('AB-12')).toBe('ab-12')
  })
})

describe('textoDeCelda', () => {
  it('numeros enteros sin .0 y celdas con formato', () => {
    expect(textoDeCelda(297109)).toBe('297109')
    expect(textoDeCelda({ richText: [{ text: 'AB' }, { text: 'C' }] })).toBe('ABC')
    expect(textoDeCelda({ formula: 'x', result: 5 })).toBe('5')
    expect(textoDeCelda(null)).toBe('')
  })
})

describe('filasDeHoja', () => {
  it('acepta encabezados con tildes, espacios y alias', () => {
    const r = filasDeHoja([
      ['Código', 'Razón social', 'Nombre fantasía', 'Ciudad', 'Zona', 'Latitud', 'Longitud'],
      [1, 'A', 'B', 'C', 'D', -25, -57],
      [null, null, null],
    ])
    expect('filas' in r && r.filas).toHaveLength(1)
    expect('filas' in r && r.filas[0]).toMatchObject({ fila: 2, codigo: '1', razon_social: 'A', lat: '-25' })
  })
  it('avisa si falta la columna del codigo', () => {
    expect('error' in filasDeHoja([['Nombre', 'Ciudad'], ['x', 'y']])).toBe(true)
  })
})

describe('compararClientes', () => {
  it('crea el que no existe y actualiza el que si, por codigo', () => {
    const r = compararClientes(
      [fila({ codigo: '297109.0', razon_social: 'NUEVO NOMBRE' }), fila({ codigo: '5', razon_social: 'OTRO' }, 3)],
      [existente],
    )
    expect(r[0]).toMatchObject({ tipo: 'actualizar', id: 'id-1', cambios: ['razón social'] })
    expect(r[1]).toMatchObject({ tipo: 'nuevo', fila: 3 })
  })
  it('una celda vacia no borra el dato que ya tenia', () => {
    const r = compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.', zona: 'ESTE' })], [existente])
    expect(r[0]).toMatchObject({ tipo: 'actualizar', cambios: ['zona'] })
    if (r[0].tipo === 'actualizar') expect(r[0].datos).toMatchObject({ nombre_fantasia: 'TIENDA', ciudad: 'ASUNCION', lat: -25.26 })
  })
  it('sin diferencias queda como sin-cambios', () => {
    expect(compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.', ciudad: 'ASUNCION' })], [existente])[0].tipo).toBe('sin-cambios')
  })
  it('marca errores: sin codigo, repetido, nuevo sin razon social, coordenadas', () => {
    const r = compararClientes(
      [
        fila({ razon_social: 'X' }, 2),
        fila({ codigo: '7', razon_social: 'AA' }, 3),
        fila({ codigo: '7', razon_social: 'BB' }, 4),
        fila({ codigo: '8' }, 5),
        fila({ codigo: '9', razon_social: 'CC', lat: '-25' }, 6),
        fila({ codigo: '10', razon_social: 'DD', lat: '95', lng: '10' }, 7),
        fila({ codigo: '11', razon_social: 'EE', lat: 'abc', lng: '1' }, 8),
      ],
      [],
    )
    expect(r.map((x) => x.tipo)).toEqual(['error', 'nuevo', 'error', 'error', 'error', 'error', 'error'])
  })
  it('acepta coma decimal en la ubicacion', () => {
    const r = compararClientes([fila({ codigo: '1', razon_social: 'AA', lat: '-25,26', lng: '-57,57' })], [])
    expect(r[0]).toMatchObject({ tipo: 'nuevo', datos: { lat: -25.26, lng: -57.57 } })
  })
})

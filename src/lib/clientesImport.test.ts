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
      [fila({ codigo: '297109.0', razon_social: 'NUEVO NOMBRE', nombre_fantasia: 'TIENDA' }), fila({ codigo: '5', razon_social: 'OTRO' }, 3)],
      [existente],
    )
    expect(r[0]).toMatchObject({ tipo: 'actualizar', id: 'id-1', cambios: ['razón social'] })
    expect(r[1]).toMatchObject({ tipo: 'nuevo', fila: 3 })
  })
  it('ciudad, zona y ubicacion vacias no borran lo que ya tenia', () => {
    const r = compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.', nombre_fantasia: 'TIENDA' })], [existente])
    expect(r[0].tipo).toBe('sin-cambios')
    const r2 = compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.', nombre_fantasia: 'TIENDA', zona: 'ESTE' })], [existente])
    expect(r2[0]).toMatchObject({ tipo: 'actualizar', cambios: ['zona'] })
    if (r2[0].tipo === 'actualizar') expect(r2[0].datos).toMatchObject({ ciudad: 'ASUNCION', lat: -25.26, lng: -57.57 })
  })
  it('el nombre de fantasia vacio en el archivo se vacia', () => {
    const r = compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.' })], [existente])
    expect(r[0]).toMatchObject({ tipo: 'actualizar', cambios: ['nombre fantasía'] })
    if (r[0].tipo === 'actualizar') expect(r[0].datos.nombre_fantasia).toBeNull()
  })
  it('si el archivo no trae la columna NombreFantasia, no se toca', () => {
    const cols = new Set(['Codigo', 'RazonSocial', 'Ciudad'] as const)
    const r = compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.' })], [existente], cols)
    expect(r[0].tipo).toBe('sin-cambios')
  })
  it('la razon social vacia en un cliente existente es un error, no se pisa', () => {
    const r = compararClientes([fila({ codigo: '297109', ciudad: 'LUQUE' })], [existente])
    expect(r[0]).toMatchObject({ tipo: 'error', motivo: 'La razón social no puede quedar vacía.' })
  })
  it('sin diferencias queda como sin-cambios', () => {
    expect(compararClientes([fila({ codigo: '297109', razon_social: 'EJEMPLO S.A.', nombre_fantasia: 'TIENDA', ciudad: 'ASUNCION' })], [existente])[0].tipo).toBe('sin-cambios')
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

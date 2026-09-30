import { describe, expect, it } from 'vitest'
import type { Pedido } from './database.types'
import { filtrarPedidos, ranking, serieMensual, totales } from './reportes'

function pedido(p: Partial<Pedido>): Pedido {
  return {
    id: Math.random().toString(),
    created_at: '2026-03-10T15:00:00Z',
    updated_at: '',
    cliente_id: null,
    cliente_nombre: 'Cliente A',
    cliente_codigo: null,
    ciudad: 'Asuncion',
    zona: 'Centro',
    nro_orden: '1',
    nro_orden_norm: '1',
    tipo: 'STOCK',
    marca: 'Nike',
    total_pares: 10,
    total_precio: 1000,
    obs: null,
    imagen_path: null,
    usuario_id: null,
    idempotency_key: null,
    ruc: null,
    nro_pedido: null,
    entrega: null,
    direccion: null,
    forma_pago: null,
    legacy_id: null,
    legacy_usuario: null,
    usuario: { username: 'ana', nombre: 'Ana', foto_path: null },
    ...p,
  }
}

describe('totales', () => {
  it('suma y calcula el ticket promedio redondeado', () => {
    const t = totales([pedido({ total_precio: 1000 }), pedido({ total_precio: 2001 })])
    expect(t).toEqual({ pedidos: 2, pares: 20, monto: 3001, ticket: 1501 })
  })

  it('sin pedidos no divide por cero', () => {
    expect(totales([]).ticket).toBe(0)
  })
})

describe('filtrarPedidos', () => {
  it('filtra por dia de Asuncion, no por dia UTC', () => {
    // 01:00 UTC del 11/03 es 22:00 del 10/03 en Asuncion (UTC-3 en marzo)
    const tarde = pedido({ created_at: '2026-03-11T01:00:00Z' })
    expect(filtrarPedidos([tarde], { desde: '2026-03-10', hasta: '2026-03-10', tipo: '' })).toHaveLength(1)
    expect(filtrarPedidos([tarde], { desde: '2026-03-11', hasta: '', tipo: '' })).toHaveLength(0)
  })

  it('filtra por tipo', () => {
    const lista = [pedido({ tipo: 'STOCK' }), pedido({ tipo: 'MALETEO' })]
    expect(filtrarPedidos(lista, { desde: '', hasta: '', tipo: 'MALETEO' })).toHaveLength(1)
  })
})

describe('serieMensual', () => {
  it('incluye los meses intermedios sin pedidos, cruzando de año', () => {
    const serie = serieMensual([
      pedido({ created_at: '2025-11-15T12:00:00Z', total_precio: 100 }),
      pedido({ created_at: '2026-02-15T12:00:00Z', total_precio: 50 }),
    ])
    expect(serie.map((s) => s.mes)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(serie[1]).toMatchObject({ monto: 0, cantidad: 0 })
  })
})

describe('ranking', () => {
  it('agrupa las marcas en mayusculas y ordena por monto', () => {
    const filas = ranking(
      [
        pedido({ marca: 'nike', total_precio: 100 }),
        pedido({ marca: 'NIKE', total_precio: 100 }),
        pedido({ marca: 'Adidas', total_precio: 500 }),
      ],
      'marca',
    )
    expect(filas.map((f) => [f.nombre, f.monto])).toEqual([
      ['ADIDAS', 500],
      ['NIKE', 200],
    ])
  })

  it('los vendedores sin nombre van a "(sin vendedor)"', () => {
    const filas = ranking([pedido({ usuario: null, legacy_usuario: null })], 'vendedor')
    expect(filas[0].nombre).toBe('(sin vendedor)')
  })

  it('el desglose de una marca es por vendedor, el del resto por marca', () => {
    const lista = [pedido({ total_precio: 100 })]
    expect(ranking(lista, 'marca', true)[0].detalle?.[0].nombre).toBe('ANA')
    expect(ranking(lista, 'cliente', true)[0].detalle?.[0].nombre).toBe('NIKE')
  })
})

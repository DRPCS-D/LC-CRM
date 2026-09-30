import { autorDe, type Pedido } from './database.types'
import { diaLocal, mesLocal } from './format'

/**
 * Calculos de la pantalla de Reportes. Puros (sin React ni red) para poder
 * probarlos: todo sale de la lista de pedidos que ya tiene el navegador.
 */

export interface Filtro {
  desde: string
  hasta: string
  tipo: string
}

export function filtrarPedidos(pedidos: Pedido[], f: Filtro): Pedido[] {
  return pedidos.filter((p) => {
    const dia = diaLocal(p.created_at)
    if (f.desde && dia < f.desde) return false
    if (f.hasta && dia > f.hasta) return false
    if (f.tipo && p.tipo !== f.tipo) return false
    return true
  })
}

export interface Totales {
  pedidos: number
  pares: number
  monto: number
  ticket: number
}

export function totales(pedidos: Pedido[]): Totales {
  const monto = pedidos.reduce((s, p) => s + (p.total_precio ?? 0), 0)
  const pares = pedidos.reduce((s, p) => s + (p.total_pares ?? 0), 0)
  return {
    pedidos: pedidos.length,
    pares,
    monto,
    ticket: pedidos.length ? Math.round(monto / pedidos.length) : 0,
  }
}

export interface PuntoMes {
  /** aaaa-mm */
  mes: string
  monto: number
  cantidad: number
}

function siguienteMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

/** Un punto por mes entre el primero y el ultimo con pedidos, incluidos los meses en cero. */
export function serieMensual(pedidos: Pedido[]): PuntoMes[] {
  if (pedidos.length === 0) return []
  const porMes = new Map<string, PuntoMes>()
  for (const p of pedidos) {
    const mes = mesLocal(p.created_at)
    const punto = porMes.get(mes) ?? { mes, monto: 0, cantidad: 0 }
    punto.monto += p.total_precio ?? 0
    punto.cantidad += 1
    porMes.set(mes, punto)
  }
  const meses = [...porMes.keys()].sort()
  const serie: PuntoMes[] = []
  for (let m = meses[0]; m <= meses[meses.length - 1]; m = siguienteMes(m)) {
    serie.push(porMes.get(m) ?? { mes: m, monto: 0, cantidad: 0 })
  }
  return serie
}

export interface Fila {
  nombre: string
  pedidos: number
  pares: number
  monto: number
  /** Desglose opcional (por marca, o por vendedor dentro de una marca). */
  detalle?: Fila[]
}

export type Dimension = 'cliente' | 'vendedor' | 'marca' | 'ciudad' | 'zona'

const SIN: Record<Dimension, string> = {
  cliente: '(sin cliente)',
  vendedor: '(sin vendedor)',
  marca: '(sin marca)',
  ciudad: '(sin ciudad)',
  zona: '(sin zona)',
}

/** Clientes conserva su escritura; el resto se agrupa en mayusculas. */
export function claveDe(p: Pedido, d: Dimension): string {
  const autor = autorDe(p)
  const crudo = {
    cliente: p.cliente_nombre,
    vendedor: autor === '—' ? '' : autor,
    marca: p.marca,
    ciudad: p.ciudad,
    zona: p.zona,
  }[d]
  const limpio = (crudo ?? '').trim()
  if (!limpio) return SIN[d]
  return d === 'cliente' ? limpio : limpio.toUpperCase()
}

function agrupar(pedidos: Pedido[], clave: (p: Pedido) => string): Fila[] {
  const mapa = new Map<string, Fila>()
  for (const p of pedidos) {
    const k = clave(p)
    const fila = mapa.get(k) ?? { nombre: k, pedidos: 0, pares: 0, monto: 0 }
    fila.pedidos += 1
    fila.pares += p.total_pares ?? 0
    fila.monto += p.total_precio ?? 0
    mapa.set(k, fila)
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Ranking por monto. Con `desglose`, cada fila trae su detalle: por marca,
 * salvo que la dimension sea marca, donde el detalle es por vendedor.
 */
export function ranking(pedidos: Pedido[], d: Dimension, desglose = false): Fila[] {
  const filas = agrupar(pedidos, (p) => claveDe(p, d))
  if (!desglose) return filas
  const dimDetalle: Dimension = d === 'marca' ? 'vendedor' : 'marca'
  const porFila = new Map<string, Pedido[]>()
  for (const p of pedidos) {
    const k = claveDe(p, d)
    porFila.set(k, [...(porFila.get(k) ?? []), p])
  }
  return filas.map((f) => ({
    ...f,
    detalle: agrupar(porFila.get(f.nombre) ?? [], (p) => claveDe(p, dimDetalle)),
  }))
}

export const TOP = 10

import type { Informe } from './database.types'

export type Visita = Pick<Informe, 'cliente_id' | 'created_at'>

const DIA_MS = 86_400_000

/** Fecha (ISO) de la ultima visita de cada cliente. Las visitas sin cliente no cuentan. */
export function ultimaVisitaPorCliente(visitas: Visita[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const v of visitas) {
    if (!v.cliente_id) continue
    const actual = mapa.get(v.cliente_id)
    if (!actual || v.created_at > actual) mapa.set(v.cliente_id, v.created_at)
  }
  return mapa
}

/** Dias enteros entre una fecha ISO y `ahora`. */
export function diasDesde(iso: string, ahora: number): number {
  return Math.floor((ahora - new Date(iso).getTime()) / DIA_MS)
}

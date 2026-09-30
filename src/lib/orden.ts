/** Orden, comparacion y opciones de filtro para las tablas de la app. */

export type Direccion = 'asc' | 'desc'
export interface Orden<K extends string> {
  campo: K
  dir: Direccion
}

function vacio(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** Compara dos valores para ordenar: numeros como numeros, texto sin tildes. */
export function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (vacio(a)) return 1
  if (vacio(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' })
}

export function ordenar<T, K extends string>(
  filas: T[],
  orden: Orden<K>,
  valor: (fila: T, campo: K) => unknown,
): T[] {
  const signo = orden.dir === 'asc' ? 1 : -1
  return [...filas].sort((x, y) => {
    const vx = valor(x, orden.campo)
    const vy = valor(y, orden.campo)
    const c = comparar(vx, vy)
    // Los vacios van siempre al final, sin importar la direccion
    if (vacio(vx) || vacio(vy)) return c
    return c * signo
  })
}

/** Valores distintos y no vacios de un campo, ordenados. Para armar opciones de filtro. */
export function opcionesDe<T>(filas: T[], valor: (f: T) => string | null | undefined): string[] {
  const set = new Set<string>()
  for (const f of filas) {
    const v = valor(f)?.trim()
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
}

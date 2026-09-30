/**
 * Helpers de formateo que no dependen de ningun dominio.
 *
 * Todo lo especifico de una app (moneda, documentos, unidades) va en un
 * modulo propio de esa app, no aca: esta base tiene que servir igual para
 * cualquier sistema.
 */

/** '2026-03-14' → '14/03/2026'. Recorta la hora si viene un timestamp. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [fecha] = iso.split('T')
  const [a, m, d] = fecha.split('-')
  if (!a || !m || !d) return iso
  return `${d}/${m}/${a}`
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '—'
  return `${formatFecha(iso)} ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`
}

/** Normaliza texto para buscar sin tildes ni mayusculas. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

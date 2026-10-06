/**
 * Helpers de formateo.
 *
 * La app trabaja en Paraguay: moneda Guarani sin decimales ("Gs. 9.661.600")
 * y fechas en la zona horaria de Asuncion, sin importar la del dispositivo.
 */

export const ZONA_HORARIA = 'America/Asuncion'

const partesFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

interface PartesFecha {
  a: string
  m: string
  d: string
  h: string
  min: string
}

/** Descompone un timestamp en sus partes, en hora de Asuncion. */
function partes(fecha: Date): PartesFecha {
  const p: Record<string, string> = {}
  for (const { type, value } of partesFormatter.formatToParts(fecha)) p[type] = value
  return { a: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute }
}

function esSoloFecha(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
}

/**
 * '2026-03-14' → '14/03/2026'. Un timestamp se pasa primero a la fecha de
 * Asuncion (un pedido cargado a las 22:00 de Asuncion es 01:00 UTC del dia
 * siguiente, y tiene que mostrarse en el dia en que se cargo).
 */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (esSoloFecha(iso)) {
    const [a, m, d] = iso.split('-')
    return `${d}/${m}/${a}`
  }
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return iso
  const { a, m, d } = partes(f)
  return `${d}/${m}/${a}`
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '—'
  const { a, m, d, h, min } = partes(f)
  return `${d}/${m}/${a} ${h}:${min}`
}

/** Solo la hora de un timestamp, en Asuncion: '08:05'. */
export function formatHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '—'
  const { h, min } = partes(f)
  return `${h}:${min}`
}

/** Dia (aaaa-mm-dd) de un timestamp en Asuncion: para comparar con un <input type="date">. */
export function diaLocal(iso: string | Date): string {
  const f = typeof iso === 'string' ? new Date(iso) : iso
  const { a, m, d } = partes(f)
  return `${a}-${m}-${d}`
}

/** Mes (aaaa-mm) de un timestamp en Asuncion: para agrupar en los reportes. */
export function mesLocal(iso: string): string {
  return diaLocal(iso).slice(0, 7)
}

export function hoyLocal(): string {
  return diaLocal(new Date())
}

/** Fecha de hace `n` dias (para armar rangos como "ultima semana"). */
export function haceDias(n: number): Date {
  const f = new Date()
  f.setDate(f.getDate() - n)
  return f
}

/** Para nombres de archivo exportados: 20260314_1530. */
export function marcaDeTiempo(): string {
  const { a, m, d, h, min } = partes(new Date())
  return `${a}${m}${d}_${h}${min}`
}

/** Normaliza texto para buscar sin tildes ni mayusculas. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

/**
 * Saca tildes conservando mayusculas. Como en la app original, la ñ tambien
 * pierde la tilde (NFD la descompone igual que a las vocales).
 */
export function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** 9661600 → '9.661.600' (separador de miles paraguayo). */
export function formatMiles(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0'
  const entero = Math.round(n)
  const signo = entero < 0 ? '-' : ''
  return signo + String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** 9661600 → 'Gs. 9.661.600'. */
export function formatGs(n: number | null | undefined): string {
  return `Gs. ${formatMiles(n)}`
}

/**
 * Para ejes de graficos, como se lee en Paraguay: en millones (no hay "B" ni
 * "K"), con punto de miles y 2 cifras significativas.
 *   9661600 → '9,7 M' · 3300000000 → '3.300 M' · 13000000000 → '13.000 M' · 450000 → '450 mil'
 */
export function formatCompacto(n: number): string {
  const abs = Math.abs(n)
  const signo = n < 0 ? '-' : ''
  if (abs >= 1e6) {
    const m = abs / 1e6
    if (m < 10) return `${signo}${m.toFixed(1).replace('.', ',').replace(/,0$/, '')} M`
    const paso = 10 ** (Math.floor(Math.log10(m)) - 1)
    return `${signo}${formatMiles(Math.round(m / paso) * paso)} M`
  }
  if (abs >= 1e3) return `${signo}${formatMiles(Math.round(abs / 1e3))} mil`
  return String(Math.round(n))
}

/**
 * '9.661.600' → 9661600. Descarta todo lo que no sea digito, como hacia la
 * app original: en Guaranies no hay decimales, asi que ni el punto ni la coma
 * pueden ser separador decimal. Sin digitos devuelve null.
 */
export function parseEntero(texto: string | null | undefined): number | null {
  const digitos = String(texto ?? '').replace(/\D/g, '')
  if (!digitos) return null
  return Number(digitos)
}

/** Monto o cantidad escrita a mano: solo digitos, puntos, comas y espacios, y mayor a cero. */
export function esMontoValido(texto: string): boolean {
  if (!/^[\d.,\s]+$/.test(texto.trim())) return false
  const n = parseEntero(texto)
  return n !== null && n > 0
}

/** Formatea mientras se escribe: '9661600' → '9.661.600'. Vacio queda vacio. */
export function formatMilesInput(texto: string): string {
  const n = parseEntero(texto)
  return n === null ? '' : formatMiles(n)
}

/**
 * N° de orden comparable: solo digitos y sin ceros a la izquierda
 * ('0011504' y '11.504' son la misma orden). Es la misma cuenta que hace la
 * columna generada `pedidos.nro_orden_norm`.
 */
export function normalizarNroOrden(texto: string | null | undefined): string {
  return String(texto ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
}

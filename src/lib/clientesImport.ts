/**
 * Importar clientes desde un Excel: lectura del archivo y comparacion con los
 * clientes que ya estan cargados. Un cliente que ya existe (mismo codigo) se
 * actualiza; uno que no existe se crea; los que no estan en el archivo no se
 * tocan. Una celda vacia en el archivo NO borra ciudad, zona ni ubicacion del
 * cliente; el nombre de fantasia SI se vacia (si el archivo trae esa columna).
 * La razon social es obligatoria: vacia en un cliente existente es un error.
 *
 * La comparacion es pura (sin red ni Excel) para poder probarla; `exceljs`
 * pesa, asi que solo se carga al leer o generar un archivo.
 */
import type { Cliente } from './database.types'
import { descargarArchivo } from './exportar'
import { sinAcentos } from './format'

/** Lo que se guarda de cada cliente importado. */
export type DatosCliente = Pick<Cliente, 'codigo' | 'razon_social' | 'nombre_fantasia' | 'ciudad' | 'zona' | 'lat' | 'lng'>

export const COLUMNAS = ['Codigo', 'RazonSocial', 'NombreFantasia', 'Ciudad', 'Zona', 'Lat', 'Lng'] as const
export type Columna = (typeof COLUMNAS)[number]

/** Nombres con los que se acepta cada columna (sin tildes, minusculas, sin espacios). */
const ALIAS: Record<Columna, string[]> = {
  Codigo: ['codigo', 'cod', 'codcliente', 'codigocliente'],
  RazonSocial: ['razonsocial', 'razon', 'nombre', 'cliente'],
  NombreFantasia: ['nombrefantasia', 'fantasia'],
  Ciudad: ['ciudad'],
  Zona: ['zona'],
  Lat: ['lat', 'latitud'],
  Lng: ['lng', 'lon', 'long', 'longitud'],
}

export const LIMITE_FILAS = 5000
export const LIMITE_BYTES = 5 * 1024 * 1024

export interface FilaArchivo {
  /** Numero de fila en el Excel (la 1 es el encabezado). */
  fila: number
  codigo: string
  razon_social: string
  nombre_fantasia: string
  ciudad: string
  zona: string
  lat: string
  lng: string
}

export type Resultado =
  | { tipo: 'nuevo'; fila: number; datos: DatosCliente }
  | { tipo: 'actualizar'; fila: number; id: string; datos: DatosCliente; cambios: string[] }
  | { tipo: 'sin-cambios'; fila: number }
  | { tipo: 'error'; fila: number; codigo: string; motivo: string }

const clave = (s: string) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/** '0297109', '297109.0' y ' 297109 ' son el mismo codigo; los alfanumericos se comparan sin mayusculas. */
export function normalizarCodigo(c: string): string {
  const t = c.trim()
  return /^\d+(\.0+)?$/.test(t) ? String(Number(t)) : t.toLowerCase()
}

/** Texto de una celda de Excel (numeros enteros sin '.0', fechas ignoradas). */
export function textoDeCelda(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'object') {
    const o = v as { text?: unknown; richText?: { text: string }[]; result?: unknown }
    if (o.richText) return o.richText.map((r) => r.text).join('').trim()
    if (o.text !== undefined) return textoDeCelda(o.text)
    if (o.result !== undefined) return textoDeCelda(o.result)
    return ''
  }
  return String(v).trim()
}

/** Busca la fila de encabezados y arma las filas del archivo. Devuelve un error legible si faltan columnas. */
export function filasDeHoja(matriz: unknown[][]): { filas: FilaArchivo[]; columnas: Set<Columna> } | { error: string } {
  const idxEnc = matriz.findIndex((f) => f.some((c) => ALIAS.Codigo.includes(clave(textoDeCelda(c)))))
  if (idxEnc < 0) return { error: 'No se encontró la columna "Codigo". Descargá la plantilla y respetá los nombres de las columnas.' }
  const enc = matriz[idxEnc].map((c) => clave(textoDeCelda(c)))
  const col = (c: Columna) => enc.findIndex((e) => ALIAS[c].includes(e))
  const idx = Object.fromEntries(COLUMNAS.map((c) => [c, col(c)])) as Record<Columna, number>
  if (idx.RazonSocial < 0) return { error: 'No se encontró la columna "RazonSocial".' }

  const get = (f: unknown[], c: Columna) => (idx[c] >= 0 ? textoDeCelda(f[idx[c]]) : '')
  const filas: FilaArchivo[] = []
  matriz.slice(idxEnc + 1).forEach((f, i) => {
    const fila: FilaArchivo = {
      fila: idxEnc + 2 + i,
      codigo: get(f, 'Codigo'),
      razon_social: get(f, 'RazonSocial'),
      nombre_fantasia: get(f, 'NombreFantasia'),
      ciudad: get(f, 'Ciudad'),
      zona: get(f, 'Zona'),
      lat: get(f, 'Lat'),
      lng: get(f, 'Lng'),
    }
    // Las filas totalmente vacias (o con solo el ejemplo en blanco) se saltan.
    if (Object.entries(fila).some(([k, v]) => k !== 'fila' && v !== '')) filas.push(fila)
  })
  return { filas, columnas: new Set(COLUMNAS.filter((c) => idx[c] >= 0)) }
}

function numero(t: string): number | null {
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Compara las filas del archivo con los clientes actuales. */
export function compararClientes(filas: FilaArchivo[], existentes: Cliente[], columnas: ReadonlySet<Columna> = new Set(COLUMNAS)): Resultado[] {
  const porCodigo = new Map(existentes.map((c) => [normalizarCodigo(c.codigo), c]))
  const vistos = new Map<string, number>()
  const salida: Resultado[] = []

  for (const f of filas) {
    const codigo = f.codigo.trim()
    const err = (motivo: string): Resultado => ({ tipo: 'error', fila: f.fila, codigo, motivo })
    if (!codigo) { salida.push(err('Falta el código.')); continue }
    const k = normalizarCodigo(codigo)
    if (vistos.has(k)) { salida.push(err(`Código repetido en el archivo (ya estaba en la fila ${vistos.get(k)}).`)); continue }
    vistos.set(k, f.fila)

    const lat = numero(f.lat)
    const lng = numero(f.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) { salida.push(err('Latitud o longitud no es un número.')); continue }
    if ((lat === null) !== (lng === null)) { salida.push(err('Hay que completar latitud y longitud juntas, o dejar las dos vacías.')); continue }
    if (lat !== null && (lat < -90 || lat > 90 || (lng as number) < -180 || (lng as number) > 180)) {
      salida.push(err('Latitud o longitud fuera de rango.')); continue
    }

    const actual = porCodigo.get(k)
    if (!actual) {
      if (f.razon_social.trim().length < 2) { salida.push(err('Cliente nuevo sin razón social.')); continue }
      salida.push({
        tipo: 'nuevo',
        fila: f.fila,
        datos: {
          codigo,
          razon_social: f.razon_social.trim(),
          nombre_fantasia: f.nombre_fantasia.trim() || null,
          ciudad: f.ciudad.trim() || null,
          zona: f.zona.trim() || null,
          lat,
          lng,
        },
      })
      continue
    }

    // Existente. La razon social es obligatoria: si viene vacia es un error, no se pisa en silencio.
    if (f.razon_social.trim().length < 2) { salida.push(err('La razón social no puede quedar vacía.')); continue }
    // Fantasia: vacia en el archivo = se vacia (solo si la columna existe; sin columna no se toca).
    // Ciudad, zona y ubicacion: vacias en el archivo = se conserva lo que ya tenia.
    const datos: DatosCliente = {
      codigo: actual.codigo,
      razon_social: f.razon_social.trim(),
      nombre_fantasia: columnas.has('NombreFantasia') ? f.nombre_fantasia.trim() || null : actual.nombre_fantasia,
      ciudad: f.ciudad.trim() || actual.ciudad,
      zona: f.zona.trim() || actual.zona,
      lat: lat ?? actual.lat,
      lng: lng ?? actual.lng,
    }
    const cambios: string[] = []
    if (datos.razon_social !== actual.razon_social) cambios.push('razón social')
    if (datos.nombre_fantasia !== actual.nombre_fantasia) cambios.push('nombre fantasía')
    if (datos.ciudad !== actual.ciudad) cambios.push('ciudad')
    if (datos.zona !== actual.zona) cambios.push('zona')
    if (datos.lat !== actual.lat || datos.lng !== actual.lng) cambios.push('ubicación')
    salida.push(cambios.length ? { tipo: 'actualizar', fila: f.fila, id: actual.id, datos, cambios } : { tipo: 'sin-cambios', fila: f.fila })
  }
  return salida
}

/** Lee la primera hoja del .xlsx. */
export async function leerExcel(archivo: File): Promise<{ filas: FilaArchivo[]; columnas: Set<Columna> } | { error: string }> {
  if (archivo.size > LIMITE_BYTES) return { error: 'El archivo pesa más de 5 MB.' }
  if (!/\.xlsx$/i.test(archivo.name)) return { error: 'El archivo tiene que ser un Excel .xlsx. Si es .xls o .csv, abrilo en Excel y guardalo como .xlsx.' }
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  try {
    await libro.xlsx.load(await archivo.arrayBuffer())
  } catch {
    return { error: 'No se pudo leer el archivo. Verificá que sea un Excel .xlsx válido.' }
  }
  const hoja = libro.worksheets[0]
  if (!hoja) return { error: 'El archivo no tiene hojas.' }
  const matriz: unknown[][] = []
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const valores = fila.values as unknown[]
    matriz[fila.number - 1] = valores.slice(1)
  })
  const lectura = filasDeHoja(Array.from(matriz, (f) => f ?? []))
  if ('filas' in lectura && lectura.filas.length > LIMITE_FILAS) return { error: `El archivo tiene más de ${LIMITE_FILAS} filas.` }
  return lectura
}

/** Genera y descarga la plantilla: una hoja de datos con ejemplos y una de instrucciones. */
export async function descargarPlantilla(): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()

  const hoja = libro.addWorksheet('Clientes')
  hoja.columns = [
    { header: 'Codigo', key: 'c', width: 12 },
    { header: 'RazonSocial', key: 'r', width: 38 },
    { header: 'NombreFantasia', key: 'f', width: 30 },
    { header: 'Ciudad', key: 'ci', width: 22 },
    { header: 'Zona', key: 'z', width: 18 },
    { header: 'Lat', key: 'la', width: 14 },
    { header: 'Lng', key: 'ln', width: 14 },
  ]
  hoja.addRows([
    [297109, 'EJEMPLO S.A.', 'TIENDA EJEMPLO', 'ASUNCION', 'GRAN ASUNCION', -25.2637, -57.5759],
    [297110, 'JUAN PEREZ', '', 'CIUDAD DEL ESTE', 'ALTO PARANA', null, null],
  ])
  const enc = hoja.getRow(1)
  enc.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A1B1A' } }
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  const ayuda = libro.addWorksheet('Instrucciones')
  ayuda.getColumn(1).width = 110
  ;[
    'Cómo importar clientes',
    '',
    '1. Completá la hoja "Clientes" con un cliente por fila. Podés borrar las dos filas de ejemplo.',
    '2. No cambies los nombres de la primera fila (Codigo, RazonSocial, NombreFantasia, Ciudad, Zona, Lat, Lng).',
    '3. Codigo es obligatorio y es lo que identifica al cliente: si ese código ya existe en la app, se actualizan sus datos; si no existe, se crea.',
    '4. RazonSocial es obligatoria para los clientes nuevos. Los demás datos son opcionales.',
    '5. En un cliente que ya existe: si NombreFantasia queda vacío, se borra el nombre de fantasía; la RazonSocial no puede quedar vacía. Ciudad, Zona y la ubicación (Lat/Lng) vacías NO borran lo que el cliente ya tiene.',
    '6. Lat y Lng van juntas (ej. -25.2637 y -57.5759) o las dos vacías. Se acepta punto o coma decimal.',
    '7. Los clientes que no estén en el archivo no se tocan.',
    '8. Antes de guardar, la app muestra un resumen (nuevos, a actualizar, sin cambios y filas con errores) para confirmar.',
  ].forEach((t, i) => {
    const c = ayuda.getCell(i + 1, 1)
    c.value = t
    c.alignment = { wrapText: true, vertical: 'top' }
    if (i === 0) c.font = { bold: true, size: 14 }
  })

  const datos = await libro.xlsx.writeBuffer()
  descargarArchivo('plantilla-clientes.xlsx', datos, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

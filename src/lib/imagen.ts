/**
 * Todo el procesamiento de imagenes pasa en el navegador, antes de subir:
 *
 *  · HEIC/HEIF (fotos de iPhone) → JPEG, con heic2any.
 *  · PDF → una imagen por pagina, con pdf.js (cada pagina es un pedido).
 *  · Compresion a 1600 px de lado mayor y JPEG 0.82: la foto de un celular
 *    pesa varios MB y el limite de cuerpo de Vercel es 4.5 MB.
 *  · Auto-rotacion: los formularios de pedido son apaisados, asi que una
 *    foto vertical se gira 90° antihorario (igual que la app original).
 *
 * heic2any y pdf.js se cargan recien cuando hacen falta: pesan bastante y la
 * mayoria de las fotos son JPEG comunes.
 */

export const TAMANO_MAXIMO = 20 * 1024 * 1024
const LADO_MAXIMO = 1600
const CALIDAD_JPEG = 0.82
const LADO_AVATAR = 300

export const ACEPTA_ARCHIVOS =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,application/pdf,.heic,.heif'

export interface Pagina {
  blob: Blob
  /** Para mostrar en la cola: "archivo.pdf — pag. 2". */
  nombre: string
}

function esHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

function esPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function canvasABlob(canvas: HTMLCanvasElement, calidad = CALIDAD_JPEG): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))),
      'image/jpeg',
      calidad,
    )
  })
}

async function decodificar(blob: Blob): Promise<ImageBitmap> {
  try {
    // `from-image` respeta la orientacion EXIF de las fotos de celular.
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo leer la imagen. Proba con otro archivo.')
  }
}

/**
 * Reduce a 1600 px y pasa a JPEG. Si `autoRotar` y la imagen es vertical, la
 * gira 90° antihorario para que el formulario quede apaisado.
 */
export async function comprimir(blob: Blob, autoRotar: boolean): Promise<Blob> {
  const img = await decodificar(blob)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height))
  const w = Math.round(img.width * escala)
  const h = Math.round(img.height * escala)
  const rotar = autoRotar && h > w

  const canvas = document.createElement('canvas')
  canvas.width = rotar ? h : w
  canvas.height = rotar ? w : h
  const ctx = canvas.getContext('2d')!
  if (rotar) {
    ctx.translate(0, w)
    ctx.rotate(-Math.PI / 2)
  }
  ctx.drawImage(img, 0, 0, w, h)
  img.close()
  return canvasABlob(canvas)
}

/** Gira 90° antihorario (el boton de rotar de la vista previa). */
export async function rotar90(blob: Blob): Promise<Blob> {
  const img = await decodificar(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.height
  canvas.height = img.width
  const ctx = canvas.getContext('2d')!
  ctx.translate(0, img.width)
  ctx.rotate(-Math.PI / 2)
  ctx.drawImage(img, 0, 0)
  img.close()
  return canvasABlob(canvas, 0.9)
}

async function heicAJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const resultado = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(resultado) ? resultado[0] : resultado
}

async function pdfAPaginas(file: File): Promise<Pagina[]> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const paginas: Pagina[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i)
    const viewport = pagina.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await pagina.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    // Un PDF ya viene con la orientacion correcta: no se auto-rota.
    const blob = await comprimir(await canvasABlob(canvas, 0.92), false)
    paginas.push({ blob, nombre: `${file.name} — pag. ${i}` })
  }
  void doc.loadingTask.destroy()
  return paginas
}

/**
 * Prepara un archivo elegido por el usuario: devuelve una o mas imagenes
 * (mas de una solo si es un PDF de varias paginas), ya comprimidas.
 */
export async function prepararArchivo(file: File): Promise<Pagina[]> {
  if (file.size > TAMANO_MAXIMO) throw new Error('El archivo supera los 20 MB.')
  if (esPdf(file)) return pdfAPaginas(file)
  const fuente = esHeic(file) ? await heicAJpeg(file) : file
  return [{ blob: await comprimir(fuente, true), nombre: file.name }]
}

/** Recorte cuadrado centrado de 300 px, para el avatar. */
export async function recortarAvatar(file: File): Promise<Blob> {
  const fuente = esHeic(file) ? await heicAJpeg(file) : file
  const img = await decodificar(fuente)
  const lado = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = LADO_AVATAR
  canvas.height = LADO_AVATAR
  canvas
    .getContext('2d')!
    .drawImage(
      img,
      (img.width - lado) / 2,
      (img.height - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO_AVATAR,
      LADO_AVATAR,
    )
  img.close()
  return canvasABlob(canvas, 0.85)
}

/** Base64 sin el prefijo `data:...;base64,`, para mandar a /api. */
export function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    lector.readAsDataURL(blob)
  })
}

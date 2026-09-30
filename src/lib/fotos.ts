import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Fotos de pedidos (bucket privado `pedidos`). Se ven con URLs firmadas que
 * caducan: se piden de a una, se cachean en memoria un rato y se vuelven a
 * pedir cuando estan por vencer.
 */

const VIGENCIA_S = 60 * 60
const cache = new Map<string, { url: string; vence: number }>()
const pendientes = new Map<string, Promise<string | null>>()

export async function urlFoto(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.vence > Date.now() + 60_000) return hit.url
  const enCurso = pendientes.get(path)
  if (enCurso) return enCurso

  const p = supabase.storage
    .from('pedidos')
    .createSignedUrl(path, VIGENCIA_S)
    .then(({ data }) => {
      if (!data?.signedUrl) return null
      cache.set(path, { url: data.signedUrl, vence: Date.now() + VIGENCIA_S * 1000 })
      return data.signedUrl
    })
    .finally(() => pendientes.delete(path))
  pendientes.set(path, p)
  return p
}

/** URL firmada de la foto de un pedido, o null mientras carga / si no tiene. */
export function useUrlFoto(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!path) return
    let vigente = true
    urlFoto(path).then((u) => vigente && setUrl(u))
    return () => {
      vigente = false
    }
  }, [path])
  return url
}

/** Sube la foto ya comprimida. Devuelve la ruta a guardar en `pedidos.imagen_path`. */
export async function subirFotoPedido(blob: Blob, usuarioId: string): Promise<string> {
  const path = `${usuarioId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('pedidos')
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error('No se pudo subir la foto. Revisa la conexion e intenta de nuevo.')
  return path
}

/** Borra una foto; los errores no se propagan (a lo sumo queda un archivo huerfano). */
export async function borrarFotoPedido(path: string | null | undefined): Promise<void> {
  if (!path) return
  cache.delete(path)
  await supabase.storage.from('pedidos').remove([path])
}

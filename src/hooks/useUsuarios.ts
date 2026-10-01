import { useCallback, useEffect, useState } from 'react'
import type { Rol, Usuario } from '@/lib/database.types'
import { blobABase64 } from '@/lib/imagen'
import { apiFetch, supabase } from '@/lib/supabase'

interface Estado {
  data: Usuario[]
  loading: boolean
  error: string | null
}

/**
 * Las personas del sistema. Quien no es admin solo recibe su propia fila:
 * eso lo decide la RLS (`supabase/migrations/002_rls.sql`), no este hook.
 *
 * El reparto entre PostgREST y /api no es arbitrario:
 *
 *   · Cambiar el rol y activar/desactivar van DIRECTO a PostgREST. Son las
 *     unicas dos columnas con `grant update` para el cliente, y la policy ya
 *     exige ser admin; no hace falta un endpoint que repita ese chequeo.
 *   · Crear, editar username/nombre/foto, cambiar contrasena y eliminar pasan
 *     por /api/admin/usuarios, porque tocan `auth.users` (o el bucket de
 *     avatares) y eso necesita la service_role key, que solo vive en el servidor.
 *
 * Antes de agregar un endpoint nuevo conviene preguntarse de que lado cae.
 */
export function useUsuarios() {
  const [estado, setEstado] = useState<Estado>({ data: [], loading: true, error: null })

  const refetch = useCallback(async () => {
    setEstado((s) => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('username', { ascending: true })

    setEstado({
      data: (data ?? []) as Usuario[],
      loading: false,
      error: error ? 'No se pudieron cargar los usuarios.' : null,
    })
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function crear(payload: {
    username: string
    nombre: string
    password: string
    rol: Rol
    foto?: Blob | null
  }) {
    try {
      const { foto, ...resto } = payload
      await apiFetch('/api/admin/usuarios', {
        accion: 'crear',
        ...resto,
        foto: foto ? { base64: await blobABase64(foto), mime: 'image/jpeg' } : null,
      })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al crear el usuario.' }
    }
  }

  /** Username, nombre y foto pasan por /api: el username es tambien el login. */
  async function editar(payload: {
    id: string
    username: string
    nombre: string
    foto?: Blob | null
    quitarFoto?: boolean
  }) {
    try {
      const { foto, ...resto } = payload
      await apiFetch('/api/admin/usuarios', {
        accion: 'editar',
        ...resto,
        foto: foto ? { base64: await blobABase64(foto), mime: 'image/jpeg' } : null,
      })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al guardar los datos.' }
    }
  }

  async function cambiarRol(id: string, rol: Rol) {
    const { error } = await supabase.from('usuarios').update({ rol }).eq('id', id)
    return { error: mensajeDePostgrest(error?.message) }
  }

  async function setActivo(id: string, activo: boolean) {
    const { error } = await supabase.from('usuarios').update({ activo }).eq('id', id)
    return { error: mensajeDePostgrest(error?.message) }
  }

  /** Borra la cuenta entera, en Auth y en `usuarios`. No tiene vuelta atras. */
  async function eliminar(id: string) {
    try {
      await apiFetch('/api/admin/usuarios', { accion: 'eliminar', id })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al eliminar la cuenta.' }
    }
  }

  async function cambiarPassword(id: string, password: string) {
    try {
      await apiFetch('/api/admin/usuarios', { accion: 'password', id, password })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al cambiar la contraseña.' }
    }
  }

  return { ...estado, refetch, crear, editar, cambiarRol, setActivo, eliminar, cambiarPassword }
}

/**
 * Un update que la RLS rechaza no llega como error: Postgres afecta cero
 * filas y PostgREST contesta 200. El unico caso que SI da error es el que
 * falla el `with check` -- un admin intentando sacarse a si mismo el rol o
 * desactivarse -- y su mensaje crudo ("new row violates row-level security
 * policy") no le dice nada a nadie.
 */
function mensajeDePostgrest(mensaje: string | undefined): string | null {
  if (!mensaje) return null
  if (/row-level security/i.test(mensaje)) {
    return 'No podés quitarte a vos mismo el acceso de administrador.'
  }
  if (/permission denied/i.test(mensaje)) {
    return 'No tenés permiso para esta operación.'
  }
  return 'No se pudo guardar el cambio.'
}

import { useEffect, useState } from 'react'
import type { Cliente, Informe, InformeComentario, InformeLike, Pedido } from '@/lib/database.types'
import { crearRecurso, traerTodo } from '@/lib/recurso'
import { supabase } from '@/lib/supabase'

/**
 * Las tres tablas del dominio, cacheadas en memoria (ver src/lib/recurso.ts).
 *
 * Que filas llegan lo decide la RLS (004_dominio.sql), no estas consultas: un
 * vendedor recibe solo sus pedidos e informes aunque aca se pida "todo".
 */

const USUARIO_EMBEBIDO = 'usuario:usuarios(username, nombre, foto_path, rol)'
// informes tiene otro camino a usuarios (a traves de informe_likes), asi que hay que nombrar la FK.
const USUARIO_DE_INFORME = 'usuario:usuarios!informes_usuario_id_fkey(username, nombre, foto_path, rol)'

export const clientes = crearRecurso<Cliente>(
  () =>
    traerTodo((desde, hasta) =>
      supabase.from('clientes').select('*').order('codigo').range(desde, hasta),
    ),
  'No se pudieron cargar los clientes.',
)

export const pedidos = crearRecurso<Pedido>(
  () =>
    traerTodo((desde, hasta) =>
      supabase
        .from('pedidos')
        .select(`*, ${USUARIO_EMBEBIDO}`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(desde, hasta)
    ),
  'No se pudieron cargar los pedidos.',
)

export const informes = crearRecurso<Informe>(
  () =>
    traerTodo((desde, hasta) =>
      supabase
        .from('informes')
        .select(`*, ${USUARIO_DE_INFORME}`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(desde, hasta)
    ),
  'No se pudieron cargar los informes.',
)

/** Muro de informes (prueba, solo admin): para el resto la RLS no devuelve nada. */
export const informeLikes = crearRecurso<InformeLike>(
  () =>
    traerTodo((desde, hasta) =>
      supabase
        .from('informe_likes')
        .select(`*, ${USUARIO_EMBEBIDO}`)
        .order('created_at')
        .order('informe_id')
        .range(desde, hasta)
    ),
  'No se pudieron cargar los me gusta.',
)

export const informeComentarios = crearRecurso<InformeComentario>(
  () =>
    traerTodo((desde, hasta) =>
      supabase
        .from('informe_comentarios')
        .select(`*, ${USUARIO_EMBEBIDO}`)
        .order('created_at')
        .order('id')
        .range(desde, hasta)
    ),
  'No se pudieron cargar los comentarios.',
)

/**
 * Los pedidos de UN cliente, pedidos a la base solo cuando se abre su detalle: asi
 * entrar a Clientes no obliga a bajar todos los pedidos. La RLS decide cuales llegan
 * (un vendedor recibe solo los suyos). Se vuelve a pedir cuando la tabla de pedidos
 * se recarga (por ejemplo, tras editar o borrar uno desde este mismo detalle).
 */
export function usePedidosDeCliente(clienteId: string | null) {
  const version = pedidos.useVersion()
  const [estado, setEstado] = useState<{ clienteId: string | null; data: Pedido[] }>({ clienteId: null, data: [] })

  useEffect(() => {
    if (!clienteId) return
    let vigente = true
    supabase
      .from('pedidos')
      .select(`*, ${USUARIO_EMBEBIDO}`)
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .order('id')
      .then(({ data }) => {
        if (vigente) setEstado({ clienteId, data: (data ?? []) as unknown as Pedido[] })
      })
    return () => {
      vigente = false
    }
  }, [clienteId, version])

  const listo = clienteId !== null && estado.clienteId === clienteId
  return { data: listo ? estado.data : [], cargando: clienteId !== null && !listo }
}

export const useClientes = clientes.useRecurso
export const usePedidos = pedidos.useRecurso
export const useInformes = informes.useRecurso
export const useInformeLikes = informeLikes.useRecurso
export const useInformeComentarios = informeComentarios.useRecurso

/**
 * Traduce el error crudo de PostgREST a algo que se pueda mostrar. Los
 * `raise exception` de los triggers y funciones ya vienen en castellano.
 */
export function mensajeDeError(error: { message?: string; code?: string } | null | undefined, porDefecto: string): string {
  if (!error?.message) return porDefecto
  const m = error.message
  if (/row-level security|permission denied/i.test(m)) return 'No tenés permiso para esta operación.'
  if (error.code === '23505' && /clientes_codigo/i.test(m)) return 'Ya existe un cliente con ese código.'
  if (/Debe seleccionar|ubicacion es obligatoria|ya no existe/i.test(m)) return m
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexion. Revisa internet e intenta de nuevo.'
  return porDefecto
}

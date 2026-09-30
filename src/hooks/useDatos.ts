import type { Cliente, Informe, Pedido } from '@/lib/database.types'
import { crearRecurso, traerTodo } from '@/lib/recurso'
import { supabase } from '@/lib/supabase'

/**
 * Las tres tablas del dominio, cacheadas en memoria (ver src/lib/recurso.ts).
 *
 * Que filas llegan lo decide la RLS (004_dominio.sql), no estas consultas: un
 * vendedor recibe solo sus pedidos e informes aunque aca se pida "todo".
 */

const USUARIO_EMBEBIDO = 'usuario:usuarios(username, nombre, foto_path)'

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
        .select(`*, ${USUARIO_EMBEBIDO}`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(desde, hasta)
    ),
  'No se pudieron cargar los informes.',
)

export const useClientes = clientes.useRecurso
export const usePedidos = pedidos.useRecurso
export const useInformes = informes.useRecurso

/**
 * Traduce el error crudo de PostgREST a algo que se pueda mostrar. Los
 * `raise exception` de los triggers y funciones ya vienen en castellano.
 */
export function mensajeDeError(error: { message?: string; code?: string } | null | undefined, porDefecto: string): string {
  if (!error?.message) return porDefecto
  const m = error.message
  if (/row-level security|permission denied/i.test(m)) return 'No tenes permiso para esta operacion.'
  if (error.code === '23505' && /clientes_codigo/i.test(m)) return 'Ya existe un cliente con ese codigo.'
  if (/Debe seleccionar|ubicacion es obligatoria|ya no existe/i.test(m)) return m
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexion. Revisa internet e intenta de nuevo.'
  return porDefecto
}

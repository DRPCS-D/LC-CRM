/**
 * Tipos de la base, escritos a mano.
 *
 * Se mantienen a mano y no generados porque afinan cosas que el generador no
 * puede saber -- que `rol` es una union y no un string suelto -- y porque
 * llevan los comentarios que explican para que sirve cada campo.
 *
 * El riesgo es que una migracion los deje desactualizados en silencio. Si el
 * proyecto crece, conviene generar los tipos reales con `npm run tipos` y
 * agregar al final de este archivo un chequeo que compare los NOMBRES de las
 * columnas contra `database.generated.ts`: asi una columna renombrada rompe
 * el build en vez de fallar en produccion.
 */

/**
 * Los tres niveles del sistema, los tres globales (ver 002_rls.sql):
 *   · admin      — todo. Es el nivel maximo.
 *   · supervisor — ve todo, no edita ni borra (el "AdminL" de la app vieja).
 *   · vendedor   — carga y ve solo lo suyo.
 *   · cobrador   — solo informes de visita, y solo los suyos.
 */
export type Rol = 'admin' | 'supervisor' | 'vendedor' | 'cobrador'

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
  cobrador: 'Cobrador',
}

export const ROL_DESCRIPCION: Record<Rol, string> = {
  admin: 'Acceso completo: carga, edita y borra todo, y gestiona usuarios.',
  supervisor: 'Ve todo (pedidos, informes, reportes y usuarios), pero no edita ni borra.',
  vendedor: 'Carga pedidos e informes y ve solo los suyos.',
  cobrador: 'Carga informes de visita y ve solo los suyos. No ve pedidos.',
}

export const ROLES: readonly Rol[] = ['vendedor', 'cobrador', 'supervisor', 'admin']

/** Perfil de una persona. Comparte el `id` con su cuenta de `auth.users`. */
export interface Usuario {
  id: string
  /** Lo que se escribe en el login. */
  username: string
  nombre: string
  /** Email INTERNO de Auth (`<username>@lc-crm.local`). No se muestra. */
  email: string
  rol: Rol
  /** La baja. La cuenta sigue existiendo, pero la RLS deja de devolverle datos. */
  activo: boolean
  /** Ruta en el bucket publico `avatares`. */
  foto_path: string | null
  created_at: string
  updated_at: string
}

/** Lo que se trae de `usuarios` embebido en un pedido o informe. */
export interface UsuarioResumen {
  username: string
  nombre: string
  foto_path: string | null
}

export interface Cliente {
  id: string
  /** Identificador de negocio. Unico sin importar mayusculas. */
  codigo: string
  razon_social: string
  nombre_fantasia: string | null
  ciudad: string | null
  zona: string | null
  /** Ubicacion de la ultima visita (la actualiza `guardar_informe`). */
  lat: number | null
  lng: number | null
  created_at: string
  updated_at: string
}

export type ClienteInput = Pick<
  Cliente,
  'codigo' | 'razon_social' | 'nombre_fantasia' | 'ciudad' | 'zona'
>

export const TIPOS_PEDIDO = ['SHOW ROOM', 'STOCK', 'MALETEO'] as const
export type TipoPedido = (typeof TIPOS_PEDIDO)[number]

export interface Pedido {
  id: string
  /** La "Fecha Carga". La pone la base, no el navegador. */
  created_at: string
  updated_at: string
  cliente_id: string | null
  /** Foto del cliente al momento de guardar (la completa un trigger). */
  cliente_nombre: string | null
  cliente_codigo: string | null
  ciudad: string | null
  zona: string | null
  nro_orden: string
  /** Solo digitos, sin ceros a la izquierda: para detectar duplicados. */
  nro_orden_norm: string | null
  tipo: TipoPedido | null
  marca: string | null
  total_pares: number | null
  total_precio: number | null
  obs: string | null
  /** Ruta en el bucket privado `pedidos`. */
  imagen_path: string | null
  usuario_id: string | null
  idempotency_key: string | null
  // Heredados del Sheet (la app ya no los captura)
  ruc: string | null
  nro_pedido: string | null
  entrega: string | null
  direccion: string | null
  forma_pago: string | null
  legacy_id: string | null
  legacy_usuario: string | null
  usuario: UsuarioResumen | null
}

/** Lo que manda la app al crear o editar un pedido. El resto lo decide la base. */
export type PedidoInput = Pick<
  Pedido,
  'cliente_id' | 'nro_orden' | 'tipo' | 'marca' | 'total_pares' | 'total_precio' | 'obs' | 'imagen_path'
>

export interface Informe {
  id: string
  created_at: string
  updated_at: string
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_codigo: string | null
  ciudad: string | null
  zona: string | null
  comentario: string | null
  /** La ubicacion no se edita nunca: es la prueba de la visita. */
  lat: number
  lng: number
  usuario_id: string | null
  legacy_id: string | null
  legacy_usuario: string | null
  usuario: UsuarioResumen | null
}

/** Quien cargo un pedido o informe, incluido el caso migrado sin cuenta. */
export function autorDe(r: { usuario: UsuarioResumen | null; legacy_usuario: string | null }): string {
  return r.usuario?.username ?? r.legacy_usuario ?? '—'
}

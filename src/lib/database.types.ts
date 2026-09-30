/**
 * Tipos de la base, escritos a mano.
 *
 * Se mantienen a mano y no generados porque afinan cosas que el generador no
 * puede saber -- que `rol` es una union y no un string suelto -- y porque
 * llevan los comentarios que explican para que sirve cada campo.
 *
 * El riesgo es que una migracion los deje desactualizados en silencio. Si el
 * proyecto crece, conviene generar los tipos reales con `npm run tipos`
 * (hay que poner el project-id en package.json) y agregar al final de este
 * archivo un chequeo que compare los NOMBRES de las columnas contra
 * `database.generated.ts`: asi una columna renombrada rompe el build en vez
 * de fallar en produccion.
 */

/**
 * Los dos unicos niveles del sistema, los dos globales:
 *   · admin   — gestiona a las demas personas. Es el nivel maximo.
 *   · usuario — usa la app.
 *
 * Si una app necesita permisos mas finos que esto, conviene agregar una
 * tabla de permisos aparte antes que sumar valores aca: el rol esta
 * cableado en la RLS (`private.es_admin()`) y en /api.
 */
export type Rol = 'admin' | 'usuario'

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  usuario: 'Usuario',
}

export const ROLES: readonly Rol[] = ['usuario', 'admin']

/** Perfil de una persona. Comparte el `id` con su cuenta de `auth.users`. */
export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  /** La baja. La cuenta sigue existiendo, pero la RLS deja de devolverle datos. */
  activo: boolean
  created_at: string
  updated_at: string
}

/** Campos que la base calcula sola y que no se mandan nunca en un insert/update. */
type Generados = 'created_at' | 'updated_at'

export type UsuarioInsert = Omit<Usuario, Generados>
export type UsuarioUpdate = Partial<Omit<Usuario, 'id' | Generados>>

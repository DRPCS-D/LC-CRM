import { supabase } from './supabase'

/**
 * Se inicia sesion con un nombre de usuario, pero Supabase Auth necesita un
 * email. Cada cuenta tiene uno interno, `<username>@lc-crm.local`, que nadie
 * ve ni tiene que conocer: lo arma el Login al ingresar y /api/admin/usuarios
 * al crear la cuenta. Si se cambia el dominio, hay que cambiarlo en los dos
 * lados (api/admin/usuarios.ts tiene su propia copia de la constante).
 */
export const DOMINIO_INTERNO = 'lc-crm.local'

/** 'Juan ' → 'juan@lc-crm.local'. Si ya viene un email, lo deja como esta. */
export function emailDeUsername(username: string): string {
  const u = username.trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${DOMINIO_INTERNO}`
}

export const USERNAME_VALIDO = /^[a-z0-9._-]{3,40}$/

export const LARGO_MINIMO_PASSWORD = 6

/** URL publica del avatar (el bucket `avatares` es de lectura publica). */
export function urlAvatar(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from('avatares').getPublicUrl(path).data.publicUrl
}

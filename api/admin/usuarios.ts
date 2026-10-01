import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, exigeAdmin, type Rol } from '../_lib/auth.js'
import { conManejoDeErrores, error, exigeMetodo, leerBody, type ApiHandler } from '../_lib/http.js'

/**
 * Operaciones de usuarios que NO se pueden hacer desde el navegador porque
 * tocan `auth.users` (crear una cuenta, borrarla, cambiar su contrasena o su
 * username, que es tambien su email de login) o el bucket `avatares`, que no
 * tiene policies de escritura.
 *
 * Lo que si hace el cliente directo contra PostgREST es cambiar el rol y
 * activar/desactivar: son las unicas dos columnas con `grant update` para
 * `authenticated`, y la policy ya exige ser admin (ver
 * supabase/migrations/002_rls.sql). Antes de agregar una accion aca conviene
 * preguntarse si no alcanza con una policy.
 *
 * Todas las acciones exigen rol admin, y el rol del que llama se lee de la
 * base a partir del JWT verificado: nunca de lo que mande el cliente.
 *
 * Se inicia sesion con `username`: el email de Auth es uno interno que arma
 * `emailInterno()`. El Login del frontend hace la misma cuenta
 * (src/lib/usuario.ts); si se cambia el dominio hay que cambiarlo en los dos.
 */

const LARGO_MINIMO_PASSWORD = 6
const DOMINIO_INTERNO = 'lc-crm.local'
const ROLES: readonly Rol[] = ['admin', 'supervisor', 'vendedor']
const USERNAME_VALIDO = /^[a-z0-9._-]{3,40}$/

function emailInterno(username: string): string {
  return `${username}@${DOMINIO_INTERNO}`
}

interface Foto {
  base64: string
  mime: string
}

interface Body {
  accion?: 'crear' | 'editar' | 'password' | 'eliminar'
  id?: string
  username?: string
  nombre?: string
  password?: string
  rol?: string
  /** Avatar ya recortado a 300x300 en el navegador. */
  foto?: Foto | null
  /** En `editar`: true borra el avatar actual. */
  quitarFoto?: boolean
}

function normalizarUsername(valor: string | undefined): string {
  return (valor ?? '').trim().toLowerCase()
}

/** Sube el avatar y devuelve su ruta en el bucket, o un mensaje de error. */
async function subirAvatar(
  admin: SupabaseClient,
  id: string,
  foto: Foto,
): Promise<{ path: string } | { error: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(foto.mime)) {
    return { error: 'Formato de foto no soportado.' }
  }
  const bytes = Buffer.from(foto.base64, 'base64')
  if (bytes.length > 2 * 1024 * 1024) return { error: 'La foto es demasiado grande.' }

  // El nombre cambia en cada subida: la URL publica del avatar se cachea en
  // el navegador y en el CDN, y con el mismo nombre la foto nueva no se veria.
  const ext = foto.mime.split('/')[1]
  const path = `${id}/${Date.now()}.${ext}`
  const { error: errSubir } = await admin.storage
    .from('avatares')
    .upload(path, bytes, { contentType: foto.mime })
  if (errSubir) return { error: 'No se pudo subir la foto.' }
  return { path }
}

async function borrarAvatar(admin: SupabaseClient, path: string | null | undefined) {
  if (path) await admin.storage.from('avatares').remove([path])
}

const handler: ApiHandler = async (req, res) => {
  if (!exigeMetodo(req, res, 'POST')) return

  const actor = await exigeAdmin(req, res)
  if (!actor) return

  const body = leerBody<Body>(req)
  const admin = clienteAdmin()

  switch (body.accion) {
    // ─────────────────────────────────────────────────────────
    // Crea la cuenta en Auth y su perfil. Son dos escrituras que tienen que
    // pasar o fallar juntas: si la segunda falla, se borra la de Auth, si no
    // queda una cuenta huerfana que ademas bloquea ese username para siempre.
    case 'crear': {
      const username = normalizarUsername(body.username)
      const nombre = body.nombre?.trim() || username
      const password = body.password ?? ''
      const rol: Rol = ROLES.includes(body.rol as Rol) ? (body.rol as Rol) : 'vendedor'

      if (!USERNAME_VALIDO.test(username)) {
        return error(res, 400, 'El usuario debe tener entre 3 y 40 caracteres: letras, numeros, punto, guion.')
      }
      if (password.length < LARGO_MINIMO_PASSWORD) {
        return error(res, 400, `La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
      }

      const { data: existente } = await admin
        .from('usuarios')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      if (existente) return error(res, 409, 'Ya existe ese usuario.')

      const email = emailInterno(username)
      const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (errCrear || !creado.user) {
        const yaExiste = /already|registered|exists/i.test(errCrear?.message ?? '')
        return error(
          res,
          yaExiste ? 409 : 400,
          yaExiste ? 'Ya existe ese usuario.' : 'No se pudo crear el usuario.',
        )
      }
      const id = creado.user.id

      let fotoPath: string | null = null
      if (body.foto) {
        const subida = await subirAvatar(admin, id, body.foto)
        if ('error' in subida) {
          await admin.auth.admin.deleteUser(id)
          return error(res, 400, subida.error)
        }
        fotoPath = subida.path
      }

      const { error: errPerfil } = await admin
        .from('usuarios')
        .insert({ id, username, nombre, email, rol, foto_path: fotoPath })
      if (errPerfil) {
        await borrarAvatar(admin, fotoPath)
        await admin.auth.admin.deleteUser(id)
        return error(res, 400, 'No se pudo crear el perfil del usuario.')
      }

      res.status(200).json({ ok: true, id })
      return
    }

    // ─────────────────────────────────────────────────────────
    // Username, nombre y avatar. El username vive en dos lados -- `usuarios`
    // y el email de `auth.users` -- y hay que cambiarlo en los dos: si solo
    // se cambiara el perfil, la persona no podria iniciar sesion con el
    // username que ve.
    case 'editar': {
      if (!body.id) return error(res, 400, 'Falta el usuario.')
      const username = normalizarUsername(body.username)
      const nombre = body.nombre?.trim() || username
      if (!USERNAME_VALIDO.test(username)) {
        return error(res, 400, 'El usuario debe tener entre 3 y 40 caracteres: letras, numeros, punto, guion.')
      }

      const { data: objetivo } = await admin
        .from('usuarios')
        .select('username, foto_path')
        .eq('id', body.id)
        .maybeSingle()
      if (!objetivo) return error(res, 404, 'Usuario no encontrado.')

      const cambios: Record<string, unknown> = { nombre }

      if (username !== objetivo.username) {
        const { data: otro } = await admin
          .from('usuarios')
          .select('id')
          .eq('username', username)
          .neq('id', body.id)
          .maybeSingle()
        if (otro) return error(res, 409, 'Ya existe ese usuario.')

        const email = emailInterno(username)
        const { error: errEmail } = await admin.auth.admin.updateUserById(body.id, {
          email,
          email_confirm: true,
        })
        if (errEmail) return error(res, 400, 'No se pudo cambiar el usuario.')
        cambios.username = username
        cambios.email = email
      }

      let fotoVieja: string | null = null
      if (body.foto) {
        const subida = await subirAvatar(admin, body.id, body.foto)
        if ('error' in subida) return error(res, 400, subida.error)
        cambios.foto_path = subida.path
        fotoVieja = objetivo.foto_path
      } else if (body.quitarFoto) {
        cambios.foto_path = null
        fotoVieja = objetivo.foto_path
      }

      const { error: errPerfil } = await admin.from('usuarios').update(cambios).eq('id', body.id)
      if (errPerfil) return error(res, 400, 'No se pudo guardar el usuario.')

      await borrarAvatar(admin, fotoVieja)

      res.status(200).json({ ok: true })
      return
    }

    // ─────────────────────────────────────────────────────────
    // Contrasena de OTRA persona. La propia se cambia por
    // /api/cuenta/password, que no exige ser admin.
    case 'password': {
      if (!body.id) return error(res, 400, 'Falta el usuario.')
      const password = body.password ?? ''
      if (password.length < LARGO_MINIMO_PASSWORD) {
        return error(res, 400, `La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
      }

      const { error: errUpd } = await admin.auth.admin.updateUserById(body.id, { password })
      if (errUpd) return error(res, 400, 'No se pudo cambiar la contraseña.')

      res.status(200).json({ ok: true })
      return
    }

    // ─────────────────────────────────────────────────────────
    // Borra la cuenta entera. Nadie puede borrar la propia: es lo que evita
    // que el ultimo admin deje al sistema sin administradores (la RLS ya le
    // impide bajarse de rol o desactivarse).
    //
    // Sus pedidos e informes NO se borran: quedan con `usuario_id` en null
    // (`on delete set null`). Por eso conviene desactivar antes que borrar.
    case 'eliminar': {
      if (!body.id) return error(res, 400, 'Falta el usuario.')
      if (body.id === actor.id) return error(res, 400, 'No podés eliminar tu propia cuenta.')

      const { data: objetivo } = await admin
        .from('usuarios')
        .select('foto_path')
        .eq('id', body.id)
        .maybeSingle()

      // Borrar de auth.users arrastra la fila de `usuarios` por el
      // `on delete cascade` de la foreign key.
      const { error: errBorrar } = await admin.auth.admin.deleteUser(body.id)
      if (errBorrar) return error(res, 400, 'No se pudo eliminar la cuenta.')

      await borrarAvatar(admin, objetivo?.foto_path)

      res.status(200).json({ ok: true })
      return
    }

    default:
      return error(res, 400, 'Accion desconocida.')
  }
}

export default conManejoDeErrores(handler)

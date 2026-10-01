import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { useUsuarios } from '@/hooks/useUsuarios'
import { ROLES, ROL_DESCRIPCION, ROL_LABEL, type Rol, type Usuario } from '@/lib/database.types'
import { formatFecha } from '@/lib/format'
import { recortarAvatar } from '@/lib/imagen'
import { LARGO_MINIMO_PASSWORD, USERNAME_VALIDO } from '@/lib/usuario'

/**
 * Modales de gestion de usuarios. Crear, editar y borrar son del admin (el
 * supervisor solo ve el detalle, sin botones); la RLS y /api cortan igual si
 * alguien llega por otro lado.
 *
 * Un admin puede nombrar a otro admin. Es a proposito: sin un nivel por
 * encima, si no pudiera no habria forma de tener un segundo administrador
 * sin entrar a la base. Lo unico que no puede es sacarse el rol a si mismo
 * (lo impide la policy de update), para que el sistema nunca quede sin admin.
 */

const MENSAJE_USERNAME = 'El usuario debe tener de 3 a 40 caracteres: letras minusculas, numeros, punto, guion.'

function SelectorDeRol({
  valor,
  onCambiar,
  deshabilitado,
  hint,
}: {
  valor: Rol
  onCambiar: (rol: Rol) => void
  deshabilitado?: boolean
  hint?: string
}) {
  return (
    <Field label="Rol" hint={hint ?? ROL_DESCRIPCION[valor]}>
      <Select value={valor} disabled={deshabilitado} onChange={(e) => onCambiar(e.target.value as Rol)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROL_LABEL[r]}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** Foto de perfil: se recorta cuadrada a 300 px en el navegador antes de subir. */
function SelectorDeFoto({
  nombre,
  fotoActual,
  nueva,
  quitar,
  onNueva,
  onQuitar,
}: {
  nombre: string
  fotoActual?: string | null
  nueva: Blob | null
  quitar: boolean
  onNueva: (b: Blob | null) => void
  onQuitar: (q: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!nueva) return setUrl(null)
    const u = URL.createObjectURL(nueva)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [nueva])

  async function elegir(file: File | undefined) {
    if (!file) return
    try {
      onNueva(await recortarAvatar(file))
      onQuitar(false)
    } catch {
      toast.error('No se pudo leer la imagen.')
    }
  }

  const hayFoto = Boolean(nueva) || (Boolean(fotoActual) && !quitar)

  return (
    <div className="flex items-center gap-3">
      {url ? (
        <img src={url} alt="" className="size-14 rounded-full object-cover" />
      ) : (
        <Avatar nombre={nombre || '?'} fotoPath={quitar ? null : fotoActual} className="size-14 text-lg" />
      )}
      <div className="flex gap-2">
        <input ref={inputRef} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = '' }} />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          Elegir foto
        </Button>
        {hayFoto && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { onNueva(null); onQuitar(true) }}>
            Quitar foto
          </Button>
        )}
      </div>
    </div>
  )
}

export function NuevoUsuarioModal({
  abierto,
  onCerrar,
  onCreado,
  crear,
}: {
  abierto: boolean
  onCerrar: () => void
  onCreado: () => void
  crear: ReturnType<typeof useUsuarios>['crear']
}) {
  const [username, setUsername] = useState('')
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('vendedor')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setUsername('')
    setNombre('')
    setPassword('')
    setRol('vendedor')
    setFoto(null)
    setError(null)
  }, [abierto])

  async function onGuardar() {
    const u = username.trim().toLowerCase()
    if (!USERNAME_VALIDO.test(u)) return setError(MENSAJE_USERNAME)
    if (password.length < LARGO_MINIMO_PASSWORD) {
      return setError(`La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
    }

    setGuardando(true)
    setError(null)
    const { error: err } = await crear({ username: u, nombre: nombre.trim() || u, password, rol, foto })
    setGuardando(false)
    if (err) setError(err)
    else {
      toast.success('Usuario creado')
      onCreado()
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Nuevo usuario"
      onCerrar={onCerrar}
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={onGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Crear usuario'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorDeFoto nombre={username} nueva={foto} quitar={false} onNueva={setFoto} onQuitar={() => {}} />
        <Field label="Usuario *" hint="Es lo que escribe para iniciar sesion.">
          <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
        </Field>
        <Field label="Nombre" hint="Opcional. Si se deja vacio se usa el usuario.">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Contrasena *" hint={`Minimo ${LARGO_MINIMO_PASSWORD} caracteres`}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <SelectorDeRol valor={rol} onCambiar={setRol} />
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}

export function UsuarioDetalleModal({
  usuario,
  esYo,
  puedeEditar,
  onCerrar,
  onEditar,
  onEliminar,
  onToggleActivo,
}: {
  usuario: Usuario | null
  /** Es la cuenta de quien esta mirando: no puede desactivarse ni borrarse. */
  esYo: boolean
  /** Solo el admin; el supervisor ve el detalle sin acciones. */
  puedeEditar: boolean
  onCerrar: () => void
  onEditar: () => void
  onEliminar: () => void
  onToggleActivo: () => void
}) {
  if (!usuario) return null

  return (
    <Modal
      abierto
      titulo="Detalle del usuario"
      onCerrar={onCerrar}
      ancho="max-w-md"
      footer={
        puedeEditar ? (
          <>
            {!esYo && (
              <Button variant="outline" onClick={onEliminar}>
                <Trash2 className="text-destructive" /> Eliminar
              </Button>
            )}
            <Button onClick={onEditar}>
              <Pencil /> Editar
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar nombre={usuario.username} fotoPath={usuario.foto_path} className="size-14 text-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-foreground">{usuario.username}</h2>
            {usuario.nombre !== usuario.username && <p className="truncate text-sm text-muted-foreground">{usuario.nombre}</p>}
          </div>
          <button onClick={onToggleActivo} disabled={esYo || !puedeEditar}>
            <Badge tono={usuario.activo ? 'success' : 'neutral'}>{usuario.activo ? 'Activo' : 'Inactivo'}</Badge>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Rol</p>
            <p className="text-foreground">{ROL_LABEL[usuario.rol]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alta</p>
            <p className="text-foreground">{formatFecha(usuario.created_at)}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{ROL_DESCRIPCION[usuario.rol]}</p>

        {puedeEditar && (
          <p className="text-xs text-muted-foreground">
            {esYo
              ? 'Es tu propia cuenta: no podes desactivarla ni eliminarla.'
              : `Toca el estado para ${usuario.activo ? 'desactivar' : 'activar'} la cuenta.`}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function EditarUsuarioModal({
  usuario,
  esYo,
  onCerrar,
  onGuardado,
  editar,
  cambiarRol,
  cambiarPassword,
}: {
  usuario: Usuario | null
  esYo: boolean
  onCerrar: () => void
  onGuardado: () => void
  editar: ReturnType<typeof useUsuarios>['editar']
  cambiarRol: ReturnType<typeof useUsuarios>['cambiarRol']
  cambiarPassword: ReturnType<typeof useUsuarios>['cambiarPassword']
}) {
  const [username, setUsername] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('vendedor')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [quitarFoto, setQuitarFoto] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!usuario) return
    setUsername(usuario.username)
    setNombre(usuario.nombre)
    setRol(usuario.rol)
    setFoto(null)
    setQuitarFoto(false)
    setPassword('')
    setError(null)
  }, [usuario])

  async function onGuardar() {
    if (!usuario) return
    const u = username.trim().toLowerCase()
    if (!USERNAME_VALIDO.test(u)) return setError(MENSAJE_USERNAME)
    // Vacia = no se cambia. Se valida antes de escribir nada, para no dejar
    // guardados los datos y fallar recien en la contrasena.
    if (password && password.length < LARGO_MINIMO_PASSWORD) {
      return setError(`La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
    }

    setGuardando(true)
    setError(null)

    // Hasta tres escrituras por caminos distintos: username/nombre/foto y la
    // contrasena van por /api (tocan auth.users y el bucket) y el rol va
    // directo a PostgREST. Si una falla no se intenta la siguiente.
    const { error: errDatos } = await editar({
      id: usuario.id,
      username: u,
      nombre: nombre.trim() || u,
      foto,
      quitarFoto,
    })
    if (errDatos) {
      setGuardando(false)
      setError(errDatos)
      return
    }

    if (rol !== usuario.rol) {
      const { error: errRol } = await cambiarRol(usuario.id, rol)
      if (errRol) {
        setGuardando(false)
        setError(errRol)
        return
      }
    }

    // La contrasena va al final: los datos ya quedaron guardados y, si esto
    // falla, hay que decirlo (cerrando el modal para que se vea el cambio).
    if (password) {
      const { error: errPass } = await cambiarPassword(usuario.id, password)
      if (errPass) {
        setGuardando(false)
        toast.error(`Los datos se guardaron, pero no se pudo cambiar la contrasena: ${errPass}`)
        onGuardado()
        return
      }
    }

    setGuardando(false)
    toast.success(password ? 'Datos y contrasena actualizados' : 'Datos actualizados')
    onGuardado()
  }

  return (
    <Modal
      abierto={usuario !== null}
      titulo={`Editar — ${usuario?.username ?? ''}`}
      onCerrar={onCerrar}
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={onGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorDeFoto nombre={username} fotoActual={usuario?.foto_path} nueva={foto} quitar={quitarFoto} onNueva={setFoto} onQuitar={setQuitarFoto} />
        <Field label="Usuario *" hint="Es lo que escribe para iniciar sesion: cambiarlo cambia su login.">
          <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} autoFocus />
        </Field>
        <Field label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <SelectorDeRol
          valor={rol}
          onCambiar={setRol}
          deshabilitado={esYo}
          hint={esYo ? 'No podes cambiarte el rol a vos mismo.' : undefined}
        />
        {/* La propia contrasena no se cambia desde aca: al cambiarla, Supabase
            cierra la sesion de quien la cambia. Para eso esta el icono de la
            llave de la barra, que vuelve a iniciar sesion solo. */}
        <Field
          label="Nueva contrasena"
          hint={
            esYo
              ? 'Tu propia contrasena se cambia con el icono de la llave, arriba a la derecha.'
              : `Dejala vacia para no cambiarla. Minimo ${LARGO_MINIMO_PASSWORD} caracteres.`
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={esYo}
          />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}

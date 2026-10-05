import { Plus, Search, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Input } from '@/components/ui/field'
import { ConfirmModal } from '@/components/ui/modal'
import {
  EditarUsuarioModal,
  NuevoUsuarioModal,
  UsuarioDetalleModal,
} from '@/components/usuarios/UsuarioModales'
import { useAuth } from '@/hooks/useAuth'
import { useUsuarios } from '@/hooks/useUsuarios'
import { ROL_LABEL, type Usuario } from '@/lib/database.types'
import { normalizar } from '@/lib/format'

/**
 * Las personas del sistema. Las ven admin y supervisor (la ruta esta detras
 * de <RequiereVeTodo> y la RLS no le devuelve la lista a un vendedor); solo
 * el admin puede crear, editar, desactivar y borrar.
 */
export default function Usuarios() {
  const { usuario: yo, esAdmin, refrescarPerfil } = useAuth()
  const {
    data,
    loading,
    error,
    refetch,
    crear,
    editar,
    cambiarRol,
    setActivo,
    eliminar,
    cambiarPassword,
  } = useUsuarios()

  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return data
    return data.filter((u) => normalizar(u.nombre).includes(q) || normalizar(u.username).includes(q))
  }, [data, busqueda])

  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalDetalle, setModalDetalle] = useState<Usuario | null>(null)
  const [modalEditar, setModalEditar] = useState<Usuario | null>(null)
  const [modalEliminar, setModalEliminar] = useState<Usuario | null>(null)

  const esYo = (u: Usuario | null) => u?.id === yo?.id

  /** Tras editarse a si mismo, el perfil del header quedaria con los datos viejos. */
  async function recargar(cambiado: Usuario | null) {
    await refetch()
    if (esYo(cambiado)) await refrescarPerfil()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Quiénes tienen acceso al sistema y con qué rol.
          </p>
        </div>
        {esAdmin && (
          <Button onClick={() => setModalNuevo(true)}>
            <Plus /> Nuevo usuario
          </Button>
        )}
      </div>

      {data.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por usuario o nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : data.length === 0 ? (
        <Vacio icono={UserRound} titulo="Sin usuarios" />
      ) : filtrados.length === 0 ? (
        <Vacio icono={UserRound} titulo="Sin resultados" descripcion="Probá con otra búsqueda." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Usuario</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Nombre</th>
                <th className="px-4 py-2.5 font-medium">Rol</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setModalDetalle(u)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-foreground">
                    <span className="flex items-center gap-2.5">
                      <Avatar nombre={u.username} fotoPath={u.foto_path} className="size-7 text-[11px]" />
                      {u.username}
                      {esYo(u) && <span className="text-xs font-normal text-muted-foreground">(vos)</span>}
                    </span>
                  </td>
                  <td className="hidden max-w-[16rem] truncate whitespace-nowrap px-4 py-2.5 text-muted-foreground sm:table-cell">{u.nombre !== u.username ? u.nombre : ''}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{ROL_LABEL[u.rol]}</td>
                  <td className="px-4 py-2.5">
                    <Badge tono={u.activo ? 'success' : 'neutral'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NuevoUsuarioModal
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onCreado={() => {
          setModalNuevo(false)
          refetch()
        }}
        crear={crear}
      />

      <UsuarioDetalleModal
        usuario={modalDetalle}
        esYo={esYo(modalDetalle)}
        puedeEditar={esAdmin}
        onCerrar={() => setModalDetalle(null)}
        onEditar={() => {
          setModalEditar(modalDetalle)
          setModalDetalle(null)
        }}
        onEliminar={() => {
          setModalEliminar(modalDetalle)
          setModalDetalle(null)
        }}
        onToggleActivo={async () => {
          if (!modalDetalle) return
          const { error: err } = await setActivo(modalDetalle.id, !modalDetalle.activo)
          if (err) {
            toast.error(err)
            return
          }
          toast.success(modalDetalle.activo ? 'Cuenta desactivada' : 'Cuenta activada')
          setModalDetalle({ ...modalDetalle, activo: !modalDetalle.activo })
          refetch()
        }}
      />

      <EditarUsuarioModal
        usuario={modalEditar}
        esYo={esYo(modalEditar)}
        onCerrar={() => setModalEditar(null)}
        onGuardado={() => {
          recargar(modalEditar)
          setModalEditar(null)
        }}
        editar={editar}
        cambiarRol={cambiarRol}
        cambiarPassword={cambiarPassword}
      />

      <ConfirmModal
        abierto={modalEliminar !== null}
        titulo="Eliminar cuenta"
        textoConfirmar="Eliminar"
        mensaje={
          <>
            Se va a eliminar la cuenta de <strong>{modalEliminar?.username}</strong> y no va a
            poder volver a entrar. Sus pedidos e informes se conservan, pero quedan sin autor
            vinculado. No tiene vuelta atras; si solo queres cortarle el acceso, desactivala en
            vez de eliminarla.
          </>
        }
        onCancelar={() => setModalEliminar(null)}
        onConfirmar={async () => {
          if (!modalEliminar) return
          const { error: err } = await eliminar(modalEliminar.id)
          if (err) toast.error(err)
          else {
            toast.success('Cuenta eliminada')
            refetch()
          }
          setModalEliminar(null)
        }}
      />
    </div>
  )
}

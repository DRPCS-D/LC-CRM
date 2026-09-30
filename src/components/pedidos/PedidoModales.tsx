import { ChevronLeft, ChevronRight, ImageIcon, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { VisorImagen } from '@/components/VisorImagen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { mensajeDeError, pedidos as recursoPedidos, useClientes } from '@/hooks/useDatos'
import { useAuth } from '@/hooks/useAuth'
import { autorDe, type Pedido } from '@/lib/database.types'
import { formatFechaHora, formatGs, formatMiles } from '@/lib/format'
import { borrarFotoPedido, subirFotoPedido, useUrlFoto } from '@/lib/fotos'
import { ACEPTA_ARCHIVOS, prepararArchivo } from '@/lib/imagen'
import { aPayload, formDePedido, validarPedido, type CampoPedido, type FormPedido } from '@/lib/pedidoForm'
import { supabase } from '@/lib/supabase'
import { PedidoCampos } from './PedidoCampos'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm text-foreground">{children || '—'}</p>
    </div>
  )
}

/**
 * Detalle de un pedido, con la foto, y (solo admin) editar y borrar.
 *
 * `lista` es el conjunto por el que se navega con las flechas (la lista ya
 * filtrada y ordenada de donde se abrio), para recorrer los pedidos sin
 * volver a la tabla.
 */
export function PedidoDetalleModal({
  pedido,
  lista,
  onCambiar,
  onCerrar,
}: {
  pedido: Pedido | null
  lista: Pedido[]
  onCambiar: (p: Pedido) => void
  onCerrar: () => void
}) {
  const { esAdmin } = useAuth()
  const [visor, setVisor] = useState(false)
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const foto = useUrlFoto(pedido?.imagen_path)

  const indice = pedido ? lista.findIndex((p) => p.id === pedido.id) : -1

  useEffect(() => {
    if (!pedido || visor || editando || borrando) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.key === 'ArrowLeft' && indice > 0) onCambiar(lista[indice - 1])
      if (e.key === 'ArrowRight' && indice >= 0 && indice < lista.length - 1) onCambiar(lista[indice + 1])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pedido, visor, editando, borrando, indice, lista, onCambiar])

  if (!pedido) return null

  async function eliminar() {
    if (!pedido) return
    setProcesando(true)
    const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id)
    if (error) {
      setProcesando(false)
      return void toast.error(mensajeDeError(error, 'No se pudo eliminar el pedido.'))
    }
    await borrarFotoPedido(pedido.imagen_path)
    setProcesando(false)
    toast.success('Pedido eliminado')
    setBorrando(false)
    onCerrar()
    recursoPedidos.refetch()
  }

  return (
    <>
      <Modal
        abierto={!editando}
        titulo="Pedido"
        onCerrar={onCerrar}
        ancho="max-w-3xl"
        footer={
          <>
            <div className="mr-auto flex items-center gap-1">
              <Button variant="outline" size="icon" disabled={indice <= 0} onClick={() => onCambiar(lista[indice - 1])} aria-label="Anterior">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" disabled={indice < 0 || indice >= lista.length - 1} onClick={() => onCambiar(lista[indice + 1])} aria-label="Siguiente">
                <ChevronRight />
              </Button>
            </div>
            {esAdmin && (
              <>
                <Button variant="outline" onClick={() => setBorrando(true)}>
                  <Trash2 className="text-destructive" /> Borrar
                </Button>
                <Button onClick={() => setEditando(true)}>
                  <Pencil /> Editar
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <button
            type="button"
            onClick={() => foto && setVisor(true)}
            className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
            aria-label="Ampliar foto"
          >
            {foto ? (
              <img src={foto} alt="Foto del pedido" className="size-full cursor-zoom-in object-contain" />
            ) : (
              <ImageIcon className="size-8 text-muted-foreground" />
            )}
          </button>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">{pedido.cliente_nombre ?? 'Sin cliente'}</h2>
                <p className="text-xs text-muted-foreground">{formatFechaHora(pedido.created_at)}</p>
              </div>
              {pedido.cliente_codigo && <Badge tono="primary">{pedido.cliente_codigo}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato label="N° Orden"><span className="tabular">{pedido.nro_orden}</span></Dato>
              <Dato label="Tipo">{pedido.tipo}</Dato>
              <Dato label="Marca">{pedido.marca}</Dato>
              <Dato label="Usuario">{autorDe(pedido)}</Dato>
              <Dato label="Ciudad">{pedido.ciudad}</Dato>
              <Dato label="Zona">{pedido.zona}</Dato>
              <Dato label="Total pares"><span className="tabular">{formatMiles(pedido.total_pares)}</span></Dato>
              <Dato label="Total precio"><span className="tabular">{formatGs(pedido.total_precio)}</span></Dato>
            </div>
            {pedido.obs && <Dato label="Observaciones">{pedido.obs}</Dato>}
          </div>
        </div>
      </Modal>

      <VisorImagen src={visor ? foto : null} onCerrar={() => setVisor(false)} />

      <PedidoEditarModal
        pedido={editando ? pedido : null}
        onCerrar={() => setEditando(false)}
        onGuardado={(actualizado) => {
          setEditando(false)
          if (actualizado) onCambiar(actualizado)
        }}
      />

      <ConfirmModal
        abierto={borrando}
        titulo="Borrar pedido"
        palabra="eliminar"
        procesando={procesando}
        mensaje={
          <>
            Se va a borrar el pedido <strong>{pedido.nro_orden}</strong> de{' '}
            <strong>{pedido.cliente_nombre}</strong>, con su foto. No tiene vuelta atras.
          </>
        }
        onCancelar={() => setBorrando(false)}
        onConfirmar={eliminar}
      />
    </>
  )
}

/** Edicion de un pedido (admin). La foto se puede reemplazar. */
export function PedidoEditarModal({
  pedido,
  onCerrar,
  onGuardado,
}: {
  pedido: Pedido | null
  onCerrar: () => void
  /** Recibe el pedido actualizado (o null si no se pudo releer). */
  onGuardado: (p: Pedido | null) => void
}) {
  const { usuario } = useAuth()
  const { data: clientes } = useClientes()
  const [form, setForm] = useState<FormPedido | null>(null)
  const [invalidos, setInvalidos] = useState<CampoPedido[]>([])
  const [fotoNueva, setFotoNueva] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const fotoActual = useUrlFoto(pedido?.imagen_path)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pedido) return
    setForm(formDePedido(pedido, clientes))
    setInvalidos([])
    setError(null)
    setFotoNueva((f) => {
      if (f) URL.revokeObjectURL(f.url)
      return null
    })
    // Solo al abrir otro pedido: los clientes pueden refrescarse por detras
    // sin pisar lo que se esta escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.id])

  if (!pedido || !form) return <Modal abierto={false} titulo="" onCerrar={onCerrar}>{null}</Modal>

  async function elegirFoto(file: File | undefined) {
    if (!file) return
    setLeyendo(true)
    try {
      const [primera] = await prepararArchivo(file)
      setFotoNueva((f) => {
        if (f) URL.revokeObjectURL(f.url)
        return { blob: primera.blob, url: URL.createObjectURL(primera.blob) }
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setLeyendo(false)
    }
  }

  async function guardar() {
    if (!pedido || !form) return
    const v = validarPedido(form)
    setInvalidos(v.invalidos)
    if (v.mensaje) return setError(v.mensaje)

    setGuardando(true)
    setError(null)
    let pathNuevo: string | null = null
    try {
      if (fotoNueva && usuario) pathNuevo = await subirFotoPedido(fotoNueva.blob, usuario.id)

      const { data, error: err } = await supabase
        .from('pedidos')
        .update({ ...aPayload(form), ...(pathNuevo ? { imagen_path: pathNuevo } : {}) })
        .eq('id', pedido.id)
        .select('*, usuario:usuarios(username, nombre, foto_path)')
        .single()
      if (err) throw err

      // La foto vieja se manda a la papelera recien cuando la nueva ya esta guardada.
      if (pathNuevo) await borrarFotoPedido(pedido.imagen_path)
      toast.success('Pedido actualizado')
      await recursoPedidos.refetch()
      onGuardado(data as unknown as Pedido)
    } catch (e) {
      if (pathNuevo) await borrarFotoPedido(pathNuevo)
      setError(
        e instanceof Error && !('code' in e)
          ? e.message
          : mensajeDeError(e as { message?: string; code?: string }, 'No se pudo guardar el pedido.'),
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo="Editar pedido"
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {fotoNueva || fotoActual ? (
              <img src={fotoNueva?.url ?? fotoActual ?? ''} alt="Foto del pedido" className="size-full object-contain" />
            ) : (
              <ImageIcon className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept={ACEPTA_ARCHIVOS} hidden onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = '' }} />
            <Button type="button" variant="outline" size="sm" disabled={leyendo || guardando} onClick={() => inputRef.current?.click()}>
              <Upload /> {leyendo ? 'Procesando…' : 'Cambiar foto'}
            </Button>
            {fotoNueva && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { URL.revokeObjectURL(fotoNueva.url); setFotoNueva(null) }}>
                <RotateCcw /> Descartar nueva
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <PedidoCampos
            form={form}
            clientes={clientes}
            invalidos={invalidos}
            onCambiar={(p) => setForm((f) => (f ? { ...f, ...p } : f))}
          />
          {error && <ErrorBox mensaje={error} />}
        </div>
      </div>
    </Modal>
  )
}

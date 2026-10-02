import { ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Store, Trash2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ClienteSelector } from '@/components/ClienteSelector'
import { PedidoDetalleModal } from '@/components/pedidos/PedidoModales'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { MultiSelect } from '@/components/ui/multiselect'
import { Buscador, Kpi, SubTabs } from '@/components/ui/tabla'
import { mensajeDeError, useClientes, usePedidos } from '@/hooks/useDatos'
import { useAuth } from '@/hooks/useAuth'
import { escaparHtml } from '@/lib/html'
import { supabase } from '@/lib/supabase'
import type { Cliente, ClienteInput, Pedido } from '@/lib/database.types'
import { formatFecha, formatGs, formatMiles, normalizar } from '@/lib/format'
import { opcionesDe } from '@/lib/orden'
import type { PuntoMapa } from '@/components/Mapa'

const Mapa = lazy(() => import('@/components/Mapa'))

/**
 * Clientes: lista, detalle con su historial de compras y mapa.
 *
 * Todos leen; solo el admin crea, edita y borra (la RLS lo impone, los
 * botones solo se esconden para no ofrecer lo que va a fallar).
 */
export default function Clientes() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
      </div>
      <SubTabs
        tabs={[
          { to: '/clientes', label: 'Clientes', end: true },
          { to: '/clientes/mapa', label: 'Mapa' },
        ]}
      />
      <Routes>
        <Route index element={<ListaClientes />} />
        <Route path="mapa" element={<MapaClientes />} />
        <Route path="*" element={<Navigate to="/clientes" replace />} />
      </Routes>
    </div>
  )
}

function comparaCodigo(a: Cliente, b: Cliente): number {
  // Mayor primero y con conciencia numerica: "10" va antes que "9".
  return b.codigo.localeCompare(a.codigo, 'es', { numeric: true, sensitivity: 'base' })
}

function ListaClientes() {
  const { esAdmin } = useAuth()
  const { data, loading, error, refetch } = useClientes()
  const [busqueda, setBusqueda] = useState('')
  const [ciudades, setCiudades] = useState<string[]>([])
  const [zonas, setZonas] = useState<string[]>([])
  const [detalle, setDetalle] = useState<Cliente | null>(null)
  const [edicion, setEdicion] = useState<Cliente | 'nuevo' | null>(null)
  const [borrar, setBorrar] = useState<Cliente | null>(null)
  const [borrando, setBorrando] = useState(false)

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    return data
      .filter(
        (c) =>
          (!q ||
            [c.codigo, c.razon_social, c.nombre_fantasia, c.ciudad, c.zona].some((v) =>
              normalizar(v ?? '').includes(q),
            )) &&
          (ciudades.length === 0 || ciudades.includes(c.ciudad ?? '')) &&
          (zonas.length === 0 || zonas.includes(c.zona ?? '')),
      )
      .sort(comparaCodigo)
  }, [data, busqueda, ciudades, zonas])

  async function confirmarBorrado() {
    if (!borrar) return
    setBorrando(true)
    const { error: err } = await supabase.from('clientes').delete().eq('id', borrar.id)
    setBorrando(false)
    if (err) return void toast.error(mensajeDeError(err, 'No se pudo eliminar el cliente.'))
    toast.success('Cliente eliminado')
    setBorrar(null)
    setDetalle(null)
    refetch()
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Buscador
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder="Buscar por código, nombre, ciudad o zona…"
          className="w-full sm:max-w-sm"
        />
        <MultiSelect label="Ciudad" opciones={opcionesDe(data, (c) => c.ciudad)} seleccion={ciudades} onCambiar={setCiudades} className="w-44" />
        <MultiSelect label="Zona" opciones={opcionesDe(data, (c) => c.zona)} seleccion={zonas} onCambiar={setZonas} className="w-44" />
        {esAdmin && (
          <Button className="ml-auto" onClick={() => setEdicion('nuevo')}>
            <Plus /> Nuevo cliente
          </Button>
        )}
      </div>

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtrados.length === 0 ? (
        <Vacio icono={Store} titulo={data.length === 0 ? 'Todavía no hay clientes' : 'Sin resultados'} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Código</th>
                <th className="px-3 py-2.5 font-medium">Razón social</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Nombre fantasía</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Ciudad</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Zona</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} onClick={() => setDetalle(c)} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40">
                  <td className="tabular px-3 py-2.5 text-muted-foreground">{c.codigo}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{c.razon_social}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">{c.nombre_fantasia}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{c.ciudad}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{c.zona}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{filtrados.length} de {data.length} clientes</p>

      <ClienteDetalleModal
        cliente={detalle}
        lista={filtrados}
        onCambiar={setDetalle}
        onCerrar={() => setDetalle(null)}
        onEditar={esAdmin ? () => { setEdicion(detalle); setDetalle(null) } : undefined}
        onEliminar={esAdmin ? () => { setBorrar(detalle); setDetalle(null) } : undefined}
      />

      <ClienteFormModal
        valor={edicion}
        onCerrar={() => setEdicion(null)}
        onGuardado={() => { setEdicion(null); refetch() }}
      />

      <ConfirmModal
        abierto={borrar !== null}
        titulo="Eliminar cliente"
        palabra="eliminar"
        procesando={borrando}
        mensaje={
          <>
            Se va a eliminar a <strong>{borrar?.razon_social}</strong> ({borrar?.codigo}). Sus
            pedidos e informes se conservan, pero quedan sin cliente vinculado.
          </>
        }
        onCancelar={() => setBorrar(null)}
        onConfirmar={confirmarBorrado}
      />
    </div>
  )
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{children || '—'}</p>
    </div>
  )
}

function ClienteDetalleModal({
  cliente,
  lista,
  onCambiar,
  onCerrar,
  onEditar,
  onEliminar,
}: {
  cliente: Cliente | null
  lista: Cliente[]
  onCambiar: (c: Cliente) => void
  onCerrar: () => void
  onEditar?: () => void
  onEliminar?: () => void
}) {
  const { usuario, veTodo } = useAuth()
  const { data: pedidos } = usePedidos()
  const [pedidoAbierto, setPedidoAbierto] = useState<Pedido | null>(null)
  const [totalGlobal, setTotalGlobal] = useState<number | null>(null)

  const indice = cliente ? lista.findIndex((c) => c.id === cliente.id) : -1

  // Los pedidos que ve la persona: todos si es admin/supervisor, los propios si es vendedor.
  const propios = useMemo(
    () => (cliente ? pedidos.filter((p) => p.cliente_id === cliente.id) : []),
    [pedidos, cliente],
  )
  const totalPares = propios.reduce((s, p) => s + (p.total_pares ?? 0), 0)
  const totalMonto = propios.reduce((s, p) => s + (p.total_precio ?? 0), 0)

  // El vendedor ve ademas cuanto compro el cliente en total (todos los vendedores).
  useEffect(() => {
    setTotalGlobal(null)
    if (!cliente || veTodo) return
    let vigente = true
    supabase.rpc('total_global_cliente', { p_cliente_id: cliente.id }).then(({ data }) => {
      if (vigente && typeof data === 'number') setTotalGlobal(data)
    })
    return () => { vigente = false }
  }, [cliente, veTodo])

  useEffect(() => {
    if (!cliente || pedidoAbierto) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.key === 'ArrowLeft' && indice > 0) onCambiar(lista[indice - 1])
      if (e.key === 'ArrowRight' && indice >= 0 && indice < lista.length - 1) onCambiar(lista[indice + 1])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cliente, indice, lista, onCambiar, pedidoAbierto])

  if (!cliente) return null
  const tieneUbicacion = cliente.lat !== null && cliente.lng !== null

  return (
    <>
      <Modal
        abierto
        titulo="Cliente"
        onCerrar={onCerrar}
        ancho="max-w-2xl"
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
            {onEliminar && (
              <Button variant="outline" onClick={onEliminar}>
                <Trash2 className="text-destructive" /> Eliminar
              </Button>
            )}
            {onEditar && (
              <Button onClick={onEditar}>
                <Pencil /> Editar
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{cliente.razon_social}</h2>
              {cliente.nombre_fantasia && <p className="text-sm text-muted-foreground">{cliente.nombre_fantasia}</p>}
            </div>
            <Badge tono="primary">{cliente.codigo}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Dato label="Ciudad">{cliente.ciudad}</Dato>
            <Dato label="Zona">{cliente.zona}</Dato>
          </div>

          {tieneUbicacion && (
            <Link
              to={`/clientes/mapa?cliente=${cliente.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <MapPin className="size-4" /> Ver en el mapa
            </Link>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Kpi titulo="Pedidos" valor={propios.length} />
            <Kpi titulo="Total pares" valor={formatMiles(totalPares)} />
            <Kpi titulo="Total monto" valor={formatGs(totalMonto)} />
          </div>
          {totalGlobal !== null && (
            <Kpi titulo="Total general (todos los vendedores)" valor={formatGs(totalGlobal)} />
          )}
          {!veTodo && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Pedidos, pares y monto son solo los que cargaste vos{usuario ? ` (${usuario.username})` : ''}.
            </p>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pedidos</h3>
            {propios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pedidos.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {propios.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setPedidoAbierto(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40">
                      <span className="min-w-0">
                        <span className="tabular block font-medium">{p.nro_orden}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatFecha(p.created_at)}{p.marca ? ` · ${p.marca}` : ''}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-right">{formatGs(p.total_precio)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      <PedidoDetalleModal
        pedido={pedidoAbierto}
        lista={propios}
        onCambiar={setPedidoAbierto}
        onCerrar={() => setPedidoAbierto(null)}
      />
    </>
  )
}

function ClienteFormModal({
  valor,
  onCerrar,
  onGuardado,
}: {
  valor: Cliente | 'nuevo' | null
  onCerrar: () => void
  onGuardado: () => void
}) {
  const vacio: ClienteInput = { codigo: '', razon_social: '', nombre_fantasia: '', ciudad: '', zona: '' }
  const [form, setForm] = useState<ClienteInput>(vacio)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const editando = valor !== null && valor !== 'nuevo' ? valor : null

  useEffect(() => {
    if (valor === null) return
    setError(null)
    setForm(
      valor === 'nuevo'
        ? vacio
        : {
            codigo: valor.codigo,
            razon_social: valor.razon_social,
            nombre_fantasia: valor.nombre_fantasia ?? '',
            ciudad: valor.ciudad ?? '',
            zona: valor.zona ?? '',
          },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  const set = (k: keyof ClienteInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function guardar() {
    const payload = {
      codigo: form.codigo.trim(),
      razon_social: form.razon_social.trim(),
      nombre_fantasia: form.nombre_fantasia?.trim() || null,
      ciudad: form.ciudad?.trim() || null,
      zona: form.zona?.trim() || null,
    }
    if (!payload.codigo) return setError('El código es obligatorio.')
    if (payload.razon_social.length < 2) return setError('La razón social necesita al menos 2 caracteres.')

    setGuardando(true)
    setError(null)
    const { error: err } = editando
      ? await supabase.from('clientes').update(payload).eq('id', editando.id)
      : await supabase.from('clientes').insert(payload)
    setGuardando(false)
    if (err) return setError(mensajeDeError(err, 'No se pudo guardar el cliente.'))
    toast.success(editando ? 'Cliente actualizado' : 'Cliente creado')
    onGuardado()
  }

  return (
    <Modal
      abierto={valor !== null}
      titulo={editando ? 'Editar cliente' : 'Nuevo cliente'}
      onCerrar={onCerrar}
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Código *" hint="Identifica al cliente. No puede repetirse.">
          <Input value={form.codigo} onChange={set('codigo')} autoFocus autoComplete="off" />
        </Field>
        <Field label="Razón social *">
          <Input value={form.razon_social} onChange={set('razon_social')} autoComplete="off" />
        </Field>
        <Field label="Nombre fantasía">
          <Input value={form.nombre_fantasia ?? ''} onChange={set('nombre_fantasia')} autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ciudad"><Input value={form.ciudad ?? ''} onChange={set('ciudad')} autoComplete="off" /></Field>
          <Field label="Zona"><Input value={form.zona ?? ''} onChange={set('zona')} autoComplete="off" /></Field>
        </div>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}

function MapaClientes() {
  const { data, loading, error } = useClientes()
  const [seleccion, setSeleccion] = useState<Cliente | null>(null)
  const [enfocar, setEnfocar] = useState<string | null>(null)
  const [params] = useSearchParams()

  // Llegar con ?cliente=<id> (desde "Ver en el mapa") enfoca ese cliente.
  useEffect(() => {
    const id = params.get('cliente')
    if (id && data.length) {
      const c = data.find((x) => x.id === id)
      if (c) { setSeleccion(c); setEnfocar(c.id) }
    }
  }, [data, params])

  const conUbicacion = useMemo(() => data.filter((c) => c.lat !== null && c.lng !== null), [data])

  const puntos = useMemo<PuntoMapa[]>(
    () =>
      conUbicacion.map((c) => ({
        id: c.id,
        lat: c.lat as number,
        lng: c.lng as number,
        popup: `<strong>${escaparHtml(c.razon_social)}</strong>${c.nombre_fantasia ? ` (${escaparHtml(c.nombre_fantasia)})` : ''}<br/>Codigo: ${escaparHtml(c.codigo)}<br/>${escaparHtml([c.ciudad, c.zona].filter(Boolean).join(' · '))}<br/><a class="mapa-boton" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">Como llegar</a>`,
      })),
    [conUbicacion],
  )

  if (loading) return <Cargando />
  if (error) return <ErrorBox mensaje={error} />

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-full sm:max-w-md">
          <ClienteSelector
            clientes={data}
            valor={seleccion}
            onCambiar={(c) => {
              setSeleccion(c)
              if (!c) return setEnfocar(null)
              if (c.lat === null || c.lng === null) return void toast.info('Ese cliente todavía no tiene ubicación. Se guarda con su primera visita.')
              setEnfocar(c.id)
            }}
          />
        </div>
        <Button variant="outline" onClick={() => { setSeleccion(null); setEnfocar(null) }}>Todos</Button>
        <span className="text-xs text-muted-foreground">{conUbicacion.length} de {data.length} clientes con ubicacion</span>
      </div>
      <Suspense fallback={<Cargando texto="Cargando mapa…" />}>
        <Mapa puntos={puntos} enfocar={enfocar} />
      </Suspense>
    </div>
  )
}

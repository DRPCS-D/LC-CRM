import { ChevronLeft, ChevronRight, ListFilter, MapPin, Pencil, Plus, Store, Trash2, Upload } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ClienteSelector } from '@/components/ClienteSelector'
import { ImportarClientesModal } from '@/components/clientes/ImportarClientesModal'
import { PedidoDetalleModal } from '@/components/pedidos/PedidoModales'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Field, Input, Select } from '@/components/ui/field'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { MultiSelect } from '@/components/ui/multiselect'
import { AccionBuscador, Buscador, ContadorLista, EnBarraDeTabs, FinDeLista, Kpi, SeccionConTabs, useCargaProgresiva } from '@/components/ui/tabla'
import { mensajeDeError, useClientes, useInformes, usePedidosDeCliente } from '@/hooks/useDatos'
import { useAuth } from '@/hooks/useAuth'
import { escaparHtml } from '@/lib/html'
import { diasDesde, ultimaVisitaPorCliente } from '@/lib/visitas'
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
  const { pathname } = useLocation()
  return (
    <div>
      <SeccionConTabs
        ajustarAlto={!pathname.includes('/mapa')}
        tituloEnCelular={false}
        titulo="Clientes"
        tabs={[
          { to: '/clientes', label: 'Clientes', end: true },
          { to: '/clientes/mapa', label: 'Mapa' },
        ]}
      >
        <Routes>
          <Route index element={<ListaClientes />} />
          <Route path="mapa" element={<MapaClientes />} />
          <Route path="*" element={<Navigate to="/clientes" replace />} />
        </Routes>
      </SeccionConTabs>
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
  const [panel, setPanel] = useState(false)
  const [importando, setImportando] = useState(false)
  const [detalle, setDetalle] = useState<Cliente | null>(null)
  const [edicion, setEdicion] = useState<Cliente | 'nuevo' | null>(null)
  const [borrar, setBorrar] = useState<Cliente | null>(null)
  const [borrando, setBorrando] = useState(false)

  // Ordenar (localeCompare) y normalizar el texto de busqueda cuesta: se hace UNA vez por carga
  // de datos, no en cada tecla ni en cada filtro. Filtrar despues conserva el orden.
  const indice = useMemo(
    () =>
      [...data].sort(comparaCodigo).map((c) => ({
        c,
        // Separado con salto de linea para que una busqueda no pueda "cruzar" de un campo al siguiente.
        texto: normalizar([c.codigo, c.razon_social, c.nombre_fantasia, c.ciudad, c.zona].map((v) => v ?? '').join('\n')),
      })),
    [data],
  )

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    return indice
      .filter(
        ({ c, texto }) =>
          (!q || texto.includes(q)) &&
          (ciudades.length === 0 || ciudades.includes(c.ciudad ?? '')) &&
          (zonas.length === 0 || zonas.includes(c.zona ?? '')),
      )
      .map(({ c }) => c)
  }, [indice, busqueda, ciudades, zonas])

  // Se dibujan de a tandas a medida que se baja; cualquier cambio de busqueda o filtro vuelve al principio.
  const { cantidad, hayMas, centinela } = useCargaProgresiva(filtrados.length, JSON.stringify([busqueda, ciudades, zonas]))
  const visibles = filtrados.slice(0, cantidad)

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
    <div className="flex min-h-0 flex-1 flex-col">

      <EnBarraDeTabs>
        <Buscador
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder="Código, nombre o ciudad…"
          className="w-full sm:w-80"
          acciones={
            <AccionBuscador
              icono={ListFilter}
              titulo="Filtros"
              onClick={() => setPanel((p) => !p)}
              insignia={ciudades.length + zonas.length}
              activo={panel}
            />
          }
        />
      </EnBarraDeTabs>

      {esAdmin && (
        <EnBarraDeTabs lugar="accion">
          <Button onClick={() => setEdicion('nuevo')}>
            <Plus /> Nuevo
          </Button>
        </EnBarraDeTabs>
      )}

      {panel && (
        <Card className="mb-4 shrink-0">
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MultiSelect label="Ciudad" opciones={opcionesDe(data, (c) => c.ciudad)} seleccion={ciudades} onCambiar={setCiudades} />
            <MultiSelect label="Zona" opciones={opcionesDe(data, (c) => c.zona)} seleccion={zonas} onCambiar={setZonas} />
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 sm:col-span-2 lg:col-span-4">
              <Button variant="ghost" disabled={ciudades.length + zonas.length === 0} onClick={() => { setCiudades([]); setZonas([]) }}>
                Limpiar filtros
              </Button>
              {esAdmin && (
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={() => setImportando(true)}>
                    <Upload /> Importar
                  </Button>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {esAdmin && (
        <ImportarClientesModal
          abierto={importando}
          clientes={data}
          onCerrar={() => setImportando(false)}
          onImportado={refetch}
        />
      )}

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtrados.length === 0 ? (
        <Vacio icono={Store} titulo={data.length === 0 ? 'Todavía no hay clientes' : 'Sin resultados'} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 whitespace-nowrap bg-muted shadow-[0_1px_0_0_var(--color-border)]">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Código</th>
                <th className="px-3 py-2.5 font-medium">Razón social</th>
                <th className="px-3 py-2.5 font-medium">Nombre fantasía</th>
                <th className="px-3 py-2.5 font-medium">Ciudad</th>
                <th className="px-3 py-2.5 font-medium">Zona</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} onClick={() => setDetalle(c)} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40">
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-muted-foreground">{c.codigo}</td>
                  <td className="max-w-[18rem] truncate whitespace-nowrap px-3 py-2.5 font-medium text-foreground" title={c.razon_social}>{c.razon_social}</td>
                  <td className="max-w-[16rem] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground" title={c.nombre_fantasia ?? undefined}>{c.nombre_fantasia}</td>
                  <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground" title={c.ciudad ?? undefined}>{c.ciudad}</td>
                  <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground" title={c.zona ?? undefined}>{c.zona}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hayMas && <FinDeLista centinela={centinela} />}
          </div>
          <ContadorLista mostradas={visibles.length} total={filtrados.length} />
        </div>
      )}

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
  const { usuario, veTodo, esCobrador } = useAuth()
  // Los pedidos del cliente se piden solo al abrir su detalle (no al entrar a Clientes).
  const { data: propios, cargando } = usePedidosDeCliente(cliente?.id ?? null)
  const [pedidoAbierto, setPedidoAbierto] = useState<Pedido | null>(null)
  const [totalGlobal, setTotalGlobal] = useState<number | null>(null)

  const indice = cliente ? lista.findIndex((c) => c.id === cliente.id) : -1

  // `propios`: los pedidos que ve la persona (todos si es admin/supervisor, los suyos si es vendedor).
  const totalPares = propios.reduce((s, p) => s + (p.total_pares ?? 0), 0)
  const totalMonto = propios.reduce((s, p) => s + (p.total_precio ?? 0), 0)

  // El vendedor ve ademas cuanto compro el cliente en total (todos los vendedores).
  useEffect(() => {
    setTotalGlobal(null)
    if (!cliente || veTodo || esCobrador) return
    let vigente = true
    supabase.rpc('total_global_cliente', { p_cliente_id: cliente.id }).then(({ data }) => {
      if (vigente && typeof data === 'number') setTotalGlobal(data)
    })
    return () => { vigente = false }
  }, [cliente, veTodo, esCobrador])

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

          {tieneUbicacion ? (
            <Link
              to={`/clientes/mapa?cliente=${cliente.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <MapPin className="size-4" /> Ver en el mapa
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> Sin ubicación registrada
            </span>
          )}

          {/* El cobrador no ve pedidos: sin totales ni lista. */}
          {!esCobrador && (
            <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi titulo="Pedidos" valor={cargando ? '…' : propios.length} />
              <Kpi titulo="Total pares" valor={cargando ? '…' : formatMiles(totalPares)} />
              <Kpi titulo="Total monto" valor={cargando ? '…' : formatGs(totalMonto)} className="col-span-2 sm:col-span-1" />
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
                <p className="text-sm text-muted-foreground">{cargando ? 'Cargando…' : 'Sin pedidos.'}</p>
              ) : (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {propios.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setPedidoAbierto(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40">
                        <span className="tabular hidden w-20 shrink-0 font-medium sm:block">{p.nro_orden}</span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">{formatFecha(p.created_at)}</span>
                        <span className="min-w-0 flex-1 truncate font-medium sm:font-normal sm:text-muted-foreground">{p.marca}</span>
                        <span className="tabular shrink-0 text-right sm:w-28">{formatGs(p.total_precio)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </>
          )}
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
  const [params, setParams] = useSearchParams()
  const aplicado = useRef<string | null>(null)

  // Llegar con ?cliente=<id> (desde "Ver en el mapa") enfoca ese cliente, una
  // sola vez: si los datos se refrescan por detras, no se vuelve a enfocar.
  useEffect(() => {
    const id = params.get('cliente')
    if (!id || id === aplicado.current || !data.length) return
    const c = data.find((x) => x.id === id)
    if (c) {
      aplicado.current = id
      setSeleccion(c)
      setEnfocar(c.id)
    }
  }, [data, params])

  const conUbicacion = useMemo(() => data.filter((c) => c.lat !== null && c.lng !== null), [data])

  // Marcar los clientes a los que hace tiempo que no se visita (solo admin y supervisor:
  // a un vendedor la base le devuelve unicamente sus propias visitas).
  const { veTodo } = useAuth()
  const { data: informes } = useInformes()
  const ultimaVisita = useMemo(() => ultimaVisitaPorCliente(informes), [informes])
  const [sinVisita, setSinVisita] = useState('')
  const mostrados = useMemo(() => {
    if (!veTodo || !sinVisita) return conUbicacion
    const ahora = Date.now()
    return conUbicacion.filter((c) => {
      const u = ultimaVisita.get(c.id)
      if (!u) return true
      return sinVisita !== 'nunca' && diasDesde(u, ahora) >= Number(sinVisita)
    })
  }, [conUbicacion, ultimaVisita, sinVisita, veTodo])
  const filtrando = veTodo && sinVisita !== ''
  const [panel, setPanel] = useState(false)

  // "Ver todos": suelta el cliente elegido y el enfoque, y vuelve a encuadrar todo el mapa.
  function verTodos() {
    setSeleccion(null)
    setEnfocar(null)
    aplicado.current = null
    setParams({}, { replace: true })
  }

  const puntos = useMemo<PuntoMapa[]>(
    () =>
      mostrados.map((c) => ({
        id: c.id,
        lat: c.lat as number,
        lng: c.lng as number,
        tono: filtrando ? ('alerta' as const) : undefined,
        popup: `<strong>${escaparHtml(c.razon_social)}</strong>${c.nombre_fantasia ? ` (${escaparHtml(c.nombre_fantasia)})` : ''}<br/>Codigo: ${escaparHtml(c.codigo)}<br/>${escaparHtml([c.ciudad, c.zona].filter(Boolean).join(' · '))}${veTodo ? `<br/><span style="color:#64748b">Última visita: ${ultimaVisita.has(c.id) ? escaparHtml(formatFecha(ultimaVisita.get(c.id))) : 'nunca'}</span>` : ''}<br/><a class="mapa-boton" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">Como llegar</a>`,
      })),
    [mostrados, filtrando, veTodo, ultimaVisita],
  )

  if (loading) return <Cargando />
  if (error) return <ErrorBox mensaje={error} />

  return (
    <div>
      {/* Como en las demas vistas: el buscador va a la derecha de las pestanas, con el icono de filtros adentro. */}
      <EnBarraDeTabs>
        <div className="w-full sm:w-80">
        <ClienteSelector
          clientes={data}
          valor={seleccion}
          onCambiar={(c) => {
            setSeleccion(c)
            if (!c) return setEnfocar(null)
            if (c.lat === null || c.lng === null) return void toast.info('Ese cliente todavía no tiene ubicación. Se guarda con su primera visita.')
            setEnfocar(c.id)
          }}
          placeholder="Código o nombre…"
          acciones={
            veTodo && <AccionBuscador icono={ListFilter} titulo="Filtros" onClick={() => setPanel((p) => !p)} insignia={sinVisita ? 1 : 0} activo={panel} />
          }
        />
        </div>
      </EnBarraDeTabs>

      {panel && veTodo && (
        <Card className="mb-3">
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Visitas</p>
              <Select value={sinVisita} onChange={(e) => setSinVisita(e.target.value)} aria-label="Filtrar por visitas">
                <option value="">Todos los clientes</option>
                <option value="30">Sin visita hace 30+ días</option>
                <option value="60">Sin visita hace 60+ días</option>
                <option value="90">Sin visita hace 90+ días</option>
                <option value="180">Sin visita hace 180+ días</option>
                <option value="nunca">Nunca visitados</option>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 sm:col-span-2 lg:col-span-4">
              <Button variant="ghost" disabled={!sinVisita} onClick={() => setSinVisita('')}>
                Limpiar filtros
              </Button>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={verTodos}>
                  <MapPin /> Ver todos
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <p className="mb-3 text-xs text-muted-foreground">
        {filtrando
          ? `${mostrados.length} clientes sin visita (de ${conUbicacion.length} con ubicación)`
          : `${conUbicacion.length} de ${data.length} clientes con ubicación`}
      </p>
      <Suspense fallback={<Cargando texto="Cargando mapa…" />}>
        <Mapa puntos={puntos} enfocar={enfocar} />
      </Suspense>
    </div>
  )
}

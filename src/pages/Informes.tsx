import {
  CircleCheck,
  FileSpreadsheet,
  FilePlus2,
  FileText,
  ListFilter,
  Loader2,
  LocateFixed,
  MapIcon,
  MapPinned,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ClienteSelector } from '@/components/ClienteSelector'
import type { PuntoMapa } from '@/components/Mapa'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Field, Input, Textarea } from '@/components/ui/field'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { MultiSelect } from '@/components/ui/multiselect'
import { AccionBuscador, Buscador, EnBarraDeTabs, ContadorLista, FinDeLista, SeccionConTabs, Th, useCargaProgresiva } from '@/components/ui/tabla'
import { Avatar } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { useEstadoSesion } from '@/hooks/useEstadoSesion'
import { clientes as recursoClientes, informes as recursoInformes, mensajeDeError, useClientes, useInformes } from '@/hooks/useDatos'
import { autorDe, type Cliente, type Informe } from '@/lib/database.types'
import { descargarCSV } from '@/lib/exportar'
import { diaLocal, formatFecha, formatFechaHora, haceDias, hoyLocal, marcaDeTiempo, normalizar } from '@/lib/format'
import { escaparHtml } from '@/lib/html'
import { opcionesDe, ordenar, type Orden } from '@/lib/orden'
import { supabase } from '@/lib/supabase'
import { urlAvatar } from '@/lib/usuario'
import { cn } from '@/lib/utils'

const Mapa = lazy(() => import('@/components/Mapa'))

export default function Informes() {
  const { pathname } = useLocation()
  return (
    <div>
      <SeccionConTabs
        ajustarAlto={pathname.endsWith('/lista')}
        tituloEnCelular={false}
        titulo="Informes de visita"
        tabs={[
          { to: '/informes', label: 'Nuevo', end: true, icono: FilePlus2 },
          { to: '/informes/lista', label: 'Informes', icono: FileText },
          { to: '/informes/mapa', label: 'Mapa', icono: MapIcon },
        ]}
      >
        <Routes>
          <Route index element={<NuevoInforme />} />
          <Route path="lista" element={<ListaInformes />} />
          <Route path="mapa" element={<MapaInformes />} />
          <Route path="*" element={<Navigate to="/informes" replace />} />
        </Routes>
      </SeccionConTabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Nuevo informe
// ═══════════════════════════════════════════════════════════════════════════

interface Ubicacion {
  lat: number
  lng: number
  precision: number
  fuente: 'GPS' | 'red'
}

type EstadoUbicacion =
  | { tipo: 'buscando' }
  | { tipo: 'lista'; ubicacion: Ubicacion }
  | { tipo: 'error'; mensaje: string; denegado: boolean }

const MENSAJE_GEO: Record<number, string> = {
  1: 'Permiso de ubicación denegado.',
  2: 'No se pudo determinar la ubicación. Salí a un lugar abierto y tocá Reintentar.',
  3: 'Se agotó el tiempo buscando la ubicación. Tocá Reintentar.',
}

class ErrorUbicacion extends Error {
  denegado: boolean
  constructor(mensaje: string, denegado: boolean) {
    super(mensaje)
    this.denegado = denegado
  }
}

function pedirPosicion(alta: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: alta,
      timeout: alta ? 30_000 : 20_000,
      maximumAge: 0,
    }),
  )
}

/**
 * Primero intenta GPS de alta precision; si falla por algo que no sea que el
 * usuario nego el permiso, cae a la ubicacion por red (menos precisa pero
 * casi siempre disponible bajo techo).
 */
async function obtenerUbicacion(): Promise<Ubicacion> {
  if (!('geolocation' in navigator)) throw new Error('Este dispositivo no permite obtener la ubicación.')
  const aUbicacion = (p: GeolocationPosition, fuente: Ubicacion['fuente']): Ubicacion => ({
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    precision: Math.round(p.coords.accuracy),
    fuente,
  })
  try {
    return aUbicacion(await pedirPosicion(true), 'GPS')
  } catch (e) {
    const codigo = (e as GeolocationPositionError).code
    if (codigo === 1) throw new ErrorUbicacion(MENSAJE_GEO[1], true)
    try {
      return aUbicacion(await pedirPosicion(false), 'red')
    } catch (e2) {
      const c2 = (e2 as GeolocationPositionError).code
      throw new ErrorUbicacion(MENSAJE_GEO[c2] ?? MENSAJE_GEO[2], c2 === 1)
    }
  }
}

/** Pasos para habilitar la ubicacion segun el dispositivo; se ve solo cuando el permiso esta denegado. */
function AyudaPermisoUbicacion() {
  return (
    <details className="mt-1.5 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">¿Cómo habilitarla?</summary>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        <li><strong>iPhone / iPad:</strong> Ajustes › Privacidad y seguridad › Localización › Safari (o el sitio) › «Al usar la app».</li>
        <li><strong>Android:</strong> tocá el candado junto a la dirección › Permisos › Ubicación › Permitir.</li>
        <li><strong>Computadora:</strong> clic en el candado de la barra de direcciones › Ubicación › Permitir.</li>
      </ul>
      <p className="mt-1.5">Después tocá «Reintentar» (o volvé a esta pantalla).</p>
    </details>
  )
}

function NuevoInforme() {
  const { data: clientes } = useClientes()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [comentario, setComentario] = useState('')
  const [actualizar, setActualizar] = useState(true)
  const [ubicacion, setUbicacion] = useState<EstadoUbicacion>({ tipo: 'buscando' })
  const [guardando, setGuardando] = useState(false)
  const clave = useRef(crypto.randomUUID())
  const intento = useRef(0)

  async function buscarUbicacion() {
    const mio = ++intento.current
    setUbicacion({ tipo: 'buscando' })
    try {
      const u = await obtenerUbicacion()
      if (mio === intento.current) setUbicacion({ tipo: 'lista', ubicacion: u })
    } catch (e) {
      if (mio === intento.current) {
        setUbicacion({ tipo: 'error', mensaje: e instanceof Error ? e.message : MENSAJE_GEO[2], denegado: e instanceof ErrorUbicacion && e.denegado })
      }
    }
  }

  // Se captura cada vez que se abre la pestana
  useEffect(() => {
    buscarUbicacion()
    return () => { intento.current++ }
  }, [])

  // Si el permiso estaba denegado y la persona lo habilita en los ajustes, se reintenta solo.
  const denegado = ubicacion.tipo === 'error' && ubicacion.denegado
  useEffect(() => {
    if (!denegado || !navigator.permissions?.query) return
    let estado: PermissionStatus | null = null
    const alCambiar = () => {
      if (estado?.state !== 'denied') buscarUbicacion()
    }
    navigator.permissions.query({ name: 'geolocation' }).then(
      (s) => {
        estado = s
        s.addEventListener('change', alCambiar)
      },
      () => {},
    )
    return () => estado?.removeEventListener('change', alCambiar)
  }, [denegado])

  async function guardar() {
    if (!cliente || ubicacion.tipo !== 'lista') return
    setGuardando(true)
    const { lat, lng } = ubicacion.ubicacion
    try {
      const { error } = await Promise.race([
        supabase.rpc('guardar_informe', {
          p_cliente_id: cliente.id,
          p_comentario: comentario,
          p_lat: lat,
          p_lng: lng,
          p_actualizar_ubicacion: actualizar,
          p_idempotency_key: clave.current,
        }),
        new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 45_000)),
      ])
      if (error) throw error
      toast.success('Informe guardado')
      clave.current = crypto.randomUUID()
      setCliente(null)
      setComentario('')
      recursoInformes.refetch()
      recursoClientes.refetch()
      buscarUbicacion()
    } catch (e) {
      if (e instanceof Error && e.message === 'timeout') {
        toast.error('La conexión está lenta y no se pudo confirmar el guardado. Revisá la lista antes de reintentar.', { duration: 8000 })
      } else {
        toast.error(mensajeDeError(e as { message?: string }, 'No se pudo guardar el informe.'))
      }
    } finally {
      setGuardando(false)
    }
  }

  const lista = ubicacion.tipo === 'lista'

  return (
    <Card className="max-w-2xl">
      <CardBody className="space-y-5">
        <Field label="Cliente *">
          <ClienteSelector clientes={clientes} valor={cliente} onCambiar={setCliente} />
        </Field>

        <Field label="Comentario">
          <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="¿Como fue la visita?" rows={4} />
        </Field>

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <LocateFixed className={cn('mt-0.5 size-5 shrink-0', lista ? 'text-success' : ubicacion.tipo === 'error' ? 'text-destructive' : 'text-muted-foreground')} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">Ubicación</p>
                {ubicacion.tipo === 'buscando' && <p className="text-muted-foreground">Buscando ubicación…</p>}
                {ubicacion.tipo === 'lista' && <CircleCheck className="size-5 text-success" aria-label="Ubicación obtenida" />}
                {ubicacion.tipo === 'error' && <p className="text-destructive">{ubicacion.mensaje}</p>}
                {denegado && <AyudaPermisoUbicacion />}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={buscarUbicacion} disabled={ubicacion.tipo === 'buscando'}>
              <RefreshCw className={cn(ubicacion.tipo === 'buscando' && 'animate-spin')} /> Reintentar
            </Button>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>Actualizar la ubicación del cliente con esta visita</span>
        </label>

        <Button size="lg" className="w-full" onClick={guardar} disabled={!cliente || !lista || guardando}>
          {guardando ? <><Loader2 className="animate-spin" /> Guardando…</> : 'Guardar informe'}
        </Button>
        {(!cliente || !lista) && (
          <p className="-mt-2 text-center text-xs text-muted-foreground">
            {!cliente ? 'Elegí un cliente para poder guardar.' : 'Hace falta la ubicación para poder guardar.'}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Filtros compartidos por la lista y el mapa
// ═══════════════════════════════════════════════════════════════════════════

interface FiltrosInforme {
  busqueda: string
  clientes: string[]
  usuarios: string[]
  ciudades: string[]
  zonas: string[]
  desde: string
  hasta: string
}

const FILTROS_VACIOS: FiltrosInforme = { busqueda: '', clientes: [], usuarios: [], ciudades: [], zonas: [], desde: '', hasta: '' }

function filtrarInformes(data: Informe[], f: FiltrosInforme): Informe[] {
  const q = normalizar(f.busqueda)
  return data.filter((i) => {
    if (q && !normalizar([i.cliente_nombre, i.comentario, autorDe(i), i.ciudad, i.zona].join(' ')).includes(q)) return false
    if (f.clientes.length && !f.clientes.includes(i.cliente_nombre ?? '')) return false
    if (f.usuarios.length && !f.usuarios.includes(autorDe(i))) return false
    if (f.ciudades.length && !f.ciudades.includes(i.ciudad ?? '')) return false
    if (f.zonas.length && !f.zonas.includes(i.zona ?? '')) return false
    const dia = diaLocal(i.created_at)
    if (f.desde && dia < f.desde) return false
    if (f.hasta && dia > f.hasta) return false
    return true
  })
}

function contarFiltros(f: FiltrosInforme): number {
  return f.clientes.length + f.usuarios.length + f.ciudades.length + f.zonas.length + (f.desde ? 1 : 0) + (f.hasta ? 1 : 0)
}

/** Boton "Filtros" con la cantidad de filtros activos, igual que en la tabla. */
function BotonFiltros({ f, abierto, onAlternar }: { f: FiltrosInforme; abierto: boolean; onAlternar: () => void }) {
  const n = contarFiltros(f)
  return (
    <Button variant="outline" onClick={onAlternar} aria-expanded={abierto}>
      <ListFilter /> Filtros
      {n > 0 && <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{n}</span>}
    </Button>
  )
}

/** Atajos de fechas del mapa. Pisan Desde/Hasta; el resto de los filtros no se toca. */
function BotonesRango({ f, onCambiar }: { f: FiltrosInforme; onCambiar: (p: Partial<FiltrosInforme>) => void }) {
  type Clave = 'todo' | 'hoy' | 'semana' | 'mes'
  // Cada atajo es solo un par desde/hasta. El activo se deduce de los filtros actuales, asi
  // tambien se apaga si las fechas se cambian a mano en el panel de Filtros.
  const rangos = (): Record<Clave, { desde: string; hasta: string }> => {
    const hoy = hoyLocal()
    return {
      todo: { desde: '', hasta: '' },
      hoy: { desde: hoy, hasta: '' },
      semana: { desde: diaLocal(haceDias(7)), hasta: '' },
      mes: { desde: hoy.slice(0, 8) + '01', hasta: '' },
    }
  }
  const [elegido, setElegido] = useState<Clave | null>(null)
  const r = rangos()
  const coincide = (k: Clave) => f.desde === r[k].desde && f.hasta === r[k].hasta
  // Si dos atajos dan lo mismo (ej. el dia 1, "Hoy" y "Mes"), gana el ultimo que se toco.
  const activo = (['todo', 'hoy', 'semana', 'mes'] as const).find((k) => (elegido ? k === elegido && coincide(k) : coincide(k))) ?? (['todo', 'hoy', 'semana', 'mes'] as const).find(coincide)

  return (
    <div className="flex flex-wrap gap-2">
      {([['Todo', 'todo'], ['Hoy', 'hoy'], ['Semana', 'semana'], ['Mes', 'mes']] as const).map(([label, k]) => (
        <Button
          key={k}
          variant={activo === k ? 'primary' : 'outline'}
          size="sm"
          aria-pressed={activo === k}
          onClick={() => {
            setElegido(k)
            onCambiar(r[k])
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

function PanelFiltros({
  data,
  f,
  onCambiar,
  exportar,
}: {
  data: Informe[]
  f: FiltrosInforme
  onCambiar: (p: Partial<FiltrosInforme>) => void
  /** Botones de exportar (solo en la lista). */
  exportar?: ReactNode
}) {
  const { veTodo } = useAuth()
  const opciones = useMemo(
    () => ({
      clientes: opcionesDe(data, (i) => i.cliente_nombre),
      usuarios: opcionesDe(data, (i) => autorDe(i)),
      ciudades: opcionesDe(data, (i) => i.ciudad),
      zonas: opcionesDe(data, (i) => i.zona),
    }),
    [data],
  )

  return (
    <Card className="mb-4 shrink-0">
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MultiSelect label="Cliente" opciones={opciones.clientes} seleccion={f.clientes} onCambiar={(clientes) => onCambiar({ clientes })} />
          {veTodo && <MultiSelect label="Usuario" opciones={opciones.usuarios} seleccion={f.usuarios} onCambiar={(usuarios) => onCambiar({ usuarios })} />}
          <MultiSelect label="Ciudad" opciones={opciones.ciudades} seleccion={f.ciudades} onCambiar={(ciudades) => onCambiar({ ciudades })} />
          <MultiSelect label="Zona" opciones={opciones.zonas} seleccion={f.zonas} onCambiar={(zonas) => onCambiar({ zonas })} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Desde</p>
            <Input type="date" value={f.desde} onChange={(e) => onCambiar({ desde: e.target.value })} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Hasta</p>
            <Input type="date" value={f.hasta} onChange={(e) => onCambiar({ hasta: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 sm:col-span-2 lg:col-span-4">
            <Button variant="ghost" disabled={contarFiltros(f) === 0} onClick={() => onCambiar({ ...FILTROS_VACIOS, busqueda: f.busqueda })}>
              Limpiar filtros
            </Button>
            {exportar && <div className="ml-auto flex gap-2">{exportar}</div>}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Lista
// ═══════════════════════════════════════════════════════════════════════════

type CampoOrden = 'fecha' | 'cliente' | 'ciudad' | 'zona' | 'usuario'

interface Estado extends FiltrosInforme {
  orden: Orden<CampoOrden>
}

function valorOrden(i: Informe, c: CampoOrden): unknown {
  switch (c) {
    case 'fecha': return i.created_at
    case 'cliente': return i.cliente_nombre
    case 'ciudad': return i.ciudad
    case 'zona': return i.zona
    case 'usuario': return autorDe(i)
  }
}

function ListaInformes() {
  const { data, loading, error } = useInformes()
  const [e, setE] = useEstadoSesion<Estado>('informes.filtros', { ...FILTROS_VACIOS, orden: { campo: 'fecha', dir: 'desc' } })
  // Plegado/desplegado vive aparte de los filtros: los valores se recuerdan al
  // cambiar de pantalla (sessionStorage), pero el panel arranca siempre plegado.
  const [panel, setPanel] = useState(false)
  const [abierto, setAbierto] = useState<Informe | null>(null)

  const cambiar = (p: Partial<Estado>) => setE((s) => ({ ...s, ...p }))

  const filtrados = useMemo(() => ordenar(filtrarInformes(data, e), e.orden, valorOrden), [data, e])
  // Se dibujan de a tandas a medida que se baja; cualquier cambio de filtro u orden vuelve al principio.
  const { cantidad, hayMas, centinela } = useCargaProgresiva(filtrados.length, JSON.stringify(e))
  const visibles = filtrados.slice(0, cantidad)
  const th = { orden: e.orden, onOrdenar: (orden: Orden<CampoOrden>) => cambiar({ orden }) }

  function exportarCSV() {
    const filas = filtrados.map((i) => [formatFechaHora(i.created_at), i.cliente_nombre, i.cliente_codigo, i.ciudad, i.zona, i.comentario, autorDe(i)])
    descargarCSV(`informes_${marcaDeTiempo()}.csv`, [['Fecha', 'Cliente', 'Código Cliente', 'Ciudad', 'Zona', 'Comentario', 'Usuario'], ...filas])
  }

  const [exportando, setExportando] = useState(false)
  async function exportarPDF() {
    setExportando(true)
    try {
      const { informesPDF } = await import('@/lib/pdf')
      await informesPDF(filtrados)
    } catch {
      toast.error('No se pudo generar el PDF.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EnBarraDeTabs>
        <Buscador
          valor={e.busqueda}
          onCambiar={(busqueda) => cambiar({ busqueda })}
          placeholder="Cliente o comentario…"
          className="w-full sm:w-80"
          acciones={<AccionBuscador icono={ListFilter} titulo="Filtros" onClick={() => setPanel((a) => !a)} insignia={contarFiltros(e)} activo={panel} />}
        />
      </EnBarraDeTabs>

      {panel && (
        <PanelFiltros
          data={data}
          f={e}
          onCambiar={cambiar}
          exportar={
            <>
              <Button variant="outline" onClick={exportarCSV} disabled={filtrados.length === 0}>
                <FileSpreadsheet /> Exportar Excel
              </Button>
              <Button variant="outline" onClick={exportarPDF} disabled={filtrados.length === 0 || exportando}>
                {exportando ? <Loader2 className="animate-spin" /> : <FileText />} Exportar PDF
              </Button>
            </>
          }
        />
      )}


      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtrados.length === 0 ? (
        <Vacio icono={MapPinned} titulo={data.length === 0 ? 'Todavía no hay informes' : 'Sin resultados'} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 whitespace-nowrap bg-card shadow-[0_1px_0_0_var(--color-border)]">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <Th campo="fecha" {...th}>Fecha</Th>
                  <Th campo="cliente" {...th}>Cliente</Th>
                  <Th campo="ciudad" {...th}>Ciudad</Th>
                  <Th campo="zona" {...th}>Zona</Th>
                  <Th campo="usuario" {...th}>Usuario</Th>
                  <Th>Ubicación</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((i) => (
                  <tr key={i.id} onClick={() => setAbierto(i)} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatFecha(i.created_at)}</td>
                    <td className="max-w-[14rem] truncate whitespace-nowrap px-3 py-2.5 font-medium" title={i.cliente_nombre ?? undefined}>{i.cliente_nombre}</td>
                    <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground" title={i.ciudad ?? undefined}>{i.ciudad}</td>
                    <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground" title={i.zona ?? undefined}>{i.zona}</td>
                    <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground">{autorDe(i)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                      <Link to={`/informes/mapa?informe=${i.id}`} className="text-primary hover:underline">Ver en mapa</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hayMas && <FinDeLista centinela={centinela} />}
          </div>
          <ContadorLista mostradas={visibles.length} total={filtrados.length} />
        </div>
      )}

      <InformeDetalleModal informe={abierto} onCerrar={() => setAbierto(null)} onCambiar={setAbierto} />
    </div>
  )
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{children || '—'}</p>
    </div>
  )
}

function InformeDetalleModal({
  informe,
  onCerrar,
  onCambiar,
}: {
  informe: Informe | null
  onCerrar: () => void
  onCambiar: (i: Informe | null) => void
}) {
  const { esAdmin } = useAuth()
  const { data: clientes } = useClientes()
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!informe) return
    setEditando(false)
    setError(null)
    setCliente(clientes.find((c) => c.id === informe.cliente_id) ?? null)
    setComentario(informe.comentario ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [informe?.id])

  if (!informe) return null

  async function guardar() {
    if (!informe || !cliente) return setError('Elegí un cliente.')
    setProcesando(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('informes')
      .update({ cliente_id: cliente.id, comentario: comentario.trim() || null })
      .eq('id', informe.id)
      .select('*, usuario:usuarios(username, nombre, foto_path)')
      .single()
    setProcesando(false)
    if (err) return setError(mensajeDeError(err, 'No se pudo guardar el informe.'))
    toast.success('Informe actualizado')
    await recursoInformes.refetch()
    onCambiar(data as unknown as Informe)
    setEditando(false)
  }

  async function borrar() {
    if (!informe) return
    setProcesando(true)
    const { error: err } = await supabase.from('informes').delete().eq('id', informe.id)
    setProcesando(false)
    if (err) return void toast.error(mensajeDeError(err, 'No se pudo eliminar el informe.'))
    toast.success('Informe eliminado')
    setBorrando(false)
    onCerrar()
    recursoInformes.refetch()
  }

  return (
    <>
      <Modal
        abierto
        titulo={editando ? 'Editar informe' : 'Informe de visita'}
        onCerrar={onCerrar}
        footer={
          editando ? (
            <>
              <Button variant="outline" onClick={() => setEditando(false)} disabled={procesando}>Cancelar</Button>
              <Button onClick={guardar} disabled={procesando}>{procesando ? 'Guardando…' : 'Guardar'}</Button>
            </>
          ) : esAdmin ? (
            <>
              <Button variant="outline" onClick={() => setBorrando(true)}><Trash2 className="text-destructive" /> Eliminar</Button>
              <Button onClick={() => setEditando(true)}><Pencil /> Editar</Button>
            </>
          ) : undefined
        }
      >
        {editando ? (
          <div className="space-y-4">
            <Field label="Cliente *"><ClienteSelector clientes={clientes} valor={cliente} onCambiar={setCliente} /></Field>
            <Field label="Comentario"><Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={4} /></Field>
            <p className="text-xs text-muted-foreground">La ubicación de la visita no se puede modificar.</p>
            {error && <ErrorBox mensaje={error} />}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">{informe.cliente_nombre ?? 'Sin cliente'}</h2>
              {informe.cliente_codigo && <Badge tono="primary">{informe.cliente_codigo}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato label="Usuario">
                <span className="inline-flex items-center gap-2">
                  <Avatar nombre={autorDe(informe)} fotoPath={informe.usuario?.foto_path} className="size-6 text-[10px]" />
                  {autorDe(informe)}
                </span>
              </Dato>
              <Dato label="Fecha"><span className="tabular">{formatFechaHora(informe.created_at)}</span></Dato>
              <Dato label="Ciudad">{informe.ciudad}</Dato>
              <Dato label="Zona">{informe.zona}</Dato>
            </div>
            <Dato label="Comentario">{informe.comentario}</Dato>
            <a
              href={`https://www.google.com/maps?q=${informe.lat},${informe.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <MapPinned className="size-4" /> Abrir ubicacion en Google Maps
            </a>
          </div>
        )}
      </Modal>

      <ConfirmModal
        abierto={borrando}
        titulo="Eliminar informe"
        palabra="eliminar"
        procesando={procesando}
        mensaje={<>Se va a eliminar la visita a <strong>{informe.cliente_nombre}</strong> del {formatFechaHora(informe.created_at)}.</>}
        onCancelar={() => setBorrando(false)}
        onConfirmar={borrar}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Mapa de visitas
// ═══════════════════════════════════════════════════════════════════════════

function MapaInformes() {
  const { data, loading, error } = useInformes()
  // Arranca en "Semana" (todo junto son mil y pico de puntos agrupados que no dicen
  // nada) y recuerda lo ultimo que se eligio mientras dure la sesion.
  const [f, setF] = useEstadoSesion<FiltrosInforme>('informes.mapa', { ...FILTROS_VACIOS, desde: diaLocal(haceDias(7)) })
  const [panel, setPanel] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const enfocar = params.get('informe')

  // Llegar a un informe puntual: que ningun filtro lo oculte
  useEffect(() => {
    if (enfocar) setF(FILTROS_VACIOS)
  }, [enfocar, setF])

  const filtrados = useMemo(() => filtrarInformes(data, f), [data, f])

  const puntos = useMemo<PuntoMapa[]>(
    () =>
      filtrados.map((i) => {
        const autor = autorDe(i)
        return {
          id: i.id,
          lat: i.lat,
          lng: i.lng,
          avatar: { clave: i.usuario_id ?? autor, inicial: autor.charAt(0), url: urlAvatar(i.usuario?.foto_path) },
          popup: `<strong>${escaparHtml(i.cliente_nombre)}</strong><br/><span style="color:#64748b">${escaparHtml(formatFechaHora(i.created_at))} · ${escaparHtml(autor)}</span>${i.comentario ? `<br/>${escaparHtml(i.comentario)}` : ''}`,
        }
      }),
    [filtrados],
  )

  if (loading) return <Cargando />
  if (error) return <ErrorBox mensaje={error} />

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BotonesRango f={f} onCambiar={(p) => setF((s) => ({ ...s, ...p }))} />
        <div className="ml-auto">
          <BotonFiltros f={f} abierto={panel} onAlternar={() => setPanel((a) => !a)} />
        </div>
      </div>
      {panel && <PanelFiltros data={data} f={f} onCambiar={(p) => setF((s) => ({ ...s, ...p }))} />}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{filtrados.length} visitas en el mapa</span>
        {enfocar && <Button variant="ghost" size="sm" onClick={() => navigate('/informes/mapa', { replace: true })}>Quitar enfoque</Button>}
      </div>
      <Suspense fallback={<Cargando texto="Cargando mapa…" />}>
        <Mapa puntos={puntos} enfocar={enfocar} />
      </Suspense>
    </div>
  )
}

import {
  AlertTriangle,
  ClipboardList,
  Download,
  FilePlus2,
  Camera,
  Images,
  ImageUp,
  ListFilter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { PedidoCampos } from '@/components/pedidos/PedidoCampos'
import { PedidoDetalleModal } from '@/components/pedidos/PedidoModales'
import { VisorImagen } from '@/components/VisorImagen'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Input } from '@/components/ui/field'
import { ConfirmModal } from '@/components/ui/modal'
import { MultiSelect } from '@/components/ui/multiselect'
import { Buscador, Kpi, Paginacion, SubTabs, TAMANO_PAGINA, Th } from '@/components/ui/tabla'
import { useAuth } from '@/hooks/useAuth'
import { useEstadoSesion } from '@/hooks/useEstadoSesion'
import { mensajeDeError, pedidos as recursoPedidos, useClientes, usePedidos } from '@/hooks/useDatos'
import { autorDe, TIPOS_PEDIDO, type Cliente, type Pedido } from '@/lib/database.types'
import { descargarCSV } from '@/lib/exportar'
import {
  diaLocal,
  formatFechaHora,
  formatGs,
  formatMiles,
  formatMilesInput,
  marcaDeTiempo,
  normalizar,
  normalizarNroOrden,
  sinAcentos,
} from '@/lib/format'
import { subirFotoPedido } from '@/lib/fotos'
import { ACEPTA_ARCHIVOS, blobABase64, prepararArchivo, rotar90, type Pagina } from '@/lib/imagen'
import { ordenar, opcionesDe, type Orden } from '@/lib/orden'
import { aPayload, FORM_VACIO, validarPedido, type CampoPedido, type FormPedido } from '@/lib/pedidoForm'
import { apiFetch, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export default function Pedidos() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Pedidos</h1>
      </div>
      <SubTabs
        tabs={[
          { to: '/pedidos', label: 'Nuevo', end: true, icono: FilePlus2 },
          { to: '/pedidos/lista', label: 'Pedidos', icono: ClipboardList },
        ]}
      />
      <Routes>
        <Route index element={<NuevoPedido />} />
        <Route path="lista" element={<ListaPedidos />} />
        <Route path="*" element={<Navigate to="/pedidos" replace />} />
      </Routes>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Nuevo pedido
// ═══════════════════════════════════════════════════════════════════════════

const TIMEOUT_GUARDADO_MS = 45_000

class TimeoutGuardado extends Error {}

function conTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutGuardado()), TIMEOUT_GUARDADO_MS)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

function NuevoPedido() {
  const { usuario } = useAuth()
  const { data: clientes, loading: cargandoClientes } = useClientes()
  const { data: pedidos } = usePedidos()

  const [cola, setCola] = useState<Pagina[]>([])
  const [indice, setIndice] = useState(0)
  const [foto, setFoto] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [visor, setVisor] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [extrayendo, setExtrayendo] = useState(false)
  const [form, setForm] = useState<FormPedido>(FORM_VACIO)
  const [invalidos, setInvalidos] = useState<CampoPedido[]>([])
  const [guardando, setGuardando] = useState<'subiendo' | 'guardando' | null>(null)
  const [duplicados, setDuplicados] = useState<Pedido[] | null>(null)
  // Tres inputs porque el tipo de archivo decide que abre el celular:
  //  · archivoRef — el recuadro grande: fotos Y PDF (abre el explorador de archivos).
  //  · galeriaRef — solo `image/*`: abre la galeria de fotos, sin PDF.
  //  · camaraRef  — `capture` fuerza la camara; en la PC se ignora.
  const inputRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)
  const camaraRef = useRef<HTMLInputElement>(null)

  // Una clave por intento de guardado: si la red se corta y hay que reintentar,
  // el segundo insert choca con el unique en vez de duplicar el pedido. Y la
  // foto ya subida se reutiliza en el reintento.
  const claveIntento = useRef<string>(crypto.randomUUID())
  const fotoSubida = useRef<{ blob: Blob; path: string } | null>(null)

  // La vista previa
  useEffect(() => {
    if (!foto) return setPreviewUrl(null)
    const url = URL.createObjectURL(foto)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  const set = (p: Partial<FormPedido>) => {
    setForm((f) => ({ ...f, ...p }))
    setInvalidos((inv) => inv.filter((c) => !(c in p) && !(c === 'pares' && 'pares' in p)))
  }

  const existentes = useMemo(() => {
    const n = normalizarNroOrden(form.nroOrden)
    if (!n) return []
    return pedidos.filter((p) => p.nro_orden_norm === n)
  }, [pedidos, form.nroOrden])

  async function cargarArchivo(file: File | undefined) {
    if (!file) return
    setProcesando(true)
    try {
      const paginas = await prepararArchivo(file)
      setCola(paginas)
      setIndice(0)
      setFoto(paginas[0].blob)
      fotoSubida.current = null
      claveIntento.current = crypto.randomUUID()
      if (paginas.length > 1) toast.info(`El PDF tiene ${paginas.length} paginas: cada una es un pedido.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setProcesando(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setArrastrando(false)
    cargarArchivo(e.dataTransfer.files[0])
  }

  function irAPagina(i: number) {
    setIndice(i)
    setFoto(cola[i].blob)
    fotoSubida.current = null
    claveIntento.current = crypto.randomUUID()
    setForm(FORM_VACIO)
    setInvalidos([])
  }

  async function girar() {
    if (!foto) return
    setFoto(await rotar90(foto))
    fotoSubida.current = null
  }

  function quitarFoto() {
    setFoto(null)
    setCola([])
    setIndice(0)
    fotoSubida.current = null
  }

  function limpiarTodo() {
    quitarFoto()
    setForm(FORM_VACIO)
    setInvalidos([])
    claveIntento.current = crypto.randomUUID()
  }

  async function extraer() {
    if (!foto) return
    setExtrayendo(true)
    try {
      const base64 = await blobABase64(foto)
      const { data } = await apiFetch<{ data: Record<string, string> }>('/api/pedidos/extraer', {
        base64,
        mime: 'image/jpeg',
      })
      const texto = (k: string) => (data[k] ?? '').trim()
      const nombre = texto('cliente')
      const q = normalizar(nombre)
      // Solo si hay UN cliente que coincide exacto (razon social o fantasia)
      const coincidencias = q
        ? clientes.filter((c: Cliente) => normalizar(c.razon_social) === q || normalizar(c.nombre_fantasia ?? '') === q)
        : []
      setForm((f) => ({
        ...f,
        cliente: coincidencias.length === 1 ? coincidencias[0] : f.cliente,
        nroOrden: texto('nroOrden') || f.nroOrden,
        marca: sinAcentos(texto('marca')).toUpperCase() || f.marca,
        pares: formatMilesInput(texto('totalPares')) || f.pares,
        precio: formatMilesInput(texto('totalPrecio')) || f.precio,
        obs: sinAcentos(texto('obs')) || f.obs,
      }))
      setInvalidos([])
      if (coincidencias.length === 1) toast.success('Datos cargados. Cliente seleccionado.')
      else toast.success(nombre ? `Datos cargados. Elegi el cliente ("${nombre}") de la lista.` : 'Datos cargados. Elegi el cliente de la lista.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer la imagen.')
    } finally {
      setExtrayendo(false)
    }
  }

  function intentarGuardar() {
    const v = validarPedido(form)
    setInvalidos(v.invalidos)
    if (v.mensaje) return void toast.error(v.mensaje)
    if (!foto) return void toast.error('La foto del pedido es obligatoria.')
    if (existentes.length > 0) return setDuplicados(existentes)
    guardar()
  }

  async function guardar() {
    if (!foto || !usuario || !form.cliente) return
    setDuplicados(null)
    try {
      // 1) Foto. Si ya se subio en un intento anterior del mismo pedido, se reutiliza.
      let path = fotoSubida.current?.blob === foto ? fotoSubida.current.path : null
      if (!path) {
        setGuardando('subiendo')
        path = await conTimeout(subirFotoPedido(foto, usuario.id))
        fotoSubida.current = { blob: foto, path }
      }

      // 2) Fila
      setGuardando('guardando')
      const { error } = await conTimeout(
        supabase.from('pedidos').insert({
          ...aPayload(form),
          imagen_path: path,
          idempotency_key: claveIntento.current,
        }),
      )
      // 23505 sobre la clave de idempotencia: el intento anterior SI llego a guardarse
      if (error && !(error.code === '23505' && /idempotency_key/.test(error.message))) throw error

      toast.success('Pedido guardado')
      recursoPedidos.refetch()
      fotoSubida.current = null
      claveIntento.current = crypto.randomUUID()
      setForm(FORM_VACIO)
      setInvalidos([])

      // Cola de PDF: pasar a la pagina siguiente
      if (cola.length > 1 && indice < cola.length - 1) {
        const sig = indice + 1
        setIndice(sig)
        setFoto(cola[sig].blob)
      } else {
        if (cola.length > 1) toast.success('¡Cola finalizada!')
        quitarFoto()
      }
    } catch (e) {
      if (e instanceof TimeoutGuardado) {
        toast.error('La conexion esta lenta y no se pudo confirmar el guardado. Revisa la lista de pedidos antes de reintentar.', { duration: 8000 })
      } else if (e instanceof Error && !('code' in e)) {
        toast.error(e.message)
      } else {
        toast.error(mensajeDeError(e as { message?: string; code?: string }, 'No se pudo guardar el pedido. Intenta de nuevo.'))
      }
    } finally {
      setGuardando(null)
    }
  }

  const ocupado = guardando !== null || extrayendo || procesando
  const esCola = cola.length > 1

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Foto del pedido" description="JPG, PNG, HEIC o PDF, hasta 20 MB." />
        <CardBody>
          <input
            ref={inputRef}
            type="file"
            accept={ACEPTA_ARCHIVOS}
            hidden
            onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = '' }}
          />
          <input
            ref={galeriaRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = '' }}
          />
          <input
            ref={camaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => { cargarArchivo(e.target.files?.[0]); e.target.value = '' }}
          />

          {!foto ? (
            <div className="space-y-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
              disabled={procesando}
              className={cn(
                'flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40',
                arrastrando && 'border-primary bg-accent/60',
              )}
            >
              {procesando ? (
                <>
                  <Loader2 className="size-7 animate-spin" />
                  Procesando archivo…
                </>
              ) : (
                <>
                  <ImageUp className="size-7" />
                  <span className="font-medium text-foreground">Tocá para elegir un archivo</span>
                  <span className="text-xs">o arrastralo acá</span>
                </>
              )}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" size="lg" disabled={procesando} onClick={() => camaraRef.current?.click()}>
                <Camera /> Cámara
              </Button>
              <Button type="button" variant="outline" size="lg" disabled={procesando} onClick={() => galeriaRef.current?.click()}>
                <Images /> Galería
              </Button>
            </div>
            </div>
          ) : (
            <div className="space-y-3">
              {esCola && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-accent px-3 py-2 text-sm">
                  <span className="font-medium text-accent-foreground">
                    Pedido {indice + 1} de {cola.length}
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={indice === 0 || ocupado} onClick={() => irAPagina(indice - 1)}>← Anterior</Button>
                    <Button size="sm" variant="outline" disabled={indice >= cola.length - 1 || ocupado} onClick={() => irAPagina(indice + 1)}>Siguiente →</Button>
                  </span>
                </div>
              )}

              <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                <button type="button" onClick={() => setVisor(true)} className="block w-full" aria-label="Ampliar foto">
                  {previewUrl && <img src={previewUrl} alt="Foto del pedido" className="aspect-[4/3] w-full cursor-zoom-in object-contain" />}
                </button>
                <div className="absolute right-2 top-2 flex gap-1">
                  <Button size="icon" variant="secondary" className="shadow" onClick={girar} disabled={ocupado} title="Girar 90°">
                    <RotateCcw />
                  </Button>
                  <Button size="icon" variant="secondary" className="shadow" onClick={quitarFoto} disabled={ocupado} title="Quitar foto">
                    <X />
                  </Button>
                </div>
              </div>

              <Button className="w-full" variant="outline" onClick={extraer} disabled={ocupado}>
                {extrayendo ? <><Loader2 className="animate-spin" /> Leyendo la foto…</> : <><Sparkles /> Cargar datos de la foto</>}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Datos del pedido" />
        <CardBody className="space-y-5">
          {cargandoClientes && clientes.length === 0 ? (
            <Cargando texto="Cargando clientes…" className="py-6" />
          ) : (
            <PedidoCampos
              form={form}
              clientes={clientes}
              invalidos={invalidos}
              onCambiar={set}
              avisoOrden={existentes.length > 0 ? `Ya hay ${existentes.length === 1 ? 'un pedido' : `${existentes.length} pedidos`} con este N° de orden.` : undefined}
            />
          )}

          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={intentarGuardar} disabled={ocupado || clientes.length === 0}>
              {guardando === 'subiendo' ? <><Loader2 className="animate-spin" /> Subiendo foto…</> : guardando === 'guardando' ? <><Loader2 className="animate-spin" /> Guardando…</> : 'Guardar pedido'}
            </Button>
            {(foto || form.nroOrden || form.cliente) && (
              <Button size="lg" variant="outline" onClick={limpiarTodo} disabled={ocupado}>Limpiar</Button>
            )}
          </div>
        </CardBody>
      </Card>

      <VisorImagen src={visor ? previewUrl : null} onCerrar={() => setVisor(false)} />

      <ConfirmModal
        abierto={duplicados !== null}
        titulo="N° de orden duplicado"
        textoConfirmar="Guardar igual"
        tono="primary"
        mensaje={
          <div className="space-y-2">
            <p>Ya existe un pedido con el N° de orden <strong>{form.nroOrden}</strong>:</p>
            <ul className="list-disc pl-5">
              {duplicados?.slice(0, 3).map((p) => (
                <li key={p.id}>{p.cliente_nombre ?? 'Sin cliente'} — {formatFechaHora(p.created_at)}</li>
              ))}
            </ul>
            <p>¿Queres guardarlo de todas formas?</p>
          </div>
        }
        onCancelar={() => setDuplicados(null)}
        onConfirmar={guardar}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Lista de pedidos
// ═══════════════════════════════════════════════════════════════════════════

type CampoOrden = 'nro' | 'fecha' | 'cliente' | 'ciudad' | 'marca' | 'usuario' | 'total'

interface Filtros {
  busqueda: string
  clientes: string[]
  marcas: string[]
  usuarios: string[]
  tipos: string[]
  zonas: string[]
  desde: string
  hasta: string
  orden: Orden<CampoOrden>
  pagina: number
  panel: boolean
}

const FILTROS_INICIALES: Filtros = {
  busqueda: '',
  clientes: [],
  marcas: [],
  usuarios: [],
  tipos: [],
  zonas: [],
  desde: '',
  hasta: '',
  orden: { campo: 'fecha', dir: 'desc' },
  pagina: 1,
  panel: false,
}

function valorOrden(p: Pedido, campo: CampoOrden): unknown {
  switch (campo) {
    case 'nro': return p.nro_orden_norm ? Number(p.nro_orden_norm) : null
    case 'fecha': return p.created_at
    case 'cliente': return p.cliente_nombre
    case 'ciudad': return p.ciudad
    case 'marca': return p.marca
    case 'usuario': return autorDe(p)
    case 'total': return p.total_precio
  }
}

function ListaPedidos() {
  const { veTodo } = useAuth()
  const { data, loading, actualizando, error, refetch } = usePedidos()
  const [f, setF] = useEstadoSesion<Filtros>('pedidos.filtros', FILTROS_INICIALES)
  const [abierto, setAbierto] = useState<Pedido | null>(null)

  // Cualquier cambio de filtro vuelve a la primera pagina
  const cambiar = (p: Partial<Filtros>) => setF((s) => ({ ...s, pagina: 1, ...p }))

  // N° de orden repetidos (comparando normalizados: '0011504' == '11.504')
  const repetidos = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const p of data) if (p.nro_orden_norm) cuenta.set(p.nro_orden_norm, (cuenta.get(p.nro_orden_norm) ?? 0) + 1)
    return new Set([...cuenta].filter(([, n]) => n > 1).map(([k]) => k))
  }, [data])

  const opciones = useMemo(
    () => ({
      clientes: opcionesDe(data, (p) => p.cliente_nombre),
      marcas: opcionesDe(data, (p) => p.marca),
      usuarios: opcionesDe(data, (p) => autorDe(p)),
      zonas: opcionesDe(data, (p) => p.zona),
    }),
    [data],
  )

  const filtrados = useMemo(() => {
    const q = normalizar(f.busqueda)
    const pasa = data.filter((p) => {
      if (q) {
        const texto = [p.cliente_nombre, p.nro_orden, p.nro_pedido, p.marca, p.ciudad, p.ruc, autorDe(p), p.cliente_codigo].join(' ')
        if (!normalizar(texto).includes(q)) return false
      }
      if (f.clientes.length && !f.clientes.includes(p.cliente_nombre ?? '')) return false
      if (f.marcas.length && !f.marcas.includes(p.marca ?? '')) return false
      if (f.usuarios.length && !f.usuarios.includes(autorDe(p))) return false
      if (f.tipos.length && !f.tipos.includes(p.tipo ?? '')) return false
      if (f.zonas.length && !f.zonas.includes(p.zona ?? '')) return false
      const dia = diaLocal(p.created_at)
      if (f.desde && dia < f.desde) return false
      if (f.hasta && dia > f.hasta) return false
      return true
    })
    return ordenar(pasa, f.orden, valorOrden)
  }, [data, f])

  const totalPares = filtrados.reduce((s, p) => s + (p.total_pares ?? 0), 0)
  const totalPrecio = filtrados.reduce((s, p) => s + (p.total_precio ?? 0), 0)
  const duplicadosVisibles = useMemo(
    () => new Set(filtrados.filter((p) => p.nro_orden_norm && repetidos.has(p.nro_orden_norm)).map((p) => p.nro_orden_norm)).size,
    [filtrados, repetidos],
  )

  const paginas = Math.max(1, Math.ceil(filtrados.length / TAMANO_PAGINA))
  const pagina = Math.min(f.pagina, paginas)
  const visibles = filtrados.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA)

  const nFiltros =
    f.clientes.length + f.marcas.length + f.usuarios.length + f.tipos.length + f.zonas.length + (f.desde ? 1 : 0) + (f.hasta ? 1 : 0)

  // Aviso de duplicados al cargar la lista (una sola vez por carga)
  const avisado = useRef(false)
  useEffect(() => {
    if (avisado.current || loading || repetidos.size === 0) return
    avisado.current = true
    toast.warning(`Hay ${repetidos.size} N° de orden repetidos.`)
  }, [loading, repetidos])

  function exportar() {
    const cabecera = ['Fecha Carga', 'N° Orden', 'Codigo Cliente', 'Cliente', 'RUC', 'N° Pedido', 'Entrega', 'Direccion', 'Ciudad', 'Zona', 'Forma Pago', 'Tipo', 'Marca', 'Total Pares', 'Total Precio', 'OBS', 'Usuario']
    const filas = filtrados.map((p) => [
      formatFechaHora(p.created_at), p.nro_orden, p.cliente_codigo, p.cliente_nombre, p.ruc, p.nro_pedido, p.entrega,
      p.direccion, p.ciudad, p.zona, p.forma_pago, p.tipo, p.marca, p.total_pares, p.total_precio, p.obs, autorDe(p),
    ])
    descargarCSV(`pedidos_${marcaDeTiempo()}.csv`, [cabecera, ...filas])
  }

  const th = { orden: f.orden, onOrdenar: (orden: Orden<CampoOrden>) => cambiar({ orden }) }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Buscador valor={f.busqueda} onCambiar={(busqueda) => cambiar({ busqueda })} placeholder="Buscar cliente, N° orden, marca…" className="w-full sm:max-w-sm" />
        <Button variant="outline" onClick={() => cambiar({ panel: !f.panel })} className="relative">
          <ListFilter /> Filtros
          {nFiltros > 0 && <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{nFiltros}</span>}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportar} disabled={filtrados.length === 0}><Download /> Excel</Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={actualizando} title="Actualizar" aria-label="Actualizar">
            <RefreshCw className={cn(actualizando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {f.panel && (
        <Card className="mb-4">
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MultiSelect label="Cliente" opciones={opciones.clientes} seleccion={f.clientes} onCambiar={(clientes) => cambiar({ clientes })} />
            <MultiSelect label="Marca" opciones={opciones.marcas} seleccion={f.marcas} onCambiar={(marcas) => cambiar({ marcas })} />
            {veTodo && <MultiSelect label="Usuario" opciones={opciones.usuarios} seleccion={f.usuarios} onCambiar={(usuarios) => cambiar({ usuarios })} />}
            <MultiSelect label="Tipo" opciones={[...TIPOS_PEDIDO]} seleccion={f.tipos} onCambiar={(tipos) => cambiar({ tipos })} />
            <MultiSelect label="Zona" opciones={opciones.zonas} seleccion={f.zonas} onCambiar={(zonas) => cambiar({ zonas })} />
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Desde</p>
              <Input type="date" value={f.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Hasta</p>
              <Input type="date" value={f.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => cambiar({ clientes: [], marcas: [], usuarios: [], tipos: [], zonas: [], desde: '', hasta: '' })} disabled={nFiltros === 0}>
                Limpiar filtros
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi titulo="Pedidos (filtrados)" valor={formatMiles(filtrados.length)} />
        <Kpi titulo="Total pares" valor={formatMiles(totalPares)} />
        <Kpi titulo="Suma total precio" valor={formatGs(totalPrecio)} />
      </div>
      {duplicadosVisibles > 0 && (
        <div className="mb-4">
          <Kpi tono="warning" titulo="N° de orden duplicados" valor={duplicadosVisibles} detalle="Estan marcados con ⚠ en la tabla." />
        </div>
      )}

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtrados.length === 0 ? (
        <Vacio icono={ClipboardList} titulo={data.length === 0 ? 'Todavia no hay pedidos' : 'Sin resultados'} descripcion={data.length === 0 ? undefined : 'Proba con otros filtros.'} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <Th campo="nro" {...th}>N° Orden</Th>
                  <Th campo="fecha" {...th} className="hidden sm:table-cell">Fecha carga</Th>
                  <Th campo="cliente" {...th}>Cliente</Th>
                  <Th campo="ciudad" {...th} className="hidden lg:table-cell">Ciudad</Th>
                  <Th campo="marca" {...th} className="hidden md:table-cell">Marca</Th>
                  <Th campo="usuario" {...th} className="hidden md:table-cell">Usuario</Th>
                  <Th campo="total" {...th} className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} onClick={() => setAbierto(p)} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="tabular whitespace-nowrap px-3 py-2.5 font-medium">
                      {p.nro_orden_norm && repetidos.has(p.nro_orden_norm) && <AlertTriangle className="mr-1 inline size-3.5 text-warning" aria-label="N° de orden repetido" />}
                      {p.nro_orden}
                    </td>
                    <td className="tabular hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground sm:table-cell">{formatFechaHora(p.created_at)}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2.5">{p.cliente_nombre}</td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground lg:table-cell">{p.ciudad}</td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{p.marca}</td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{autorDe(p)}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{formatGs(p.total_precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} total={filtrados.length} onCambiar={(n) => setF((s) => ({ ...s, pagina: n }))} />
        </div>
      )}

      <PedidoDetalleModal pedido={abierto} lista={filtrados} onCambiar={setAbierto} onCerrar={() => setAbierto(null)} />
    </div>
  )
}

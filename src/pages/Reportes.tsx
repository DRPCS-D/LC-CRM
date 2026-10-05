import { Download, FileDown, Printer, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Field, Input, Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Kpi } from '@/components/ui/tabla'
import { useAuth } from '@/hooks/useAuth'
import { usePedidos } from '@/hooks/useDatos'
import { TIPOS_PEDIDO } from '@/lib/database.types'
import { descargarCSV } from '@/lib/exportar'
import { formatCompacto, formatFechaHora, formatGs, formatMiles, hoyLocal, marcaDeTiempo } from '@/lib/format'
import { escaparHtml } from '@/lib/html'
import {
  filtrarPedidos,
  ranking,
  serieMensual,
  TOP,
  totales,
  type Dimension,
  type Fila,
  type PuntoMes,
} from '@/lib/reportes'
import { BarChart3 } from 'lucide-react'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const PALETA = ['#8A1B1A', '#c79b9a', '#d4a574', '#7b9e7e', '#6a8caf', '#a47ba3']

const SECCIONES: { dim: Dimension; titulo: string }[] = [
  { dim: 'cliente', titulo: 'Clientes' },
  { dim: 'vendedor', titulo: 'Vendedores' },
  { dim: 'marca', titulo: 'Marcas' },
  { dim: 'ciudad', titulo: 'Ciudad' },
  { dim: 'zona', titulo: 'Zona' },
]

/** Reportes para admin y supervisor. Todo se calcula en el navegador a partir de los pedidos. */
export default function Reportes() {
  const { usuario } = useAuth()
  const { data, loading, actualizando, error, refetch } = usePedidos()
  const [desde, setDesde] = useState(`${hoyLocal().slice(0, 4)}-01-01`)
  const [hasta, setHasta] = useState(hoyLocal())
  const [tipo, setTipo] = useState('')
  const [exportar, setExportar] = useState(false)

  const filtrados = useMemo(() => filtrarPedidos(data, { desde, hasta, tipo }), [data, desde, hasta, tipo])
  const tot = useMemo(() => totales(filtrados), [filtrados])
  const serie = useMemo(() => serieMensual(filtrados), [filtrados])
  const rankings = useMemo(
    () => Object.fromEntries(SECCIONES.map((s) => [s.dim, ranking(filtrados, s.dim)])) as Record<Dimension, Fila[]>,
    [filtrados],
  )

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-foreground">Reportes</h1>
          <p className="text-sm text-muted-foreground">Ventas según los pedidos cargados.</p>
        </div>
        <Field label="Desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field>
        <Field label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {TIPOS_PEDIDO.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={actualizando} aria-label="Actualizar" title="Actualizar">
          <RefreshCw className={actualizando ? 'animate-spin' : ''} />
        </Button>
        <Button onClick={() => setExportar(true)} disabled={filtrados.length === 0}><Download /> Exportar</Button>
      </div>

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtrados.length === 0 ? (
        <Vacio icono={BarChart3} titulo="Sin pedidos en el período" descripcion="Probá con otras fechas u otro tipo." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Pedidos del período" valor={formatMiles(tot.pedidos)} />
            <Kpi titulo="Total pares" valor={formatMiles(tot.pares)} />
            <Kpi titulo="Suma total precio" valor={formatGs(tot.monto)} />
            <Kpi titulo="Ticket promedio" valor={formatGs(tot.ticket)} />
          </div>

          <Card>
            <CardHeader title="Evolución mensual" description="Barras: monto. Línea: cantidad de pedidos." />
            <CardBody><GraficoMensual serie={serie} /></CardBody>
          </Card>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            {SECCIONES.map(({ dim, titulo }) => (
              <Card key={dim}>
                <CardHeader title={`Top ${TOP} · ${titulo}`} />
                <CardBody><BarrasTop filas={rankings[dim].slice(0, TOP)} /></CardBody>
              </Card>
            ))}
            <Card>
              <CardHeader title="Vendedores (por monto)" />
              <CardBody><Dona filas={rankings.vendedor} /></CardBody>
            </Card>
          </div>
        </div>
      )}

      <ExportarModal
        abierto={exportar}
        onCerrar={() => setExportar(false)}
        pedidos={filtrados}
        periodo={{ desde, hasta, tipo }}
        generadoPor={usuario?.username ?? ''}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Graficos (SVG a mano: son tres y una libreria pesaria mas que ellos)
// ─────────────────────────────────────────────────────────────

function etiquetaMes(mes: string, variosAnios: boolean): string {
  const [a, m] = mes.split('-')
  return `${MESES[Number(m) - 1]}${variosAnios ? ` '${a.slice(2)}` : ''}`
}

function GraficoMensual({ serie }: { serie: PuntoMes[] }) {
  const variosAnios = new Set(serie.map((s) => s.mes.slice(0, 4))).size > 1
  const ANCHO_COL = 56
  const ALTO = 240
  const M = { t: 16, r: 44, b: 30, l: 64 }
  const ancho = Math.max(560, serie.length * ANCHO_COL + M.l + M.r)
  const areaW = ancho - M.l - M.r
  const areaH = ALTO - M.t - M.b
  const maxMonto = Math.max(1, ...serie.map((s) => s.monto))
  const maxCant = Math.max(1, ...serie.map((s) => s.cantidad))
  const paso = areaW / serie.length
  const x = (i: number) => M.l + paso * i + paso / 2
  const yMonto = (v: number) => M.t + areaH - (v / maxMonto) * areaH
  const yCant = (v: number) => M.t + areaH - (v / maxCant) * areaH
  const linea = serie.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yCant(s.cantidad)}`).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ancho} ${ALTO}`} style={{ width: ancho, minWidth: '100%' }} role="img" aria-label="Evolución mensual de pedidos">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={M.l} x2={ancho - M.r} y1={M.t + areaH * (1 - t)} y2={M.t + areaH * (1 - t)} stroke="currentColor" strokeOpacity={0.1} />
            <text x={M.l - 6} y={M.t + areaH * (1 - t) + 3} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.6}>{formatCompacto(maxMonto * t)}</text>
            <text x={ancho - M.r + 6} y={M.t + areaH * (1 - t) + 3} fontSize={10} fill="currentColor" opacity={0.6}>{Math.round(maxCant * t)}</text>
          </g>
        ))}
        {serie.map((s, i) => (
          <g key={s.mes}>
            <rect x={x(i) - paso * 0.3} y={yMonto(s.monto)} width={paso * 0.6} height={M.t + areaH - yMonto(s.monto)} rx={3} fill={PALETA[0]} opacity={0.85}>
              <title>{`${etiquetaMes(s.mes, true)}: ${formatGs(s.monto)} · ${s.cantidad} pedidos`}</title>
            </rect>
            <text x={x(i)} y={ALTO - 10} textAnchor="middle" fontSize={10.5} fill="currentColor" opacity={0.7}>{etiquetaMes(s.mes, variosAnios)}</text>
          </g>
        ))}
        <path d={linea} fill="none" stroke={PALETA[4]} strokeWidth={2} />
        {serie.map((s, i) => <circle key={s.mes} cx={x(i)} cy={yCant(s.cantidad)} r={3.5} fill={PALETA[4]} stroke="var(--card)" strokeWidth={1.5} />)}
      </svg>
    </div>
  )
}

function BarrasTop({ filas }: { filas: Fila[] }) {
  const max = Math.max(1, ...filas.map((f) => f.monto))
  return (
    <ol className="space-y-2.5">
      {filas.map((f, i) => (
        <li key={f.nombre}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate"><span className="tabular mr-1.5 text-xs text-muted-foreground">{i + 1}</span>{f.nombre}</span>
            <span className="tabular shrink-0 text-xs text-muted-foreground">{formatGs(f.monto)} · {formatMiles(f.pares)} pares</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(f.monto / max) * 100}%`, background: PALETA[0] }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function Dona({ filas }: { filas: Fila[] }) {
  const total = filas.reduce((s, f) => s + f.monto, 0) || 1
  const R = 60
  const C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="size-40 shrink-0 -rotate-90" role="img" aria-label="Reparto por vendedor">
        {filas.map((f, i) => {
          const largo = (f.monto / total) * C
          const el = (
            <circle key={f.nombre} cx={80} cy={80} r={R} fill="none" stroke={PALETA[i % PALETA.length]} strokeWidth={26} strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acumulado}>
              <title>{`${f.nombre}: ${formatGs(f.monto)}`}</title>
            </circle>
          )
          acumulado += largo
          return el
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {filas.map((f, i) => (
          <li key={f.nombre} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />
            <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
            <span className="tabular text-xs text-muted-foreground">{((f.monto / total) * 100).toFixed(1)}% · {f.pedidos}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Exportar
// ─────────────────────────────────────────────────────────────

function ExportarModal({
  abierto,
  onCerrar,
  pedidos,
  periodo,
  generadoPor,
}: {
  abierto: boolean
  onCerrar: () => void
  pedidos: Parameters<typeof ranking>[0]
  periodo: { desde: string; hasta: string; tipo: string }
  generadoPor: string
}) {
  const [elegidas, setElegidas] = useState<Dimension[]>(SECCIONES.map((s) => s.dim))
  const [desglose, setDesglose] = useState(false)

  const alternar = (d: Dimension) => setElegidas((e) => (e.includes(d) ? e.filter((x) => x !== d) : [...e, d]))
  const secciones = SECCIONES.filter((s) => elegidas.includes(s.dim))
  const tot = totales(pedidos)
  const rangoTexto = `${periodo.desde || 'inicio'} a ${periodo.hasta || 'hoy'}`

  function csv() {
    const filas: (string | number)[][] = [
      ['LA COSTA S.R.L. · Reporte'],
      ['Período', rangoTexto],
      ['Tipo', periodo.tipo || 'Todos'],
      ['Generado por', generadoPor],
      ['Fecha', formatFechaHora(new Date().toISOString())],
      [],
      ['Pedidos', tot.pedidos], ['Total pares', tot.pares], ['Suma total precio', tot.monto], ['Ticket promedio', tot.ticket],
    ]
    for (const { dim, titulo } of secciones) {
      const r = ranking(pedidos, dim, desglose)
      filas.push([], [titulo], ['#', 'Nombre', 'Pedidos', 'Pares', 'Monto (Gs)', '%'])
      r.forEach((f, i) => {
        filas.push([i + 1, f.nombre, f.pedidos, f.pares, f.monto, ((f.monto / (tot.monto || 1)) * 100).toFixed(1)])
        for (const d of f.detalle ?? []) filas.push(['', `   ${d.nombre}`, d.pedidos, d.pares, d.monto, ((d.monto / (f.monto || 1)) * 100).toFixed(1)])
      })
    }
    descargarCSV(`reporte_${marcaDeTiempo()}.csv`, filas)
  }

  function imprimir() {
    const area = document.getElementById('area-impresion')
    if (!area) return
    const tabla = (titulo: string, filas: Fila[]) => `
      <h3 style="margin:14px 0 4px;font-size:13px;color:#8A1B1A">${escaparHtml(titulo)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#8A1B1A;color:#fff">
          <th style="text-align:left;padding:3px 5px">#</th><th style="text-align:left;padding:3px 5px">Nombre</th>
          <th style="text-align:right;padding:3px 5px">Pedidos</th><th style="text-align:right;padding:3px 5px">Pares</th>
          <th style="text-align:right;padding:3px 5px">Monto (Gs)</th><th style="text-align:right;padding:3px 5px">%</th></tr></thead>
        <tbody>${filas.map((f, i) => `
          <tr style="border-bottom:1px solid #ddd;break-inside:avoid"><td style="padding:3px 5px">${i + 1}</td><td style="padding:3px 5px">${escaparHtml(f.nombre)}</td>
            <td style="text-align:right;padding:3px 5px">${formatMiles(f.pedidos)}</td><td style="text-align:right;padding:3px 5px">${formatMiles(f.pares)}</td>
            <td style="text-align:right;padding:3px 5px">${formatMiles(f.monto)}</td><td style="text-align:right;padding:3px 5px">${((f.monto / (tot.monto || 1)) * 100).toFixed(1)}</td></tr>
          ${(f.detalle ?? []).map((d) => `<tr style="color:#555;break-inside:avoid"><td></td><td style="padding:2px 5px 2px 18px">${escaparHtml(d.nombre)}</td>
            <td style="text-align:right;padding:2px 5px">${formatMiles(d.pedidos)}</td><td style="text-align:right;padding:2px 5px">${formatMiles(d.pares)}</td>
            <td style="text-align:right;padding:2px 5px">${formatMiles(d.monto)}</td><td style="text-align:right;padding:2px 5px">${((d.monto / (f.monto || 1)) * 100).toFixed(1)}</td></tr>`).join('')}`).join('')}
        </tbody></table>`
    area.innerHTML = `
      <h1 style="font-size:16px;color:#8A1B1A;margin:0 0 4px">LA COSTA S.R.L. · Reporte</h1>
      <p style="margin:0;color:#555">Periodo: ${escaparHtml(rangoTexto)} · Tipo: ${escaparHtml(periodo.tipo || 'Todos')} · Generado por ${escaparHtml(generadoPor)} el ${escaparHtml(formatFechaHora(new Date().toISOString()))}</p>
      <p style="margin:10px 0"><strong>${formatMiles(tot.pedidos)}</strong> pedidos · <strong>${formatMiles(tot.pares)}</strong> pares · <strong>${formatGs(tot.monto)}</strong> · ticket promedio <strong>${formatGs(tot.ticket)}</strong></p>
      ${secciones.map(({ dim, titulo }) => tabla(titulo, ranking(pedidos, dim, desglose))).join('')}`
    window.print()
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Exportar reporte"
      descripcion="Incluye la lista completa de cada sección, no solo el top 10."
      onCerrar={onCerrar}
      ancho="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={csv} disabled={secciones.length === 0}><FileDown /> CSV</Button>
          <Button onClick={imprimir} disabled={secciones.length === 0}><Printer /> PDF</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Secciones</p>
            <Button variant="ghost" size="sm" onClick={() => setElegidas(SECCIONES.map((s) => s.dim))}>Todo</Button>
          </div>
          <div className="space-y-2">
            {SECCIONES.map(({ dim, titulo }) => (
              <label key={dim} className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={elegidas.includes(dim)} onChange={() => alternar(dim)} />
                {titulo}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={desglose} onChange={(e) => setDesglose(e.target.checked)} />
          <span>Desglose <span className="block text-xs text-muted-foreground">Por marca bajo cada fila (en Marcas, por vendedor).</span></span>
        </label>
      </div>
    </Modal>
  )
}

import { BarChart3, FileText, Map, MapPin, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Kpi } from '@/components/ui/tabla'
import { useAuth } from '@/hooks/useAuth'
import { useInformes, usePedidos } from '@/hooks/useDatos'
import { diaLocal, formatGs, formatMiles, hoyLocal } from '@/lib/format'

interface Modulo {
  to: string
  titulo: string
  icono: ComponentType<{ className?: string }>
  /** Solo admin y supervisor. */
  veTodo?: boolean
  /** Oculto para el cobrador. */
  sinCobrador?: boolean
}

/**
 * Portada: un acceso por seccion, solo con icono y titulo (como la app
 * anterior). Es la unica puerta a Clientes, Mapa, Usuarios y Reportes en el
 * celular: la barra de abajo lleva solo Inicio, Pedidos e Informes. Las
 * secciones nuevas se agregan aca, y en el NAV de AppLayout para la barra de
 * arriba de la version de escritorio.
 */
const MODULOS: Modulo[] = [
  { to: '/pedidos', titulo: 'Pedidos', icono: FileText, sinCobrador: true },
  { to: '/informes', titulo: 'Informes', icono: MapPin },
  { to: '/clientes', titulo: 'Clientes', icono: User },
  { to: '/clientes/mapa', titulo: 'Mapa de clientes', icono: Map },
  { to: '/usuarios', titulo: 'Usuarios', icono: Users, veTodo: true },
  { to: '/reportes', titulo: 'Reportes', icono: BarChart3, veTodo: true },
]

/**
 * Los numeros de hoy. Cada quien ve los suyos (la RLS ya filtra); admin y
 * supervisor ven los de todo el equipo. Usa las mismas tablas en memoria que
 * las listas, asi que al entrar a Pedidos o Informes ya estan cargadas.
 */
function ResumenHoy({ conPedidos, equipo }: { conPedidos: boolean; equipo: boolean }) {
  const hoy = hoyLocal()
  const { data: informes } = useInformes()
  const visitasHoy = informes.filter((i) => diaLocal(i.created_at) === hoy).length
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">{equipo ? 'Hoy · todo el equipo' : 'Hoy'}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {conPedidos && <PedidosHoy hoy={hoy} />}
        <Kpi titulo="Visitas" valor={formatMiles(visitasHoy)} className="col-span-2 lg:col-span-1" />
      </div>
    </section>
  )
}

function PedidosHoy({ hoy }: { hoy: string }) {
  const { data: pedidos } = usePedidos()
  const deHoy = pedidos.filter((p) => diaLocal(p.created_at) === hoy)
  const pares = deHoy.reduce((s, p) => s + (p.total_pares ?? 0), 0)
  const total = deHoy.reduce((s, p) => s + (p.total_precio ?? 0), 0)
  return (
    <>
      <Kpi titulo="Pedidos" valor={formatMiles(deHoy.length)} />
      <Kpi titulo="Pares" valor={formatMiles(pares)} />
      <Kpi titulo="Total vendido" valor={formatGs(total)} className="col-span-2 lg:col-span-1" />
    </>
  )
}

export default function Inicio() {
  const { usuario, veTodo, esCobrador } = useAuth()

  const modulos = MODULOS.filter((m) => (!m.veTodo || veTodo) && !(esCobrador && m.sinCobrador))
  const primerNombre = usuario?.nombre?.split(' ')[0] ?? usuario?.username ?? ''

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">
          Hola{primerNombre ? `, ${primerNombre}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">¿Qué querés hacer?</p>
      </div>

      <ResumenHoy conPedidos={!esCobrador} equipo={veTodo} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {modulos.map(({ to, titulo, icono: Icono }) => (
          <Link
            key={to}
            to={to}
            className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-2 py-5 text-center shadow-xs transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-6"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icono className="size-5" />
            </span>
            <h2 className="text-[13px] font-semibold leading-tight text-foreground">{titulo}</h2>
          </Link>
        ))}
      </div>
    </div>
  )
}

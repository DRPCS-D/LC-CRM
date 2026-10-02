import { BarChart3, FileText, Map, MapPin, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

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

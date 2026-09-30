import { BarChart3, ClipboardList, MapPinned, Store, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ROL_LABEL } from '@/lib/database.types'

interface Modulo {
  to: string
  titulo: string
  descripcion: string
  icono: ComponentType<{ className?: string }>
  /** Solo admin y supervisor. */
  veTodo?: boolean
}

/**
 * Portada: el indice de lo que hay disponible segun el rol de quien entra.
 * Una app construida sobre esta base agrega sus modulos a esta lista (y el
 * link correspondiente al NAV de AppLayout).
 */
const MODULOS: Modulo[] = [
  {
    to: '/pedidos',
    titulo: 'Pedidos',
    descripcion: 'Cargar un pedido desde la foto y consultar los ya guardados.',
    icono: ClipboardList,
  },
  {
    to: '/informes',
    titulo: 'Informes',
    descripcion: 'Registrar visitas a clientes con su ubicacion y verlas en el mapa.',
    icono: MapPinned,
  },
  {
    to: '/clientes',
    titulo: 'Clientes',
    descripcion: 'Listado de clientes, su historial de compras y su ubicacion.',
    icono: Store,
  },
  {
    to: '/reportes',
    titulo: 'Reportes',
    descripcion: 'Totales, evolucion mensual y rankings de ventas.',
    icono: BarChart3,
    veTodo: true,
  },
  {
    to: '/usuarios',
    titulo: 'Usuarios',
    descripcion: 'Altas, roles y acceso de las personas del sistema.',
    icono: Users,
    veTodo: true,
  },
]

export default function Inicio() {
  const { usuario, rol, veTodo } = useAuth()

  const modulos = MODULOS.filter((m) => !m.veTodo || veTodo)
  const primerNombre = usuario?.nombre?.split(' ')[0] ?? usuario?.username ?? ''

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-foreground">
          Hola{primerNombre ? `, ${primerNombre}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ¿Que queres hacer?
          {rol && <> · {ROL_LABEL[rol]}</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map(({ to, titulo, descripcion, icono: Icono }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-lg border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mb-3 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icono className="size-4.5" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descripcion}</p>
          </Link>
        ))}
      </div>

      {modulos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavia no hay modulos disponibles para tu cuenta.
        </p>
      )}
    </div>
  )
}

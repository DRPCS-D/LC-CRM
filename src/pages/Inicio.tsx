import { Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ROL_LABEL } from '@/lib/database.types'

interface Modulo {
  to: string
  titulo: string
  descripcion: string
  icono: ComponentType<{ className?: string }>
  soloAdmin?: boolean
}

/**
 * Portada: el indice de lo que hay disponible segun el rol de quien entra.
 * Una app construida sobre esta base agrega sus modulos a esta lista (y el
 * link correspondiente al NAV de AppLayout).
 */
const MODULOS: Modulo[] = [
  {
    to: '/usuarios',
    titulo: 'Usuarios',
    descripcion: 'Altas, roles y acceso de las personas del sistema.',
    icono: Users,
    soloAdmin: true,
  },
]

export default function Inicio() {
  const { usuario, rol, esAdmin } = useAuth()

  const modulos = MODULOS.filter((m) => !m.soloAdmin || esAdmin)
  const primerNombre = usuario?.nombre?.split(' ')[0] ?? ''

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-foreground">
          Hola{primerNombre ? `, ${primerNombre}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {usuario?.email}
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

import { KeyRound, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { CambiarMiPasswordModal } from '@/components/cuenta/CambiarMiPasswordModal'
import { Button } from '@/components/ui/button'
import { Cargando } from '@/components/ui/estado'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useAuth } from '@/hooks/useAuth'
import { APP_NOMBRE } from '@/lib/app'
import { ROL_LABEL } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/**
 * Los links de la barra. Una app hecha sobre esta base agrega los suyos aca
 * (y la ruta correspondiente en App.tsx): `soloAdmin` decide si aparece,
 * pero quien protege los datos es la RLS, no esta lista.
 */
const NAV = [
  { to: '/', label: 'Inicio', end: true, soloAdmin: false },
  { to: '/usuarios', label: 'Usuarios', end: false, soloAdmin: true },
]

const MENSAJE_PROBLEMA = {
  inactivo: {
    titulo: 'Cuenta desactivada',
    texto: 'Tu usuario fue desactivado. Contactate con el administrador del sistema.',
  },
  'sin-perfil': {
    titulo: 'Cuenta sin configurar',
    texto: 'Tu usuario existe pero todavia no esta dado de alta. Contactate con el administrador del sistema.',
  },
} as const

export default function AppLayout() {
  const { user, usuario, rol, esAdmin, loading, problemaPerfil, signOut } = useAuth()
  const navigate = useNavigate()
  const [modalPassword, setModalPassword] = useState(false)

  const links = NAV.filter((item) => !item.soloAdmin || esAdmin)

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
  }, [user, loading, navigate])

  if (loading) return <Cargando className="min-h-screen" texto="Cargando tu cuenta…" />
  if (!user) return null

  // Sesion valida pero algo impide usar la app: sin esto la pantalla queda
  // en blanco y no hay forma de entender por que.
  if (problemaPerfil) {
    const { titulo, texto } = MENSAJE_PROBLEMA[problemaPerfil]
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-xs">
          <h1 className="text-sm font-semibold text-foreground">{titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
          <Button variant="outline" className="mt-5" onClick={signOut}>
            <LogOut /> Cerrar sesion
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2">
            <img src="/logo.svg" alt="" className="size-7 shrink-0 rounded-md" />
            <span className="truncate text-sm font-semibold text-foreground">{APP_NOMBRE}</span>
          </span>

          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-foreground">{usuario?.nombre}</p>
              <p className="text-[11px] text-muted-foreground">
                {rol ? ROL_LABEL[rol] : usuario?.email}
              </p>
            </div>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setModalPassword(true)} title="Cambiar mi contrasena">
              <KeyRound />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesion">
              <LogOut />
            </Button>
          </div>
        </div>

        {/* Navegacion en mobile: la fila de arriba se queda sin lugar */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-4 py-1.5 sm:hidden">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-sm',
                  isActive
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <CambiarMiPasswordModal abierto={modalPassword} onCerrar={() => setModalPassword(false)} />
    </div>
  )
}

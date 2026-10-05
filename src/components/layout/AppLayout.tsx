import {
  BarChart3,
  ClipboardList,
  House,
  KeyRound,
  LogOut,
  MapPinned,
  Store,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CambiarMiPasswordModal } from '@/components/cuenta/CambiarMiPasswordModal'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Cargando } from '@/components/ui/estado'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useAuth } from '@/hooks/useAuth'
import { APP_NOMBRE } from '@/lib/app'
import { ROL_LABEL } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/**
 * Los links de la barra de arriba (escritorio). `veTodo` decide si aparece
 * para admin/supervisor solamente, pero quien protege los datos es la RLS, no
 * esta lista. En el celular la barra de abajo lleva solo los `abajo`: el resto
 * de las secciones se alcanza desde las tarjetas de Inicio.
 */
const NAV = [
  { to: '/', abajo: true, label: 'Inicio', end: true, veTodo: false, sinCobrador: false, icono: House },
  { to: '/pedidos', abajo: true, label: 'Pedidos', end: false, veTodo: false, sinCobrador: true, icono: ClipboardList },
  { to: '/informes', abajo: true, label: 'Informes', end: false, veTodo: false, sinCobrador: false, icono: MapPinned },
  { to: '/clientes', abajo: false, label: 'Clientes', end: false, veTodo: false, sinCobrador: false, icono: Store },
  { to: '/reportes', abajo: false, label: 'Reportes', end: false, veTodo: true, sinCobrador: false, icono: BarChart3 },
  { to: '/usuarios', abajo: false, label: 'Usuarios', end: false, veTodo: true, sinCobrador: false, icono: Users },
]

const MENSAJE_PROBLEMA = {
  inactivo: {
    titulo: 'Cuenta desactivada',
    texto: 'Tu usuario fue desactivado. Contactate con el administrador del sistema.',
  },
  'sin-perfil': {
    titulo: 'Cuenta sin configurar',
    texto: 'Tu usuario existe pero todavía no está dado de alta. Contactate con el administrador del sistema.',
  },
} as const

export default function AppLayout() {
  const { user, usuario, rol, veTodo, esCobrador, loading, problemaPerfil, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [modalPassword, setModalPassword] = useState(false)

  const links = NAV.filter((item) => (!item.veTodo || veTodo) && !(esCobrador && item.sinCobrador))

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

          <nav className="ml-2 hidden items-center gap-1 md:flex">
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
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium text-foreground">{usuario?.username}</p>
              <p className="text-[11px] text-muted-foreground">{rol ? ROL_LABEL[rol] : ''}</p>
            </div>
            {usuario && (
              <Avatar nombre={usuario.username} fotoPath={usuario.foto_path} className="hidden sm:inline-flex" />
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setModalPassword(true)} title="Cambiar mi contraseña">
              <KeyRound />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión">
              <LogOut />
            </Button>
          </div>
        </div>

      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 sm:px-6 md:pb-10 md:pt-8">
        <ErrorBoundary key={pathname.split('/')[1]}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Navegacion en mobile: barra fija abajo, al alcance del pulgar */}
      <nav
        id="nav-inferior"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {links.filter((item) => item.abajo).map(({ to, label, end, icono: Icono }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px]',
                isActive ? 'font-medium text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icono className="size-5" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <CambiarMiPasswordModal abierto={modalPassword} onCerrar={() => setModalPassword(false)} />
    </div>
  )
}

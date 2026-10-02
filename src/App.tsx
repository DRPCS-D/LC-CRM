import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RequiereNoCobrador from '@/components/layout/RequiereNoCobrador'
import RequiereVeTodo from '@/components/layout/RequiereVeTodo'
import { Cargando } from '@/components/ui/estado'
import Clientes from '@/pages/Clientes'
import Informes from '@/pages/Informes'
import Inicio from '@/pages/Inicio'
import Login from '@/pages/Login'
import NoEncontrado from '@/pages/NoEncontrado'
import Pedidos from '@/pages/Pedidos'
import Usuarios from '@/pages/Usuarios'

// Reportes arrastra graficos y librerias de exportacion, y lo usan pocas
// personas: se carga recien al entrar, para no penalizar el login.
const Reportes = lazy(() => import('@/pages/Reportes'))

/**
 * Dos zonas:
 *   /login   — publica
 *   /        — la app, dentro de AppLayout (exige sesion activa)
 *
 * Las secciones con sub-pestanas (Pedidos, Informes, Clientes) resuelven su
 * propia sub-ruta adentro (`/pedidos/*`), por eso el `/*`.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route element={<RequiereNoCobrador />}>
          <Route path="pedidos/*" element={<Pedidos />} />
        </Route>
        <Route path="clientes/*" element={<Clientes />} />
        <Route path="informes/*" element={<Informes />} />
        <Route element={<RequiereVeTodo />}>
          <Route
            path="reportes"
            element={
              <Suspense fallback={<Cargando />}>
                <Reportes />
              </Suspense>
            }
          />
          <Route path="usuarios" element={<Usuarios />} />
        </Route>
      </Route>

      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  )
}

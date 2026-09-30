import { Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RequiereAdmin from '@/components/layout/RequiereAdmin'
import Inicio from '@/pages/Inicio'
import Login from '@/pages/Login'
import NoEncontrado from '@/pages/NoEncontrado'
import Usuarios from '@/pages/Usuarios'

/**
 * Dos zonas:
 *   /login   — publica
 *   /        — la app, dentro de AppLayout (exige sesion activa)
 *
 * Las pantallas de una app construida sobre esta base se agregan como rutas
 * hijas de AppLayout. Las que sean solo para administradores van dentro de
 * <RequiereAdmin>, igual que /usuarios.
 *
 * Si alguna pantalla pesa mucho (un visor de PDF, un editor), conviene
 * cargarla con React.lazy + <Suspense> para no penalizar el login.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route element={<RequiereAdmin />}>
          <Route path="usuarios" element={<Usuarios />} />
        </Route>
      </Route>

      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  )
}

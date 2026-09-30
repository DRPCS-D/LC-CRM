import { Navigate, Outlet } from 'react-router-dom'
import { Cargando } from '@/components/ui/estado'
import { useAuth } from '@/hooks/useAuth'

/**
 * Rutas para admin y supervisor (Reportes, Usuarios). Igual que
 * RequiereAdmin, es una comodidad de la UI: lo que protege los datos es la
 * RLS.
 */
export default function RequiereVeTodo() {
  const { loading, veTodo } = useAuth()

  if (loading) return <Cargando />
  if (!veTodo) return <Navigate to="/" replace />
  return <Outlet />
}

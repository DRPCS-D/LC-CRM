import { Navigate, Outlet } from 'react-router-dom'
import { Cargando } from '@/components/ui/estado'
import { useAuth } from '@/hooks/useAuth'

/**
 * Pedidos y Clientes no son para el cobrador (solo usa Informes). Como
 * RequiereVeTodo, es una comodidad de la UI: lo que protege los datos es la RLS.
 */
export default function RequiereNoCobrador() {
  const { loading, esCobrador } = useAuth()

  if (loading) return <Cargando />
  if (esCobrador) return <Navigate to="/informes" replace />
  return <Outlet />
}

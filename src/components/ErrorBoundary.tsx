import { RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Atrapa los errores de dibujo de lo que tenga adentro, para no dejar la
 * pantalla en blanco. Los de carga de una pantalla ("Failed to fetch
 * dynamically imported module") pasan tras un despliegue nuevo: ahi alcanza
 * con recargar para traer los archivos nuevos.
 *
 * Para que se reinicie al cambiar de pantalla, ponerle `key={pathname}`.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la pantalla', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-xs">
        <h2 className="text-sm font-semibold text-foreground">Algo salió mal</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta pantalla no se pudo mostrar. Recargá la página; si vuelve a pasar, avisale al administrador.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          <RefreshCw /> Recargar
        </Button>
      </div>
    )
  }
}

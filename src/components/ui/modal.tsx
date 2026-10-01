import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

/**
 * Bloqueo del scroll del fondo con contador. Con varios modales abiertos a la
 * vez (el detalle de un pedido y, encima, la confirmacion de borrado), cada
 * uno guardaba el `overflow` "previo" y lo restauraba al cerrarse: si el de
 * abajo cerraba antes que el de arriba, el de arriba "restauraba" el
 * `hidden` que habia visto al abrir y la pagina quedaba sin scroll para
 * siempre. Con el contador, solo se toca el body al abrir el primero y al
 * cerrar el ultimo.
 */
let bloqueos = 0
let overflowOriginal = ''

function bloquearScroll() {
  if (bloqueos++ === 0) {
    overflowOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}

function liberarScroll() {
  if (--bloqueos === 0) document.body.style.overflow = overflowOriginal
}

export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  footer,
  ancho = 'max-w-lg',
}: {
  abierto: boolean
  titulo: string
  descripcion?: string
  onCerrar: () => void
  children: ReactNode
  footer?: ReactNode
  ancho?: string
}) {
  // El body no scrollea detras del modal. Efecto aparte, que depende solo de
  // `abierto`: `onCerrar` suele cambiar en cada render y el contador tiene que
  // sumar una vez por modal abierto, no una por render.
  useEffect(() => {
    if (!abierto) return
    bloquearScroll()
    return liberarScroll
  }, [abierto])

  // Escape cierra
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn('w-full rounded-lg border border-border bg-card shadow-xl', ancho)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            {descripcion && (
              <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}

/**
 * Confirmacion para acciones destructivas. Con `palabra`, ademas hay que
 * escribirla para habilitar el boton (como el "eliminar" de la app original
 * para borrar pedidos, informes y clientes).
 */
export function ConfirmModal({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Eliminar',
  procesando = false,
  palabra,
  tono = 'destructive',
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean
  titulo: string
  mensaje: ReactNode
  textoConfirmar?: string
  procesando?: boolean
  palabra?: string
  tono?: 'destructive' | 'primary'
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const [escrito, setEscrito] = useState('')
  useEffect(() => {
    if (abierto) setEscrito('')
  }, [abierto])
  const bloqueado = Boolean(palabra) && escrito.trim().toLowerCase() !== palabra?.toLowerCase()

  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onCerrar={onCancelar}
      ancho="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button variant={tono} onClick={onConfirmar} disabled={procesando || bloqueado}>
            {procesando ? 'Procesando…' : textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{mensaje}</div>
      {palabra && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs text-muted-foreground">
            Escribi <strong className="text-foreground">{palabra}</strong> para confirmar:
          </p>
          <input
            autoFocus
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !bloqueado && !procesando) onConfirmar()
            }}
            className="h-9.5 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </Modal>
  )
}

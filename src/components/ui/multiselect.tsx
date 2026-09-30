import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizar } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Filtro de seleccion multiple con buscador (Cliente, Marca, Usuario…). Sin
 * nada tildado no filtra. El panel va en un portal por la misma razon que el
 * Combobox: para que un contenedor con overflow no lo recorte.
 */
export function MultiSelect({
  label,
  opciones,
  seleccion,
  onCambiar,
  className,
}: {
  label: string
  opciones: string[]
  seleccion: string[]
  onCambiar: (v: string[]) => void
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const botonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function reposicionar() {
    const r = botonRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
  }

  useLayoutEffect(() => {
    if (abierto) reposicionar()
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      const t = e.target as Node
      if (botonRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setAbierto(false)
      setBusqueda('')
    }
    document.addEventListener('mousedown', fuera)
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
    }
  }, [abierto])

  const q = normalizar(busqueda)
  const visibles = q ? opciones.filter((o) => normalizar(o).includes(q)) : opciones
  const set = new Set(seleccion)

  function alternar(o: string) {
    onCambiar(set.has(o) ? seleccion.filter((x) => x !== o) : [...seleccion, o])
  }

  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex h-9.5 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('truncate', seleccion.length === 0 && 'text-muted-foreground')}>
          {seleccion.length === 0
            ? 'Todos'
            : seleccion.length === 1
              ? seleccion[0]
              : `${seleccion.length} seleccionados`}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className="z-[60] overflow-hidden rounded-md border border-border bg-card shadow-lg"
          >
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {visibles.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
              ) : (
                visibles.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => alternar(o)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        set.has(o)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      {set.has(o) && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{o}</span>
                  </button>
                ))
              )}
            </div>
            {seleccion.length > 0 && (
              <div className="border-t border-border p-1.5">
                <button
                  type="button"
                  onClick={() => onCambiar([])}
                  className="w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Quitar seleccion
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

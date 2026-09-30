import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'

const ZOOM_MIN = 1
const ZOOM_MAX = 5
const ZOOM_DOBLE = 2.5

/**
 * Visor a pantalla completa con zoom, para leer la foto de un pedido:
 * doble clic / doble toque alterna 1× ↔ 2.5×, la rueda del mouse hace zoom,
 * y con zoom se arrastra para mover.
 */
export function VisorImagen({ src, onCerrar }: { src: string | null; onCerrar: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    setZoom(1)
    setPos({ x: 0, y: 0 })
  }, [src])

  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCerrar()
      }
    }
    // En captura: el visor se abre encima de un Modal, y el Escape tiene que
    // cerrar solo el visor, no los dos.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [src, onCerrar])

  if (!src) return null

  function aplicarZoom(z: number) {
    const nuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
    setZoom(nuevo)
    if (nuevo === 1) setPos({ x: 0, y: 0 })
  }

  function onWheel(e: WheelEvent) {
    aplicarZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
  }

  function onPointerDown(e: PointerEvent) {
    if (zoom === 1) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    arrastre.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
  }

  function onPointerMove(e: PointerEvent) {
    const a = arrastre.current
    if (!a) return
    setPos({ x: a.px + (e.clientX - a.x) / zoom, y: a.py + (e.clientY - a.y) / zoom })
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/92">
      <div className="flex items-center justify-end gap-1 p-2 text-white">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => aplicarZoom(zoom / 1.5)} aria-label="Alejar">
          <ZoomOut />
        </Button>
        <span className="tabular w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => aplicarZoom(zoom * 1.5)} aria-label="Acercar">
          <ZoomIn />
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={onCerrar} aria-label="Cerrar">
          <X />
        </Button>
      </div>
      <div
        className="relative flex-1 touch-none overflow-hidden"
        onWheel={onWheel}
        onDoubleClick={() => aplicarZoom(zoom > 1 ? 1 : ZOOM_DOBLE)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (arrastre.current = null)}
        onPointerCancel={() => (arrastre.current = null)}
        onClick={(e) => {
          if (e.target === e.currentTarget && zoom === 1) onCerrar()
        }}
      >
        <img
          src={src}
          alt="Foto del pedido"
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
          style={{
            transform: `scale(${zoom}) translate(${pos.x}px, ${pos.y}px)`,
            cursor: zoom > 1 ? 'grab' : 'zoom-in',
            transition: arrastre.current ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>
    </div>,
    document.body,
  )
}

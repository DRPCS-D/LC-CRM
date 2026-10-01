import { X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { Cliente } from '@/lib/database.types'
import { normalizar } from '@/lib/format'
import { cn } from '@/lib/utils'

const MAX_SUGERENCIAS = 10

function coincideCliente(c: Cliente, q: string): boolean {
  return (
    normalizar(c.codigo).includes(q) ||
    normalizar(c.razon_social).includes(q) ||
    normalizar(c.nombre_fantasia ?? '').includes(q)
  )
}

/**
 * Autocompletado de cliente por codigo, razon social o nombre de fantasia.
 *
 * El cliente se ELIGE de la lista (como en la app original): una vez
 * elegido, el campo queda bloqueado mostrando el codigo, y "Cambiar" lo
 * libera. Asi no se puede guardar un pedido con un cliente escrito a mano
 * que no existe.
 */
export function ClienteSelector({
  clientes,
  valor,
  onCambiar,
  invalido,
  autoFocus,
}: {
  clientes: Cliente[]
  valor: Cliente | null
  onCambiar: (c: Cliente | null) => void
  invalido?: boolean
  autoFocus?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const sugerencias = useMemo(() => {
    const q = normalizar(texto)
    if (!q) return []
    return clientes.filter((c) => coincideCliente(c, q)).slice(0, MAX_SUGERENCIAS)
  }, [clientes, texto])

  function elegir(c: Cliente) {
    onCambiar(c)
    setTexto('')
    setAbierto(false)
  }

  if (valor) {
    return (
      <div className="flex h-9.5 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm">
        <Badge tono="primary" className="shrink-0">
          {valor.codigo}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {valor.razon_social}
          {valor.nombre_fantasia && (
            <span className="font-normal text-muted-foreground"> · {valor.nombre_fantasia}</span>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2 h-7"
          onClick={() => {
            onCambiar(null)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          <X /> Cambiar
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={texto}
        autoFocus={autoFocus}
        placeholder="Buscar por código, razón social o fantasía…"
        className={cn(invalido && 'border-destructive ring-1 ring-destructive')}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          setActivo(0)
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!abierto || sugerencias.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActivo((a) => Math.min(a + 1, sugerencias.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActivo((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            elegir(sugerencias[activo])
          } else if (e.key === 'Escape') {
            setAbierto(false)
          }
        }}
      />
      {abierto && texto && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
          {sugerencias.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Ningún cliente coincide. Solo se puede elegir un cliente del listado.
            </p>
          ) : (
            sugerencias.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(c)}
                onMouseEnter={() => setActivo(i)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                  i === activo && 'bg-accent',
                )}
              >
                <span className="tabular w-16 shrink-0 text-xs text-muted-foreground">{c.codigo}</span>
                <span className="min-w-0 flex-1 truncate">
                  {c.razon_social}
                  {c.nombre_fantasia && (
                    <span className="text-muted-foreground"> · {c.nombre_fantasia}</span>
                  )}
                </span>
                {c.ciudad && (
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {c.ciudad}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

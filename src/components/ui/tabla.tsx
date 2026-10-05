import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { createContext, useContext, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from './button'
import type { Orden } from '@/lib/orden'
import { Input } from './field'

const BarraTabsCtx = createContext<{ buscador: HTMLElement | null; accion: HTMLElement | null }>({ buscador: null, accion: null })
const DescripcionCtx = createContext<HTMLElement | null>(null)

/**
 * Pestanas de la seccion con dos huecos en la misma linea: el del buscador y
 * el de la accion principal ("Nuevo"). Lo que la pestana activa pase por
 * <EnBarraDeTabs> aparece ahi. En escritorio van a la derecha de las pestanas
 * (buscador y despues accion); en el celular la accion queda a la altura de
 * las pestanas y el buscador baja a su propia linea, a todo el ancho.
 */
/**
 * Alto de una vista cuya tabla tiene scroll propio: la pantalla menos la barra
 * de arriba (3.5625rem) y el relleno de <main> en AppLayout (md: pt-8 + pb-10 =
 * 4.5rem). Si se toca el relleno de <main>, hay que tocar esto tambien. Solo
 * desde `md`: en el celular la pagina se desplaza normal (con KPIs y filtros
 * apilados, una tabla con scroll propio quedaria de 3 filas).
 */
export const ALTO_VISTA = 'md:h-[calc(100dvh-3.5625rem-4.5rem)]'

export function SeccionConTabs({
  titulo,
  tabs,
  children,
  ajustarAlto,
}: {
  titulo: string
  tabs: Tab[]
  children: ReactNode
  /** La vista ocupa justo la pantalla: la pagina no se mueve y la tabla hace su propio scroll. */
  ajustarAlto?: boolean
}) {
  const [buscador, setBuscador] = useState<HTMLElement | null>(null)
  const [accion, setAccion] = useState<HTMLElement | null>(null)
  const [descripcion, setDescripcion] = useState<HTMLElement | null>(null)
  return (
    <BarraTabsCtx.Provider value={{ buscador, accion }}>
      <DescripcionCtx.Provider value={descripcion}>
        <div className={cn(ajustarAlto && `md:flex md:flex-col md:overflow-y-auto ${ALTO_VISTA}`)}>
          <div className="mb-4 shrink-0">
            <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
            <p ref={setDescripcion} className="empty:hidden text-sm text-muted-foreground" />
          </div>
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <SubTabs tabs={tabs} className="mb-0" />
            <div ref={setBuscador} className="order-last flex w-full items-center empty:hidden sm:order-none sm:ml-auto sm:w-auto" />
            <div ref={setAccion} className="ml-auto flex items-center empty:hidden sm:ml-0" />
          </div>
          <div className={cn(ajustarAlto && 'md:flex md:min-h-0 md:flex-1 md:flex-col')}>{children}</div>
        </div>
      </DescripcionCtx.Provider>
    </BarraTabsCtx.Provider>
  )
}

/** Dibuja su contenido como descripcion bajo el titulo de <SeccionConTabs>. */
export function EnDescripcion({ children }: { children: ReactNode }) {
  const lugar = useContext(DescripcionCtx)
  return lugar ? createPortal(children, lugar) : null
}

/** Dibuja su contenido en un hueco de <SeccionConTabs>: el buscador (por defecto) o la accion principal. */
export function EnBarraDeTabs({ children, lugar = 'buscador' }: { children: ReactNode; lugar?: 'buscador' | 'accion' }) {
  const huecos = useContext(BarraTabsCtx)
  const hueco = huecos[lugar]
  return hueco ? createPortal(children, hueco) : null
}

/** Pestanas de una seccion (Nuevo | Lista | Mapa), como links de ruta. */
type Tab = { to: string; label: string; end?: boolean; icono?: ComponentType<{ className?: string }> }

export function SubTabs({ tabs, className }: { tabs: Tab[]; className?: string }) {
  return (
    <div className={cn('mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-xs sm:inline-flex', className)}>
      {tabs.map(({ to, label, end, icono: Icono }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm transition-colors sm:flex-none',
              isActive
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          {Icono && <Icono className="size-4" />}
          {label}
        </NavLink>
      ))}
    </div>
  )
}

export function Buscador({
  valor,
  onCambiar,
  placeholder = 'Buscar…',
  className,
  acciones,
}: {
  valor: string
  onCambiar: (v: string) => void
  placeholder?: string
  className?: string
  /** Botones (<AccionBuscador>) que van dentro del cuadro, a la derecha. */
  acciones?: ReactNode
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={cn('pl-9', acciones ? 'pr-28' : 'pr-8')}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {valor && (
          <button
            type="button"
            onClick={() => onCambiar('')}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X className="size-3.5" />
          </button>
        )}
        {acciones}
      </div>
    </div>
  )
}

/** Boton de icono para el interior del buscador (filtros, exportar). `insignia` muestra un contador. */
export function AccionBuscador({
  icono: Icono,
  titulo,
  onClick,
  disabled,
  insignia,
  activo,
}: {
  icono: ComponentType<{ className?: string }>
  titulo: string
  onClick: () => void
  disabled?: boolean
  insignia?: number
  activo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      className={cn(
        'relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        activo && 'bg-accent text-foreground',
      )}
    >
      <Icono className="size-4" />
      {!!insignia && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] leading-none text-primary-foreground">
          {insignia}
        </span>
      )}
    </button>
  )
}

export function Kpi({
  titulo,
  valor,
  detalle,
  tono = 'neutral',
  className,
}: {
  className?: string
  titulo: string
  valor: ReactNode
  detalle?: ReactNode
  tono?: 'neutral' | 'warning'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-3 shadow-xs sm:px-4',
        tono === 'warning' ? 'border-warning/50 bg-warning/8' : 'border-border',
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="tabular mt-0.5 break-words text-lg font-semibold text-foreground">{valor}</p>
      {detalle && <div className="mt-0.5 text-xs text-muted-foreground">{detalle}</div>}
    </div>
  )
}

/** Encabezado de columna ordenable. */
export function Th<K extends string>({
  campo,
  orden,
  onOrdenar,
  children,
  className,
}: {
  campo?: K
  orden?: Orden<K>
  onOrdenar?: (o: Orden<K>) => void
  children: ReactNode
  className?: string
}) {
  if (!campo || !orden || !onOrdenar) {
    return <th className={cn('px-3 py-2.5 font-medium', className)}>{children}</th>
  }
  const activo = orden.campo === campo
  const Icono = !activo ? ArrowUpDown : orden.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={cn('px-3 py-2.5 font-medium', className)}>
      <button
        type="button"
        onClick={() =>
          onOrdenar({ campo, dir: activo && orden.dir === 'desc' ? 'asc' : 'desc' })
        }
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          activo && 'text-foreground',
        )}
      >
        {children}
        <Icono className={cn('size-3', !activo && 'opacity-40')} />
      </button>
    </th>
  )
}

export const TAMANO_PAGINA = 10

export function Paginacion({
  pagina,
  total,
  onCambiar,
  tamano = TAMANO_PAGINA,
}: {
  pagina: number
  total: number
  onCambiar: (p: number) => void
  tamano?: number
}) {
  if (total === 0) return null
  const paginas = Math.max(1, Math.ceil(total / tamano))
  const desde = (pagina - 1) * tamano + 1
  const hasta = Math.min(total, pagina * tamano)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span className="tabular">
        Mostrando {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={pagina <= 1}
          onClick={() => onCambiar(pagina - 1)}
        >
          <ChevronLeft /> Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pagina >= paginas}
          onClick={() => onCambiar(pagina + 1)}
        >
          Siguiente <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

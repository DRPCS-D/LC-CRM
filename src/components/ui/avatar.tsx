import { urlAvatar } from '@/lib/usuario'
import { cn } from '@/lib/utils'

/** Foto de perfil, o la inicial del usuario si no tiene. */
export function Avatar({
  nombre,
  fotoPath,
  className,
}: {
  nombre: string
  fotoPath?: string | null
  className?: string
}) {
  const url = urlAvatar(fotoPath)
  const base = cn('inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full', className)
  if (url) return <img src={url} alt="" className={cn(base, 'object-cover')} />
  return (
    <span className={cn(base, 'bg-primary/12 text-xs font-semibold uppercase text-primary')}>
      {nombre.trim().charAt(0) || '?'}
    </span>
  )
}

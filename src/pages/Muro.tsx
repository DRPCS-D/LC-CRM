import { Heart, Loader2, MapPin, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { VisorImagen } from '@/components/VisorImagen'
import { Avatar } from '@/components/ui/avatar'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { useAuth } from '@/hooks/useAuth'
import {
  informeComentarios,
  informeLikes,
  mensajeDeError,
  useInformeComentarios,
  useInformeLikes,
  useInformes,
} from '@/hooks/useDatos'
import { autorDe, type Informe, type InformeComentario, type InformeLike } from '@/lib/database.types'
import { useUrlFoto } from '@/lib/fotos'
import { formatFechaHora } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Publicaciones que se dibujan por tanda al bajar. */
const LOTE = 10

/**
 * Muro de informes con foto, tipo red social (PRUEBA, solo admin): me gusta y
 * comentarios. Reusa la tabla de informes en memoria; los me gusta y comentarios
 * se bajan enteros porque es una prueba de pocos datos.
 */
export default function Muro() {
  const { data, loading, error } = useInformes()
  const { data: likes } = useInformeLikes()
  const { data: comentarios } = useInformeComentarios()
  const [cantidad, setCantidad] = useState(LOTE)
  const [centinela, setCentinela] = useState<HTMLElement | null>(null)

  const publicaciones = useMemo(() => data.filter((i) => i.imagen_path), [data])
  const likesPorInforme = useMemo(() => agrupar(likes), [likes])
  const comentariosPorInforme = useMemo(() => agrupar(comentarios), [comentarios])
  const hayMas = cantidad < publicaciones.length

  // Se vuelve a observar tras cada tanda: si el final sigue a la vista, el observador no avisa de nuevo solo.
  useEffect(() => {
    if (!centinela || !hayMas) return
    const obs = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setCantidad((c) => c + LOTE), { rootMargin: '400px' })
    obs.observe(centinela)
    return () => obs.disconnect()
  }, [centinela, hayMas, cantidad])

  return (
    <div className="mx-auto max-w-xl">
      {loading && data.length === 0 ? (
        <Cargando texto="Cargando visitas…" />
      ) : error && data.length === 0 ? (
        <ErrorBox mensaje={error} />
      ) : publicaciones.length === 0 ? (
        <Vacio titulo="Todavía no hay informes con foto" descripcion="Cuando alguien cargue una visita con foto, aparece acá." />
      ) : (
        <div className="space-y-5">
          {publicaciones.slice(0, cantidad).map((i) => (
            <Publicacion key={i.id} informe={i} likes={likesPorInforme.get(i.id) ?? []} comentarios={comentariosPorInforme.get(i.id) ?? []} />
          ))}
          {hayMas ? (
            <div ref={setCentinela} className="flex justify-center py-4 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">Eso es todo · {publicaciones.length} visitas con foto</p>
          )}
        </div>
      )}
    </div>
  )
}

function agrupar<T extends { informe_id: string }>(filas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const f of filas) m.set(f.informe_id, [...(m.get(f.informe_id) ?? []), f])
  return m
}

function Publicacion({ informe, likes, comentarios }: { informe: Informe; likes: InformeLike[]; comentarios: InformeComentario[] }) {
  const { usuario } = useAuth()
  const url = useUrlFoto(informe.imagen_path)
  const [visor, setVisor] = useState(false)
  const [verComentarios, setVerComentarios] = useState(false)
  const [verLikes, setVerLikes] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [animar, setAnimar] = useState(false)

  const miLike = likes.some((l) => l.usuario_id === usuario?.id)
  const autor = autorDe(informe)

  async function alternarLike() {
    if (!usuario || ocupado) return
    setOcupado(true)
    if (!miLike) setAnimar(true)
    const { error } = miLike
      ? await supabase.from('informe_likes').delete().eq('informe_id', informe.id).eq('usuario_id', usuario.id)
      : await supabase.from('informe_likes').insert({ informe_id: informe.id })
    if (error) toast.error(mensajeDeError(error, 'No se pudo guardar el me gusta.'))
    await informeLikes.refetch()
    setOcupado(false)
    setTimeout(() => setAnimar(false), 400)
  }

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex items-center gap-3 px-3 py-2.5">
        <Avatar nombre={autor} fotoPath={informe.usuario?.foto_path} className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{autor}</p>
          <p className="truncate text-xs text-muted-foreground">{formatFechaHora(informe.created_at)}</p>
        </div>
        <a
          href={`https://www.google.com/maps?q=${informe.lat},${informe.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary"
          title="Ver ubicación"
        >
          <MapPin className="size-4" />
        </a>
      </header>

      <button type="button" onClick={() => setVisor(true)} disabled={!url} className="block w-full bg-muted" aria-label="Ampliar foto">
        {url ? (
          <img src={url} alt="Foto de la visita" loading="lazy" className="max-h-[32rem] w-full cursor-zoom-in object-cover" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        )}
      </button>
      <VisorImagen src={visor ? url : null} onCerrar={() => setVisor(false)} />

      <div className="space-y-1.5 px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={alternarLike} disabled={ocupado} aria-label={miLike ? 'Quitar me gusta' : 'Me gusta'} aria-pressed={miLike}>
            <Heart className={cn('size-6 transition-transform', miLike ? 'fill-primary text-primary' : 'text-foreground hover:text-muted-foreground', animar && 'scale-125')} />
          </button>
          <button type="button" onClick={() => setVerComentarios((v) => !v)} aria-label="Comentarios">
            <MessageCircle className="size-6 text-foreground hover:text-muted-foreground" />
          </button>
        </div>

        {likes.length > 0 && (
          <div className="text-sm">
            <button type="button" className="font-semibold text-foreground" onClick={() => setVerLikes((v) => !v)}>
              {likes.length === 1 ? '1 me gusta' : `${likes.length} me gusta`}
            </button>
            {verLikes && <p className="text-xs text-muted-foreground">{likes.map((l) => l.usuario?.username ?? '—').join(', ')}</p>}
          </div>
        )}

        <p className="text-sm text-foreground">
          <span className="font-semibold">{informe.cliente_nombre ?? 'Sin cliente'}</span>
          {informe.ciudad && <span className="text-muted-foreground"> · {informe.ciudad}</span>}
          {informe.comentario && <span className="block">{informe.comentario}</span>}
        </p>

        <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setVerComentarios(true)}>
          {comentarios.length === 0 ? 'Agregá un comentario…' : comentarios.length === 1 ? 'Ver el comentario' : `Ver los ${comentarios.length} comentarios`}
        </button>
      </div>
      {verComentarios && <ComentariosSheet informe={informe} comentarios={comentarios} onCerrar={() => setVerComentarios(false)} />}
    </article>
  )
}

/** Ventana de comentarios de una publicacion: hoja desde abajo en el celular, ventana centrada en escritorio. */
function ComentariosSheet({ informe, comentarios, onCerrar }: { informe: Informe; comentarios: InformeComentario[]; onCerrar: () => void }) {
  const { usuario } = useAuth()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previo
      document.removeEventListener('keydown', onKey)
    }
  }, [onCerrar])

  async function comentar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    const { error } = await supabase.from('informe_comentarios').insert({ informe_id: informe.id, texto: t })
    if (error) toast.error(mensajeDeError(error, 'No se pudo enviar el comentario.'))
    else {
      setTexto('')
      await informeComentarios.refetch()
      lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
    }
    setEnviando(false)
  }

  async function borrar(id: string) {
    const { error } = await supabase.from('informe_comentarios').delete().eq('id', id)
    if (error) return void toast.error(mensajeDeError(error, 'No se pudo borrar el comentario.'))
    informeComentarios.refetch()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div role="dialog" aria-modal="true" aria-label="Comentarios" className="flex h-[75dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:h-[70dvh] sm:rounded-2xl">
        <div className="relative flex items-center justify-center border-b border-border px-4 py-3">
          <span className="absolute top-1.5 h-1 w-10 rounded-full bg-border sm:hidden" />
          <h2 className="mt-1 text-sm font-semibold text-foreground sm:mt-0">Comentarios</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="absolute right-3 top-2.5 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div ref={lista} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {comentarios.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay comentarios. Sé el primero.</p>
          ) : (
            comentarios.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <Avatar nombre={c.usuario?.username ?? '?'} fotoPath={c.usuario?.foto_path} className="size-9" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    <span className="font-semibold text-foreground">{c.usuario?.username ?? '—'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatFechaHora(c.created_at)}</span>
                  </p>
                  <p className="break-words text-foreground">{c.texto}</p>
                </div>
                {c.usuario_id === usuario?.id && (
                  <button type="button" onClick={() => borrar(c.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Borrar comentario">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <form
          className="flex items-center gap-3 border-t border-border px-4 py-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          onSubmit={(e) => {
            e.preventDefault()
            comentar()
          }}
        >
          {usuario && <Avatar nombre={usuario.username} fotoPath={usuario.foto_path} className="size-8" />}
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
            placeholder="Agregá un comentario…"
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button type="submit" disabled={!texto.trim() || enviando} className="text-primary disabled:opacity-40" aria-label="Enviar comentario">
            {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

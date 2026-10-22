import { Heart, Loader2, MapPin, MessageCircle, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Muro de visitas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Prueba · solo administrador. Las visitas con foto, con me gusta y comentarios.</p>
      </div>

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
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
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

  async function comentar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    const { error } = await supabase.from('informe_comentarios').insert({ informe_id: informe.id, texto: t })
    if (error) toast.error(mensajeDeError(error, 'No se pudo enviar el comentario.'))
    else {
      setTexto('')
      setVerComentarios(true)
      await informeComentarios.refetch()
    }
    setEnviando(false)
  }

  async function borrarComentario(id: string) {
    const { error } = await supabase.from('informe_comentarios').delete().eq('id', id)
    if (error) return void toast.error(mensajeDeError(error, 'No se pudo borrar el comentario.'))
    informeComentarios.refetch()
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

        {comentarios.length > 0 && !verComentarios && (
          <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setVerComentarios(true)}>
            Ver {comentarios.length === 1 ? 'el comentario' : `los ${comentarios.length} comentarios`}
          </button>
        )}
        {verComentarios && (
          <ul className="space-y-1.5 pt-1">
            {comentarios.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <p className="min-w-0 flex-1 break-words">
                  <span className="font-semibold text-foreground">{c.usuario?.username ?? '—'}</span> {c.texto}
                  <span className="ml-2 text-[11px] text-muted-foreground">{formatFechaHora(c.created_at)}</span>
                </p>
                {c.usuario_id === usuario?.id && (
                  <button type="button" onClick={() => borrarComentario(c.id)} className="text-muted-foreground hover:text-destructive" title="Borrar comentario">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex items-center gap-2 border-t border-border pt-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            comentar()
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
            placeholder="Agregá un comentario…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!texto.trim() || enviando} className="text-primary disabled:opacity-40" aria-label="Enviar comentario">
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </article>
  )
}

import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useEffect, useRef } from 'react'
import { escaparHtml } from '@/lib/html'
import { cn } from '@/lib/utils'

/**
 * Mapa de OpenStreetMap con marcadores agrupados (Leaflet + markercluster).
 *
 * Se maneja de forma imperativa y no con react-leaflet: son dos capas
 * (tiles + cluster) y un par de efectos, y asi no se suma otra dependencia.
 * La pantalla que lo usa lo carga con React.lazy, porque Leaflet pesa y solo
 * hace falta en las vistas de mapa.
 */

export interface PuntoMapa {
  id: string
  lat: number
  lng: number
  /** HTML del popup. Quien lo arma tiene que escapar el texto con `escaparHtml`. */
  popup: string
  /**
   * Marcador con avatar (mapa de visitas): la clave agrupa por persona, para
   * que un cluster de visitas de una sola persona muestre su cara.
   */
  avatar?: { clave: string; inicial: string; url: string | null }
}

// Icono "usuarios" (lucide) para un grupo de visitas de varias personas.
const ICONO_VARIOS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'

const PARAGUAY: L.LatLngTuple = [-25.2637, -57.5759]

function htmlAvatar(a: NonNullable<PuntoMapa['avatar']>, extra = ''): string {
  const interior = a.url
    ? `<img src="${a.url}" alt="" />`
    : `<span>${escaparHtml(a.inicial.toUpperCase())}</span>`
  return `<div class="mapa-avatar">${interior}${extra}</div>`
}

function iconoPunto(p: PuntoMapa): L.DivIcon {
  if (p.avatar) {
    return L.divIcon({ html: htmlAvatar(p.avatar), className: '', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16] })
  }
  return L.divIcon({ html: '<div class="mapa-pin"></div>', className: '', iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] })
}

function iconoCluster(cluster: L.MarkerCluster): L.DivIcon {
  const hijos = cluster.getAllChildMarkers()
  const n = hijos.length
  const badge = `<b class="mapa-badge">${n > 99 ? '99+' : n}</b>`
  const avatares = hijos.map((m) => (m.options as { punto?: PuntoMapa }).punto?.avatar)
  const primero = avatares[0]
  if (primero) {
    const mismaPersona = avatares.every((a) => a?.clave === primero.clave)
    const html = mismaPersona
      ? htmlAvatar(primero, badge)
      : `<div class="mapa-avatar mapa-avatar-varios">${ICONO_VARIOS}${badge}</div>`
    return L.divIcon({ html, className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
  }
  return L.divIcon({
    html: `<div class="mapa-cluster"><span>${n}</span></div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

export default function Mapa({
  puntos,
  enfocar,
  className,
}: {
  puntos: PuntoMapa[]
  /** id de un punto para centrar el mapa en el y abrir su popup. */
  enfocar?: string | null
  className?: string
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.MarkerClusterGroup | null>(null)
  const marcadores = useRef(new Map<string, L.Marker>())
  const claveAnterior = useRef('')
  const enfocado = useRef<string | null>(null)

  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: false }).setView(PARAGUAY, 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m)
    const cluster = L.markerClusterGroup({ iconCreateFunction: iconoCluster, showCoverageOnHover: false })
    // Sin el prefijo "Leaflet"; la atribucion a OpenStreetMap se mantiene (lo exige su licencia).
    L.control.attribution({ prefix: false }).addTo(m)
    m.addLayer(cluster)
    mapa.current = m
    capa.current = cluster
    // El contenedor puede terminar de dimensionarse despues del primer pintado
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(contenedor.current)
    return () => {
      ro.disconnect()
      m.remove()
      mapa.current = null
      capa.current = null
      marcadores.current.clear()
      claveAnterior.current = ''
      enfocado.current = null
    }
  }, [])

  // Las capas se rearman cada vez que llega otra lista de puntos.
  useEffect(() => {
    const cluster = capa.current
    if (!cluster) return
    cluster.clearLayers()
    marcadores.current.clear()
    const nuevos = puntos.map((p) => {
      const marker = L.marker([p.lat, p.lng], { icon: iconoPunto(p), punto: p } as L.MarkerOptions)
      marker.bindPopup(p.popup, { maxWidth: 280 })
      marcadores.current.set(p.id, marker)
      return marker
    })
    cluster.addLayers(nuevos)
  }, [puntos])

  // Donde mira el mapa. Va todo en un solo efecto (y sin animaciones) porque
  // encuadrar y acercar a un punto por separado se pisaban entre si:
  //  · punto pedido (`enfocar`) que todavia no se mostro: se acerca y abre su popup;
  //  · se quito el enfoque: se vuelve a encuadrar todo;
  //  · cambio QUE se muestra (un filtro): se reencuadra. Si llega la misma lista
  //    refrescada no se toca, para que el mapa no salte mientras se lo mira.
  useEffect(() => {
    const m = mapa.current
    const cluster = capa.current
    if (!m || !cluster) return
    const clave = puntos.map((p) => p.id).join(',')
    const cambioLista = clave !== claveAnterior.current
    claveAnterior.current = clave

    const encuadrarTodo = () => {
      if (puntos.length > 0) m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15, animate: false })
      else m.setView(PARAGUAY, 6, { animate: false })
    }

    const marker = enfocar ? marcadores.current.get(enfocar) : undefined
    if (enfocar && marker && enfocado.current !== enfocar) {
      enfocado.current = enfocar
      m.setView(marker.getLatLng(), 17, { animate: false })
      // Si sigue agrupado con otros en el mismo lugar, el cluster lo despliega.
      cluster.zoomToShowLayer(marker, () => marker.openPopup())
    } else if (!enfocar && enfocado.current) {
      enfocado.current = null
      encuadrarTodo()
    } else if (cambioLista) {
      encuadrarTodo()
    }
  }, [puntos, enfocar])

  return <div ref={contenedor} className={cn('z-0 h-[65vh] min-h-80 w-full rounded-lg border border-border', className)} />
}

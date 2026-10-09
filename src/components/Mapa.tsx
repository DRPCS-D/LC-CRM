import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.heat'
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
  /** 'alerta': pin en otro color (por ejemplo, clientes sin visitar). */
  tono?: 'alerta'
  /** Orden de la visita (mapa de recorrido): se dibuja el numero dentro del marcador. */
  numero?: number
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
  return L.divIcon({ html: `<div class="mapa-pin${p.tono === 'alerta' ? ' mapa-pin-alerta' : ''}"></div>`, className: '', iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] })
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
    html: `<div class="mapa-cluster${hijos.every((m) => (m.options as { punto?: PuntoMapa }).punto?.tono === 'alerta') ? ' mapa-cluster-alerta' : ''}"><span>${n}</span></div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

export default function Mapa({
  puntos,
  enfocar,
  className,
  modo = 'puntos',
}: {
  puntos: PuntoMapa[]
  /** 'calor': mapa de calor (donde hay mas puntos). 'ruta': une los puntos en el orden dado y los numera. */
  modo?: 'puntos' | 'calor' | 'ruta'
  /** id de un punto para centrar el mapa en el y abrir su popup. */
  enfocar?: string | null
  className?: string
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.MarkerClusterGroup | null>(null)
  const calor = useRef<L.HeatLayer | null>(null)
  const ruta = useRef<L.LayerGroup | null>(null)
  const marcadores = useRef(new Map<string, L.Marker>())
  const claveAnterior = useRef('')
  const enfocado = useRef<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: false }).setView(PARAGUAY, 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m)
    const cluster = L.markerClusterGroup({
      iconCreateFunction: iconoCluster,
      showCoverageOnHover: false,
    })
    // Sin el prefijo "Leaflet"; la atribucion a OpenStreetMap se mantiene (lo exige su licencia).
    L.control.attribution({ prefix: false }).addTo(m)
    m.addLayer(cluster)
    // El mapa de calor se prepara aca y se enciende o apaga segun `modo` (ver mas abajo).
    calor.current = L.heatLayer([], {
      radius: 18,
      blur: 18,
      // Por debajo de este zoom cada punto pesa menos: con el pais entero a la vista
      // no se satura todo de rojo.
      maxZoom: 12,
      minOpacity: 0.3,
      gradient: { 0.25: '#fde68a', 0.55: '#f97316', 1: '#8a1b1a' },
    })
    ruta.current = L.layerGroup()
    mapa.current = m
    capa.current = cluster
    // El contenedor puede terminar de dimensionarse despues del primer pintado
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(contenedor.current)
    return () => {
      ro.disconnect()
      clearTimeout(temporizador.current)
      m.remove()
      mapa.current = null
      capa.current = null
      calor.current = null
      ruta.current = null
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

  // Marcadores agrupados, mapa de calor o recorrido: se enciende uno y se apagan los otros.
  useEffect(() => {
    const m = mapa.current
    const cluster = capa.current
    const heat = calor.current
    const recorrido = ruta.current
    if (!m || !cluster || !heat || !recorrido) return
    const poner = (capaX: L.Layer, si: boolean) => {
      if (si && !m.hasLayer(capaX)) m.addLayer(capaX)
      if (!si && m.hasLayer(capaX)) m.removeLayer(capaX)
    }
    recorrido.clearLayers()
    if (modo === 'ruta') {
      if (puntos.length > 1) {
        L.polyline(puntos.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: '#8a1b1a', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(recorrido)
      }
      for (const p of puntos) {
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: `<div class="mapa-numero">${p.numero ?? ''}</div>`, className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] }),
        })
          .bindPopup(p.popup, { maxWidth: 280 })
          .addTo(recorrido)
      }
    }
    poner(cluster, modo === 'puntos')
    poner(heat, modo === 'calor')
    // Los puntos del calor se cargan DESPUES de ponerlo en el mapa: leaflet.heat se rompe si
    // se le actualizan estando fuera (al cambiar rapido entre Puntos y Calor daba error).
    if (modo === 'calor') heat.setLatLngs(puntos.map((p) => [p.lat, p.lng, 1] as L.HeatLatLngTuple))
    poner(recorrido, modo === 'ruta')
  }, [puntos, modo])

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
      // No se usa `zoomToShowLayer`: deja avisos pendientes que, tras rearmar las
      // capas, se disparan sobre marcadores ya borrados y rompen el mapa.
      // El plugin dibuja los marcadores cuando termina de moverse y animarse: se reintenta
      // unos instantes. Se busca el marcador de nuevo en cada intento porque las capas
      // pueden haberse rearmado mientras tanto (por ejemplo, al reiniciarse los filtros
      // al llegar desde la lista), y se corta si el enfoque cambio o el mapa se cerro.
      const id = enfocar
      let intentos = 0
      const abrir = () => {
        if (enfocado.current !== id || !mapa.current) return
        const actual = marcadores.current.get(id)
        const capaActual = capa.current
        if (!actual || !capaActual) return
        // Si el marcador ya esta dibujado (solo, o porque se desplego su grupo), se abre.
        if (actual.getElement()) {
          actual.openPopup()
          return
        }
        // Sigue agrupado con otros en el mismo lugar: se despliega el grupo. Si el plugin
        // esta en plena animacion lo ignora, por eso se vuelve a pedir en cada intento
        // (si ya esta desplegado, no hace nada).
        const visible = capaActual.getVisibleParent(actual)
        if (visible && visible !== actual && visible.getElement()) (visible as L.MarkerCluster).spiderfy()
        if (++intentos < 20) temporizador.current = setTimeout(abrir, 100)
      }
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(abrir, 80)
    } else if (!enfocar && enfocado.current) {
      enfocado.current = null
      encuadrarTodo()
    } else if (cambioLista && !enfocar) {
      // (con un punto enfocado no se reencuadra: se quedaria alejado del punto)
      encuadrarTodo()
    }
  }, [puntos, enfocar])

  return <div ref={contenedor} className={cn('z-0 h-[65vh] min-h-80 w-full rounded-lg border border-border', className)} />
}

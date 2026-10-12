/**
 * Ubicacion del dispositivo para los informes de visita.
 *
 * El primer dato que entrega el celular suele ser aproximado (antenas o Wi-Fi, con cientos de
 * metros de error) y el GPS tarda unos segundos en afinar. Por eso no se toma la primera lectura:
 * se escucha el GPS y se guarda la mejor, hasta que baje del objetivo o se acabe la espera.
 */

export interface Ubicacion {
  lat: number
  lng: number
  /** Radio de error estimado, en metros. */
  precision: number
  fuente: 'GPS' | 'red'
}

/** Hasta aca (metros) se considera buena y se corta la espera. */
export const PRECISION_OBJETIVO = 20
/** Mas que esto no alcanza para ubicar un local: se avisa y no se pisa la ubicacion del cliente. */
export const PRECISION_MALA = 100
/** Cuanto se espera como maximo a que el GPS afine, si ya hay alguna lectura. */
export const ESPERA_MAXIMA_MS = 20_000

const MENSAJE_GEO: Record<number, string> = {
  1: 'Permiso de ubicación denegado.',
  2: 'No se pudo determinar la ubicación. Salí a un lugar abierto y tocá Reintentar.',
  3: 'Se agotó el tiempo buscando la ubicación. Tocá Reintentar.',
}

export class ErrorUbicacion extends Error {
  denegado: boolean
  constructor(mensaje: string, denegado: boolean) {
    super(mensaje)
    this.denegado = denegado
  }
}

/** De dos lecturas, la de menor radio de error. */
export function mejorDe(actual: Ubicacion | null, nueva: Ubicacion): Ubicacion {
  return actual && actual.precision <= nueva.precision ? actual : nueva
}

function aUbicacion(p: GeolocationPosition, fuente: Ubicacion['fuente']): Ubicacion {
  return { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy), fuente }
}

function pedirPosicion(alta: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: alta, timeout: alta ? 30_000 : 20_000, maximumAge: 0 }),
  )
}

/**
 * Busca la mejor ubicacion. `alAfinar` avisa la precision de cada mejora (para mostrarla mientras
 * se espera). Si no llega ninguna lectura de GPS, cae a la ubicacion por red. `cancelar` corta la
 * busqueda y deja la promesa sin resolver (quien la llama ya no la espera).
 */
export function buscarUbicacion(alAfinar?: (precision: number) => void): { resultado: Promise<Ubicacion>; cancelar: () => void } {
  let cancelar = () => {}
  const resultado = new Promise<Ubicacion>((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este dispositivo no permite obtener la ubicación.'))
    let mejor: Ubicacion | null = null
    let terminado = false
    let vigilia: number | null = null
    let limite: ReturnType<typeof setTimeout> | undefined

    const terminar = (accion: () => void) => {
      if (terminado) return
      terminado = true
      if (vigilia !== null) navigator.geolocation.clearWatch(vigilia)
      clearTimeout(limite)
      accion()
    }
    cancelar = () => terminar(() => {})

    vigilia = navigator.geolocation.watchPosition(
      (p) => {
        mejor = mejorDe(mejor, aUbicacion(p, 'GPS'))
        alAfinar?.(mejor.precision)
        if (mejor.precision <= PRECISION_OBJETIVO) terminar(() => resolve(mejor!))
      },
      (e) => {
        if (e.code === 1) return terminar(() => reject(new ErrorUbicacion(MENSAJE_GEO[1], true)))
        if (mejor) return // ya hay una lectura: se sigue esperando que mejore hasta el limite
        // Sin ninguna lectura de GPS: respaldo por red (menos precisa, pero casi siempre disponible bajo techo).
        terminar(() => {
          pedirPosicion(false).then(
            (p) => resolve(aUbicacion(p, 'red')),
            (e2: GeolocationPositionError) => reject(new ErrorUbicacion(MENSAJE_GEO[e2.code] ?? MENSAJE_GEO[2], e2.code === 1)),
          )
        })
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    )
    limite = setTimeout(() => {
      if (mejor) terminar(() => resolve(mejor!))
    }, ESPERA_MAXIMA_MS)
  })
  return { resultado, cancelar: () => cancelar() }
}

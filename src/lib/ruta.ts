/** Recorrido de un vendedor en un dia: distancias entre sus visitas. */

export interface Coordenada {
  lat: number
  lng: number
}

/**
 * De una lista de dias (aaaa-mm-dd) con visitas, el mas cercano a `desde` hacia atras
 * (`sentido` -1) o hacia adelante (1), sin contar `desde`. null si no hay.
 */
export function diaConVisitas(dias: string[], desde: string, sentido: 1 | -1): string | null {
  let mejor: string | null = null
  for (const d of dias) {
    if (sentido === 1 ? d > desde && (mejor === null || d < mejor) : d < desde && (mejor === null || d > mejor)) mejor = d
  }
  return mejor
}

const RADIO_TIERRA_KM = 6371

/** Distancia en linea recta (km) entre dos coordenadas (haversine). */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h))
}

/** Suma de los tramos entre puntos consecutivos, en el orden dado. */
export function largoRutaKm(puntos: Coordenada[]): number {
  let total = 0
  for (let i = 1; i < puntos.length; i++) total += distanciaKm(puntos[i - 1], puntos[i])
  return total
}

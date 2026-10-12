import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarUbicacion, ESPERA_MAXIMA_MS, mejorDe, type Ubicacion } from './ubicacion'

const u = (precision: number, lat = -27.15): Ubicacion => ({ lat, lng: -56.23, precision, fuente: 'GPS' })

describe('mejorDe', () => {
  it('toma la primera lectura si no hay otra', () => {
    expect(mejorDe(null, u(480)).precision).toBe(480)
  })
  it('se queda con la de menor radio de error', () => {
    expect(mejorDe(u(480), u(12)).precision).toBe(12)
    expect(mejorDe(u(12), u(480)).precision).toBe(12)
  })
  it('ante un empate conserva la anterior', () => {
    expect(mejorDe(u(30, -1), u(30, -2)).lat).toBe(-1)
  })
})

describe('buscarUbicacion', () => {
  type Ok = (p: GeolocationPosition) => void
  type Fallo = (e: GeolocationPositionError) => void
  const pos = (accuracy: number, latitude = -27.15317) => ({ coords: { latitude, longitude: -56.23356, accuracy } }) as GeolocationPosition
  const fallo = (code: number) => ({ code }) as GeolocationPositionError

  /** GPS simulado: guarda los callbacks para emitir lecturas a mano. */
  function gps(respaldo?: (ok: Ok, err: Fallo) => void) {
    const g = { ok: (() => {}) as Ok, err: (() => {}) as Fallo, cortes: 0 }
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (ok: Ok, err: Fallo) => {
          g.ok = ok
          g.err = err
          return 7
        },
        clearWatch: () => g.cortes++,
        getCurrentPosition: (ok: Ok, err: Fallo) => respaldo?.(ok, err),
      },
    })
    return g
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('no se queda con la lectura aproximada: espera la fina y corta apenas la tiene', async () => {
    const g = gps()
    const avisos: number[] = []
    const { resultado } = buscarUbicacion((p) => avisos.push(p))
    g.ok(pos(480))
    g.ok(pos(200))
    g.ok(pos(15))
    const u = await resultado
    expect(u.precision).toBe(15)
    expect(avisos).toEqual([480, 200, 15])
    expect(g.cortes).toBe(1)
  })

  it('si el GPS no baja del objetivo, al acabarse la espera usa la mejor lectura', async () => {
    const g = gps()
    const { resultado } = buscarUbicacion()
    g.ok(pos(480))
    g.ok(pos(90))
    g.ok(pos(300))
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS)
    expect((await resultado).precision).toBe(90)
  })

  it('el permiso denegado se informa como tal', async () => {
    const g = gps()
    const { resultado } = buscarUbicacion()
    g.err(fallo(1))
    await expect(resultado).rejects.toMatchObject({ denegado: true })
  })

  it('sin ninguna lectura de GPS cae a la ubicacion por red', async () => {
    const g = gps((ok) => ok(pos(900)))
    const { resultado } = buscarUbicacion()
    g.err(fallo(2))
    const u = await resultado
    expect(u).toMatchObject({ fuente: 'red', precision: 900 })
  })

  it('un error tras tener una lectura no la descarta', async () => {
    const g = gps()
    const { resultado } = buscarUbicacion()
    g.ok(pos(60))
    g.err(fallo(3))
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS)
    expect((await resultado).precision).toBe(60)
  })

  it('cancelar corta la escucha del GPS', () => {
    const g = gps()
    const { cancelar } = buscarUbicacion()
    cancelar()
    expect(g.cortes).toBe(1)
  })
})

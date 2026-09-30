import { useEffect, useSyncExternalStore } from 'react'

/**
 * Cache en memoria de una tabla entera, compartida por todas las pantallas
 * que la usan.
 *
 * Reemplaza al cache en localStorage + polling de revisiones de la app
 * original: al entrar a una pantalla se muestra lo ultimo que se tenia al
 * instante y se vuelve a pedir a la base por detras ("stale while
 * revalidate"). Despues de guardar algo, quien guardo llama a `refetch()`.
 *
 * Vive fuera de React (con `useSyncExternalStore`) para que cambiar de
 * pestana no descarte lo ya cargado. `resetearRecursos()` lo vacia al cerrar
 * sesion: si no, la proxima persona que entre en el mismo dispositivo veria
 * por un instante los datos de la anterior.
 */

export interface EstadoRecurso<T> {
  data: T[]
  /** true solo mientras NO hay nada que mostrar todavia. */
  loading: boolean
  /** true mientras se revalida por detras, con datos ya a la vista. */
  actualizando: boolean
  error: string | null
  cargadoEn: number | null
}

const INICIAL: EstadoRecurso<never> = {
  data: [],
  loading: true,
  actualizando: false,
  error: null,
  cargadoEn: null,
}

/** Si lo que hay tiene menos de esto, montar una pantalla no vuelve a pedirlo. */
const FRESCO_MS = 15_000

const registro = new Set<() => void>()

export function resetearRecursos(): void {
  registro.forEach((reset) => reset())
}

export function crearRecurso<T>(cargar: () => Promise<T[]>, mensajeError: string) {
  let estado: EstadoRecurso<T> = INICIAL
  let enCurso: Promise<void> | null = null
  let generacion = 0
  const suscriptores = new Set<() => void>()

  function set(parcial: Partial<EstadoRecurso<T>>) {
    estado = { ...estado, ...parcial }
    suscriptores.forEach((f) => f())
  }

  function refetch(): Promise<void> {
    if (enCurso) return enCurso
    const gen = generacion
    set(estado.cargadoEn ? { actualizando: true } : { loading: true, error: null })
    enCurso = (async () => {
      try {
        const data = await cargar()
        if (gen !== generacion) return
        set({ data, loading: false, actualizando: false, error: null, cargadoEn: Date.now() })
      } catch (e) {
        if (gen !== generacion) return
        console.error(mensajeError, e)
        set({ loading: false, actualizando: false, error: mensajeError })
      } finally {
        enCurso = null
      }
    })()
    return enCurso
  }

  registro.add(() => {
    generacion++
    enCurso = null
    set(INICIAL)
  })

  function suscribir(f: () => void) {
    suscriptores.add(f)
    return () => {
      suscriptores.delete(f)
    }
  }

  function useRecurso() {
    const s = useSyncExternalStore(suscribir, () => estado)
    useEffect(() => {
      if (!estado.cargadoEn || Date.now() - estado.cargadoEn > FRESCO_MS) refetch()
    }, [])
    return { ...s, refetch }
  }

  return { useRecurso, refetch, get: () => estado.data }
}

/**
 * PostgREST devuelve como maximo 1000 filas por consulta: esto pide de a
 * paginas hasta traer todo. `consulta` recibe el rango (inclusive).
 */
export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000
  const todo: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw error
    todo.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return todo
}

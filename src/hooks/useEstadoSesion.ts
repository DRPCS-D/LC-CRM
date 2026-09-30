import { useEffect, useState } from 'react'
import { claveLocal } from '@/lib/app'

/**
 * useState que sobrevive a cambiar de pantalla y volver (filtros, orden y
 * pagina de una tabla), guardado en sessionStorage: se pierde al cerrar la
 * pestana, que es lo esperable para un filtro.
 */
export function useEstadoSesion<T extends object>(clave: string, inicial: T) {
  const k = claveLocal(clave)
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = sessionStorage.getItem(k)
      return guardado ? { ...inicial, ...JSON.parse(guardado) } : inicial
    } catch {
      return inicial
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(k, JSON.stringify(valor))
    } catch {
      /* sin sessionStorage el filtro simplemente no se recuerda */
    }
  }, [k, valor])

  return [valor, setValor] as const
}

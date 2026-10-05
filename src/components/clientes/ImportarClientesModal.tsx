import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Modal } from '@/components/ui/modal'
import { mensajeDeError } from '@/hooks/useDatos'
import { compararClientes, descargarPlantilla, leerExcel, type Resultado } from '@/lib/clientesImport'
import type { Cliente } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const LOTE = 200

function trozos<T>(a: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
}

/**
 * Importar clientes desde un Excel. Paso 1: arrastrar o elegir el archivo.
 * Paso 2: resumen de lo que va a pasar (nuevos, a actualizar, sin cambios,
 * errores) y confirmar. Solo lo ve el admin: la RLS de `clientes` ya impide
 * escribir a los demas, esto solo evita ofrecer lo que va a fallar.
 */
export function ImportarClientesModal({
  abierto,
  clientes,
  onCerrar,
  onImportado,
}: {
  abierto: boolean
  clientes: Cliente[]
  onCerrar: () => void
  onImportado: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nombre, setNombre] = useState('')
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)

  function reiniciar() {
    setNombre('')
    setResultados(null)
    setError(null)
  }

  function cerrar() {
    if (guardando) return
    reiniciar()
    onCerrar()
  }

  async function cargar(archivo: File | undefined) {
    if (!archivo) return
    reiniciar()
    setNombre(archivo.name)
    setLeyendo(true)
    try {
      const lectura = await leerExcel(archivo)
      if ('error' in lectura) setError(lectura.error)
      else if (lectura.filas.length === 0) setError('El archivo no tiene clientes para importar.')
      else setResultados(compararClientes(lectura.filas, clientes, lectura.columnas))
    } catch {
      setError('No se pudo leer el archivo.')
    } finally {
      setLeyendo(false)
    }
  }

  const nuevos = resultados?.filter((r) => r.tipo === 'nuevo') ?? []
  const cambios = resultados?.filter((r) => r.tipo === 'actualizar') ?? []
  const iguales = resultados?.filter((r) => r.tipo === 'sin-cambios') ?? []
  const errores = resultados?.filter((r) => r.tipo === 'error') ?? []
  const hayQueGuardar = nuevos.length + cambios.length > 0

  async function importar() {
    setGuardando(true)
    setError(null)
    try {
      for (const t of trozos(nuevos, LOTE)) {
        const { error: e } = await supabase.from('clientes').insert(t.map((r) => r.datos))
        if (e) throw e
      }
      for (const t of trozos(cambios, LOTE)) {
        const { error: e } = await supabase
          .from('clientes')
          .upsert(t.map((r) => ({ id: r.id, ...r.datos })), { onConflict: 'id' })
        if (e) throw e
      }
      toast.success(`Importación lista: ${nuevos.length} nuevos y ${cambios.length} actualizados.`)
      onImportado()
      reiniciar()
      onCerrar()
    } catch (e) {
      // Lo que ya se guardo queda guardado: al reintentar, esos clientes ya existen y salen como "sin cambios".
      setError(mensajeDeError(e as Parameters<typeof mensajeDeError>[0], 'No se pudo completar la importación.') + ' Lo que ya se había guardado se mantiene; podés volver a intentar.')
      onImportado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Importar clientes"
      descripcion="Subí un Excel con el listado. Si el código ya existe se actualizan sus datos; si no, se crea."
      onCerrar={cerrar}
      ancho="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          {resultados && (
            <Button onClick={importar} disabled={!hayQueGuardar || guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Upload />}
              {guardando ? 'Importando…' : `Importar ${nuevos.length + cambios.length}`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            void cargar(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            void cargar(e.dataTransfer.files?.[0])
          }}
          disabled={leyendo || guardando}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/25 bg-accent/40 px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/60',
            arrastrando && 'border-primary bg-accent/60',
          )}
        >
          {leyendo ? (
            <>
              <Loader2 className="size-7 animate-spin" />
              Leyendo el archivo…
            </>
          ) : (
            <>
              <FileSpreadsheet className="size-7" />
              <span className="font-medium text-foreground">{nombre || 'Arrastrá el Excel acá o tocá para elegirlo'}</span>
              <span className="text-xs">{nombre ? 'Tocá para elegir otro archivo' : 'Archivo .xlsx, hasta 5 MB'}</span>
            </>
          )}
        </button>

        <Button variant="ghost" size="sm" onClick={() => void descargarPlantilla()} className="-ml-2">
          <Download /> Descargar plantilla de ejemplo
        </Button>

        {error && <ErrorBox mensaje={error} />}

        {resultados && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Dato titulo="Nuevos" valor={nuevos.length} />
              <Dato titulo="A actualizar" valor={cambios.length} />
              <Dato titulo="Sin cambios" valor={iguales.length} />
              <Dato titulo="Con errores" valor={errores.length} tono={errores.length ? 'error' : undefined} />
            </div>

            {errores.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="mb-1 font-medium text-destructive">Estas filas no se importan:</p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-foreground">
                  {errores.map((r) => (
                    <li key={r.fila}>
                      Fila {r.fila}
                      {r.codigo ? ` (código ${r.codigo})` : ''}: {r.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {cambios.length > 0 && (
              <details className="rounded-md border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Ver qué se va a actualizar ({cambios.length})</summary>
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {cambios.map((r) => (
                    <li key={r.id}>
                      <span className="font-medium text-foreground">{r.datos.codigo}</span> · {r.datos.razon_social} — cambia {r.cambios.join(', ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {!hayQueGuardar && !errores.length && <p className="text-sm text-muted-foreground">No hay nada para cambiar: todos los clientes del archivo ya están al día.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Dato({ titulo, valor, tono }: { titulo: string; valor: number; tono?: 'error' }) {
  return (
    <div className={cn('rounded-md border px-3 py-2', tono === 'error' ? 'border-destructive/40' : 'border-border')}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn('text-lg font-semibold', tono === 'error' && 'text-destructive')}>{valor}</p>
    </div>
  )
}

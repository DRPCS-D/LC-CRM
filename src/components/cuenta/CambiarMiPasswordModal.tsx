import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch, supabase } from '@/lib/supabase'

/** Cualquier usuario logueado cambia su propia contrasena, sin depender del administrador. */
export function CambiarMiPasswordModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const { usuario } = useAuth()

  useEffect(() => {
    if (abierto) {
      setPassword('')
      setConfirmacion('')
      setError(null)
    }
  }, [abierto])

  async function onGuardar() {
    if (password.length < 6) return setError('Mínimo 6 caracteres.')
    if (password !== confirmacion) return setError('Las contraseñas no coinciden.')

    setGuardando(true)
    setError(null)
    try {
      await apiFetch('/api/cuenta/password', { password })

      // Supabase cierra las sesiones abiertas al cambiar la contrasena desde
      // el servidor, incluida esta: sin volver a entrar, el JWT sigue sirviendo
      // para PostgREST pero /api contesta "No autenticado" en todo. Se inicia
      // sesion de nuevo con la clave nueva para que la persona no lo note.
      if (usuario) {
        const { error: errSesion } = await supabase.auth.signInWithPassword({
          email: usuario.email,
          password,
        })
        if (errSesion) await supabase.auth.signOut()
      }

      toast.success('Contraseña actualizada')
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar mi contraseña"
      onCerrar={onCerrar}
      ancho="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cambiar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nueva contraseña" hint="Mínimo 6 caracteres">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Repetir contraseña">
          <Input type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}

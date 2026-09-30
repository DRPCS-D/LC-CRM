import { ClienteSelector } from '@/components/ClienteSelector'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import type { Cliente } from '@/lib/database.types'
import { TIPOS_PEDIDO } from '@/lib/database.types'
import { formatMilesInput, sinAcentos } from '@/lib/format'
import type { CampoPedido, FormPedido } from '@/lib/pedidoForm'
import { cn } from '@/lib/utils'

const rojo = 'border-destructive ring-1 ring-destructive'

/**
 * Los campos del pedido. Se normalizan mientras se escribe, como en la app
 * original: Marca en mayusculas y sin tildes, montos con separador de miles,
 * Observaciones sin tildes.
 */
export function PedidoCampos({
  form,
  clientes,
  onCambiar,
  invalidos = [],
  avisoOrden,
}: {
  form: FormPedido
  clientes: Cliente[]
  onCambiar: (parcial: Partial<FormPedido>) => void
  invalidos?: CampoPedido[]
  /** Advertencia debajo de N° Orden (p. ej. "ya existe"). */
  avisoOrden?: string
}) {
  const malo = (c: CampoPedido) => invalidos.includes(c)

  return (
    <div className="space-y-4">
      <Field label="Cliente *">
        <ClienteSelector
          clientes={clientes}
          valor={form.cliente}
          onCambiar={(cliente) => onCambiar({ cliente })}
          invalido={malo('cliente')}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="N° Orden *" warning={avisoOrden}>
          <Input
            inputMode="numeric"
            value={form.nroOrden}
            onChange={(e) => onCambiar({ nroOrden: e.target.value })}
            className={cn(malo('nroOrden') && rojo)}
            autoComplete="off"
          />
        </Field>
        <Field label="Tipo *">
          <Select
            value={form.tipo}
            onChange={(e) => onCambiar({ tipo: e.target.value as FormPedido['tipo'] })}
            className={cn(malo('tipo') && rojo)}
          >
            <option value="">Elegir…</option>
            {TIPOS_PEDIDO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Marca *">
        <Input
          value={form.marca}
          onChange={(e) => onCambiar({ marca: sinAcentos(e.target.value).toUpperCase() })}
          className={cn(malo('marca') && rojo)}
          autoComplete="off"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total pares *">
          <Input
            inputMode="numeric"
            value={form.pares}
            onChange={(e) => onCambiar({ pares: formatMilesInput(e.target.value) })}
            className={cn('tabular', malo('pares') && rojo)}
            autoComplete="off"
          />
        </Field>
        <Field label="Total precio (Gs.) *">
          <Input
            inputMode="numeric"
            value={form.precio}
            onChange={(e) => onCambiar({ precio: formatMilesInput(e.target.value) })}
            className={cn('tabular', malo('precio') && rojo)}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Observaciones">
        <Textarea
          value={form.obs}
          onChange={(e) => onCambiar({ obs: sinAcentos(e.target.value) })}
        />
      </Field>
    </div>
  )
}

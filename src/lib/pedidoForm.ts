import type { Cliente, Pedido, PedidoInput, TipoPedido } from './database.types'
import { esMontoValido, formatMiles, parseEntero, sinAcentos } from './format'

/**
 * Estado y validacion del formulario de pedido, compartido por "Nuevo
 * pedido" y "Editar pedido" (las mismas reglas en los dos).
 */
export interface FormPedido {
  cliente: Cliente | null
  nroOrden: string
  tipo: TipoPedido | ''
  marca: string
  pares: string
  precio: string
  obs: string
}

export const FORM_VACIO: FormPedido = {
  cliente: null,
  nroOrden: '',
  tipo: '',
  marca: '',
  pares: '',
  precio: '',
  obs: '',
}

export type CampoPedido = 'cliente' | 'nroOrden' | 'tipo' | 'marca' | 'pares' | 'precio'

const ETIQUETA: Record<CampoPedido, string> = {
  cliente: 'Cliente',
  nroOrden: 'N° Orden',
  tipo: 'Tipo',
  marca: 'Marca',
  pares: 'Total Pares',
  precio: 'Total Precio',
}

export interface ResultadoValidacion {
  /** Campos a marcar en rojo. */
  invalidos: CampoPedido[]
  /** Mensaje para el toast, o null si todo esta bien. */
  mensaje: string | null
}

export function validarPedido(f: FormPedido): ResultadoValidacion {
  const faltan: CampoPedido[] = []
  if (!f.cliente) faltan.push('cliente')
  if (!f.nroOrden.trim()) faltan.push('nroOrden')
  if (!f.tipo) faltan.push('tipo')
  if (!f.marca.trim()) faltan.push('marca')
  if (!f.pares.trim()) faltan.push('pares')
  if (!f.precio.trim()) faltan.push('precio')
  if (faltan.length > 0) {
    return {
      invalidos: faltan,
      mensaje: `Campos obligatorios: ${faltan.map((c) => ETIQUETA[c]).join(', ')}`,
    }
  }

  const malos: CampoPedido[] = []
  if (!esMontoValido(f.nroOrden)) malos.push('nroOrden')
  if (!esMontoValido(f.pares)) malos.push('pares')
  if (!esMontoValido(f.precio)) malos.push('precio')
  if (malos.length > 0) {
    return {
      invalidos: malos,
      mensaje: `Revisa ${malos.map((c) => ETIQUETA[c]).join(', ')}: tiene que ser un numero mayor a 0.`,
    }
  }
  return { invalidos: [], mensaje: null }
}

/** Del formulario validado a lo que se manda a la base (sin foto: esa la agrega quien guarda). */
export function aPayload(f: FormPedido): Omit<PedidoInput, 'imagen_path'> {
  return {
    cliente_id: f.cliente!.id,
    nro_orden: f.nroOrden.trim(),
    tipo: f.tipo as TipoPedido,
    marca: sinAcentos(f.marca).toUpperCase().trim(),
    total_pares: parseEntero(f.pares),
    total_precio: parseEntero(f.precio),
    obs: sinAcentos(f.obs).trim() || null,
  }
}

export function formDePedido(p: Pedido, clientes: Cliente[]): FormPedido {
  return {
    cliente: clientes.find((c) => c.id === p.cliente_id) ?? null,
    nroOrden: p.nro_orden,
    tipo: p.tipo ?? '',
    marca: p.marca ?? '',
    pares: p.total_pares === null ? '' : formatMiles(p.total_pares),
    precio: p.total_precio === null ? '' : formatMiles(p.total_precio),
    obs: p.obs ?? '',
  }
}

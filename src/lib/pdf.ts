import type { Informe, Pedido } from './database.types'
import { autorDe } from './database.types'
import { formatFechaHora, formatGs, formatMiles, marcaDeTiempo } from './format'

/**
 * Exportacion a PDF de los listados (informes y pedidos). jsPDF y su plugin de tablas se
 * cargan recien al exportar (pesan ~300 KB y casi nadie exporta).
 */
const BORDO: [number, number, number] = [138, 27, 26]

export async function informesPDF(informes: Informe[]): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setTextColor(...BORDO)
  doc.text('LA COSTA S.R.L. · Informes de visitas', 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(`Generado el ${formatFechaHora(new Date().toISOString())}`, 14, 22)
  doc.text(`Visitas: ${informes.length}`, 14, 27)

  autoTable(doc, {
    startY: 32,
    head: [['Fecha', 'Cliente', 'Ciudad', 'Zona', 'Comentario', 'Usuario']],
    body: informes.map((i) => [
      formatFechaHora(i.created_at),
      i.cliente_nombre ?? '',
      i.ciudad ?? '',
      i.zona ?? '',
      i.comentario ?? '',
      autorDe(i),
    ]),
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: BORDO, textColor: 255 },
    columnStyles: { 0: { cellWidth: 26 }, 4: { cellWidth: 55 } },
    rowPageBreak: 'avoid',
  })

  doc.save(`informes_${marcaDeTiempo()}.pdf`)
}

export async function pedidosPDF(pedidos: Pedido[]): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pares = pedidos.reduce((s, p) => s + (p.total_pares ?? 0), 0)
  const total = pedidos.reduce((s, p) => s + (p.total_precio ?? 0), 0)

  doc.setFontSize(14)
  doc.setTextColor(...BORDO)
  doc.text('LA COSTA S.R.L. · Pedidos', 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(`Generado el ${formatFechaHora(new Date().toISOString())}`, 14, 22)
  doc.text(`Pedidos: ${formatMiles(pedidos.length)} · Pares: ${formatMiles(pares)} · Total: ${formatGs(total)}`, 14, 27)

  autoTable(doc, {
    startY: 32,
    head: [['N° Orden', 'Fecha', 'Cliente', 'Ciudad', 'Tipo', 'Marca', 'Pares', 'Total', 'Usuario']],
    body: pedidos.map((p) => [
      p.nro_orden ?? '',
      formatFechaHora(p.created_at),
      p.cliente_nombre ?? '',
      p.ciudad ?? '',
      p.tipo ?? '',
      p.marca ?? '',
      p.total_pares == null ? '' : formatMiles(p.total_pares),
      formatGs(p.total_precio),
      autorDe(p),
    ]),
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: BORDO, textColor: 255 },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' } },
    rowPageBreak: 'avoid',
  })

  doc.save(`pedidos_${marcaDeTiempo()}.pdf`)
}

import type { Informe } from './database.types'
import { autorDe } from './database.types'
import { formatFechaHora, marcaDeTiempo } from './format'

/**
 * Exportacion a PDF del listado de informes. jsPDF y su plugin de tablas se
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

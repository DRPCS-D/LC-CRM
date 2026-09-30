/**
 * Escapa texto para meterlo en HTML armado a mano (los popups de Leaflet y
 * el area de impresion del reporte). Todo lo que venga de la base pasa por
 * aca: un comentario con `<script>` no puede ejecutarse.
 */
export function escaparHtml(texto: string | null | undefined): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

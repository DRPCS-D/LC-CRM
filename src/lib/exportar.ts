/**
 * Exportacion a CSV pensada para abrirse con doble clic en Excel en
 * espanol: separador `;` (con `,` Excel lo toma como decimal y pone todo en
 * una columna) y BOM UTF-8 (sin eso, las tildes salen rotas).
 */

type Celda = string | number | null | undefined

function escapar(valor: Celda): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function armarCSV(filas: Celda[][]): string {
  return filas.map((f) => f.map(escapar).join(';')).join('\r\n')
}

export function descargarArchivo(nombre: string, contenido: BlobPart, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function descargarCSV(nombre: string, filas: Celda[][]): void {
  descargarArchivo(nombre, '﻿' + armarCSV(filas), 'text/csv;charset=utf-8')
}

// Genera el logo SVG y los PNG de iconos de la PWA. Se corre a mano cuando
// el logo cambia (no es parte del build normal):
//
//   npm install --no-save sharp
//   npm run iconos
//
// Para rebrandear una app hecha sobre esta base: cambiar `colorPrimario` en
// app.config.json (de donde sale tambien el theme-color de index.html y del
// manifest, asi que no se pueden desincronizar), el GLYPH de aca, y volver a
// correrlo.
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const { colorPrimario: PRIMARY } = JSON.parse(readFileSync('app.config.json', 'utf-8'))

// glyph: las iniciales "LC" (LA COSTA) en blanco. Coordenadas pensadas
// para un viewBox de 100x100, con el contenido dentro del 80% central para
// respetar el "safe zone" de los iconos maskable. Van como trazos y no como
// <text> para no depender de las fuentes instaladas donde se corra.
const GLYPH = `
  <path d="M24 30 v40 h22" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M78 36 a17 17 0 1 0 0 28" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
`.trim()

function svg({ rounded }) {
  const bg = rounded
    ? `<rect width="100" height="100" rx="22" fill="${PRIMARY}"/>`
    : `<rect width="100" height="100" fill="${PRIMARY}"/>`
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${bg}${GLYPH}</svg>`
}

const SVG_ROUNDED = svg({ rounded: true })
// El maskable se recorta con la forma que quiera cada sistema operativo:
// va sin esquinas redondeadas propias para que no queden dos curvas.
const SVG_SQUARE = svg({ rounded: false })

mkdirSync('public/icons', { recursive: true })

writeFileSync('public/logo.svg', SVG_ROUNDED)
writeFileSync('public/favicon.svg', SVG_ROUNDED)

const trabajos = [
  { svg: SVG_ROUNDED, size: 32, out: 'public/favicon-32.png' },
  { svg: SVG_ROUNDED, size: 180, out: 'public/icons/apple-touch-icon.png' },
  { svg: SVG_ROUNDED, size: 192, out: 'public/icons/icon-192.png' },
  { svg: SVG_ROUNDED, size: 512, out: 'public/icons/icon-512.png' },
  { svg: SVG_SQUARE, size: 512, out: 'public/icons/icon-512-maskable.png' },
]

for (const t of trabajos) {
  await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toFile(t.out)
  console.log('OK', t.out)
}

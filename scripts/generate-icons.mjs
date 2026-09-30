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

// glyph: el logo "LC" de LA COSTA (logo original: viewBox 341.89 x 158.37),
// en blanco y centrado. Se escala a 64 unidades de ancho dentro del viewBox
// de 100x100: las esquinas del logo quedan a ~35 unidades del centro, dentro
// del "safe zone" circular (radio 40) de los iconos maskable, que cada sistema
// operativo recorta con la forma que quiera.
const LOGO_W = 341.89
const LOGO_H = 158.37
const ANCHO = 64
const ESCALA = ANCHO / LOGO_W
const GLYPH = `
  <g transform="translate(${((100 - ANCHO) / 2).toFixed(3)} ${((100 - LOGO_H * ESCALA) / 2).toFixed(3)}) scale(${ESCALA.toFixed(5)})" fill="#ffffff" fill-rule="evenodd">
    <path d="M341.39,158.37l-127.92-.48c-11.66-.03-21.64-3.93-29.93-11.89-8.3-7.94-12.46-18.03-12.41-30.45l.25-71.91c0-11.63,4.42-21.49,13.04-29.75,8.71-8.19,18.55-12.26,29.56-12.26l127.92.53-.1,27.91-127.92-.48c-3.65,0-7.05,1.4-10.23,4.25-3.2,2.9-4.79,6.14-4.79,9.91l-.2,71.94c-.03,9.26,4.93,13.98,14.91,14.02l127.91.42-.08,28.22Z"/>
    <path d="M150.24,156.79l-107.93-.43c-11.66-.04-21.65-4.03-29.92-11.89C4.1,136.55-.07,126.43,0,114.07L.34,0l27.45.09-.31,114.09c-.06,9.29,4.93,13.99,14.91,13.99l107.94.4-.09,28.21Z"/>
  </g>
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

import { exigeUsuario } from '../_lib/auth.js'
import { conManejoDeErrores, error, exigeMetodo, leerBody, type ApiHandler } from '../_lib/http.js'

/**
 * Lee la foto de una orden de compra con OpenAI Vision y devuelve los campos
 * del encabezado para precargar el formulario del pedido.
 *
 * Existe en el servidor por una sola razon: la OPENAI_API_KEY no puede
 * llegar al navegador. No guarda nada; la foto la sube despues el propio
 * cliente a Storage al confirmar el pedido.
 *
 * La imagen llega ya comprimida (1600 px, JPEG) desde el navegador: el
 * limite de cuerpo de Vercel es de 4.5 MB y el original de un celular lo
 * supera con facilidad.
 *
 * El prompt es el de la app de Apps Script original (Images.gs), sin
 * cambios: esta afinado para el formulario de pedido de LA COSTA.
 */

const MODELO = process.env.OPENAI_MODEL || 'gpt-4o'
const MIMES = ['image/jpeg', 'image/png', 'image/webp']

const PROMPT = `Analiza esta imagen de un formulario de pedido de calzado y extrae los campos del encabezado.
Devuelve SOLO un objeto JSON válido con exactamente estas claves (sin texto adicional, sin markdown):
{
  "cliente": "",
  "nroOrden": "",
  "marca": "",
  "totalPares": "",
  "totalPrecio": "",
  "obs": ""
}

Reglas:
- "nroOrden": número impreso en grande en el encabezado (ej: "0011504")
- "totalPares": número de la última fila numérica de la columna CATN/PARES (suma total)
- "totalPrecio": valor monetario total en la esquina inferior derecha (ej: "7.063.000")
- "marca": valor del campo MARCA al pie del formulario
- "obs": texto del campo OBS al pie del formulario (notas manuscritas). Incluí también cualquier anotación adicional escrita en el cuerpo del pedido (ej: "enviado por foto"). Si no hay nada legible, cadena vacía.
- Si un campo no es legible o no existe, usa cadena vacía ""`

const CLAVES = ['cliente', 'nroOrden', 'marca', 'totalPares', 'totalPrecio', 'obs'] as const
type Extraido = Record<(typeof CLAVES)[number], string>

interface Body {
  base64?: string
  mime?: string
}

interface RespuestaOpenAI {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

/** Se queda solo con las claves esperadas, siempre como string. */
function limpiar(crudo: unknown): Extraido {
  const obj = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  const salida = {} as Extraido
  for (const clave of CLAVES) {
    const v = obj[clave]
    salida[clave] = v === null || v === undefined ? '' : String(v).trim()
  }
  return salida
}

const handler: ApiHandler = async (req, res) => {
  if (!exigeMetodo(req, res, 'POST')) return

  const actor = await exigeUsuario(req, res)
  if (!actor) return

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return error(res, 500, 'Falta configurar OPENAI_API_KEY en el servidor.')

  const { base64, mime } = leerBody<Body>(req)
  if (!base64) return error(res, 400, 'Falta la imagen.')
  if (!mime || !MIMES.includes(mime)) return error(res, 400, 'Formato de imagen no soportado.')

  const respuesta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 2500,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  })

  const json = (await respuesta.json().catch(() => ({}))) as RespuestaOpenAI
  if (!respuesta.ok || json.error) {
    console.error('OpenAI', respuesta.status, json.error?.message)
    return error(res, 502, 'No se pudo leer la imagen. Proba de nuevo o completa los datos a mano.')
  }

  const contenido = (json.choices?.[0]?.message?.content ?? '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  let datos: Extraido
  try {
    datos = limpiar(JSON.parse(contenido))
  } catch {
    return error(res, 502, 'La lectura de la imagen no devolvio datos validos. Completa los datos a mano.')
  }

  res.status(200).json({ data: datos })
}

export default conManejoDeErrores(handler)

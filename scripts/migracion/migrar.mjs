/**
 * Migracion del Google Sheet a Supabase. Se puede correr varias veces: salta lo que ya esta cargado.
 *
 *   python scripts/migracion/exportar.py          # genera migracion/datos.json
 *   node scripts/migracion/migrar.mjs usuarios    # cuentas + avatares (genera migracion/contrasenas.txt)
 *   node scripts/migracion/migrar.mjs clientes
 *   node scripts/migracion/migrar.mjs informes
 *   node scripts/migracion/migrar.mjs pedidos     # lo lento: baja las fotos de Drive y las comprime
 *   node scripts/migracion/migrar.mjs fotos       # reintenta las fotos que fallaron
 *   node scripts/migracion/migrar.mjs verificar
 *
 * Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env y `npm i --no-save sharp`.
 * IMPORTANTE: los triggers `pedidos_completar` e `informes_completar` tienen que estar
 * DESACTIVADOS durante la carga (si no, pisan la copia del cliente que trae el Sheet);
 * se reactivan al terminar.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import sharp from 'sharp'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')

const datos = JSON.parse(readFileSync('migracion/datos.json', 'utf8'))
const LOG = 'migracion/log.txt'
const log = (...a) => {
  const l = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`
  console.log(l)
  appendFileSync(LOG, l + '\n')
}

// Decision del dueno: todos vendedores salvo diago (admin); despues reasigna a mano.
const ROL_FINAL = (u) => (u.username === 'diago' ? 'admin' : 'vendedor')
const OMITIR = new Set(['usuario']) // cuenta de prueba
const ZONA = '-03:00' // hora de Asuncion
const ts = (s) => (s ? `${s.replace(' ', 'T')}${ZONA}` : null)
const nombreDe = (username) => username.charAt(0).toUpperCase() + username.slice(1)

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function rest(path, { method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 400)}`)
  return method === 'GET' ? r.json() : null
}
async function todas(tabla, columnas) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=${columnas}&order=created_at.asc,id.asc`, {
      headers: { ...H, Range: `${desde}-${desde + 999}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`GET ${tabla} -> ${r.status} ${await r.text()}`)
    const f = await r.json()
    out.push(...f)
    if (f.length < 1000) return out
  }
}
const trozos = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function bajar(url, intentos = 4) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' })
      const tipo = r.headers.get('content-type') || ''
      if (r.ok && tipo.startsWith('image/')) return Buffer.from(await r.arrayBuffer())
      if (i === intentos) throw new Error(`Drive devolvio ${r.status} ${tipo}`)
    } catch (e) {
      if (i === intentos) throw e
    }
    await dormir(1000 * i)
  }
}

async function subir(bucket, path, buffer) {
  const r = await fetch(`${URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: buffer,
  })
  if (!r.ok) throw new Error(`storage ${bucket}/${path} -> ${r.status} ${await r.text()}`)
}

// ───────────────────────────── usuarios ─────────────────────────────
async function usuarios() {
  const existentes = new Map((await rest('usuarios?select=id,username,foto_path')).map((u) => [u.username, u]))
  const authList = await (await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, { headers: H })).json()
  const authPorEmail = new Map((authList.users ?? []).map((u) => [u.email, u.id]))
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const nueva = () => Array.from({ length: 10 }, () => alfabeto[randomInt(alfabeto.length)]).join('')

  for (const u of datos.usuarios) {
    if (OMITIR.has(u.username)) { log('omitido', u.username); continue }
    const email = `${u.username}@lc-crm.local`
    let id = existentes.get(u.username)?.id ?? authPorEmail.get(email)
    if (!id) {
      const password = nueva()
      const r = await fetch(`${URL}/auth/v1/admin/users`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
      if (!r.ok) throw new Error(`crear ${u.username}: ${r.status} ${await r.text()}`)
      id = (await r.json()).id
      appendFileSync('migracion/contrasenas.txt', `${u.username}\t${password}\t${ROL_FINAL(u)}\n`)
      log('cuenta creada', u.username)
    }
    if (!existentes.has(u.username)) {
      await rest('usuarios', {
        method: 'POST',
        body: { id, username: u.username, nombre: nombreDe(u.username), email, rol: ROL_FINAL(u), activo: u.activo, created_at: ts(u.creado) ?? undefined },
      })
      existentes.set(u.username, { id, username: u.username, foto_path: null })
    }
    // avatar
    const ya = existentes.get(u.username)
    if (u.foto_url && !ya.foto_path) {
      try {
        const buf = await bajar(u.foto_url)
        const jpg = await sharp(buf).rotate().resize(300, 300, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()
        const path = `${id}/${Date.now()}.jpg`
        await subir('avatares', path, jpg)
        await rest(`usuarios?id=eq.${id}`, { method: 'PATCH', body: { foto_path: path } })
        log('avatar', u.username)
      } catch (e) {
        log('AVATAR FALLO', u.username, e.message)
      }
    }
  }
  log('usuarios listo')
}

// ───────────────────────────── clientes ─────────────────────────────
async function clientes() {
  const hay = new Set((await todas('clientes', 'codigo,created_at,id')).map((c) => c.codigo.toLowerCase()))
  const filas = datos.clientes.filter((c) => !hay.has(c.codigo.toLowerCase()))
  for (const t of trozos(filas, 200)) await rest('clientes', { method: 'POST', body: t })
  log('clientes insertados', filas.length, 'de', datos.clientes.length)
}

async function mapas() {
  const cl = await todas('clientes', 'id,codigo,razon_social,created_at')
  const us = await rest('usuarios?select=id,username')
  return {
    porCodigo: new Map(cl.map((c) => [c.codigo.toLowerCase(), c.id])),
    porNombre: new Map(cl.map((c) => [c.razon_social.trim().toLowerCase(), c.id])),
    usuario: new Map(us.map((u) => [u.username, u.id])),
  }
}
const clienteId = (m, codigo, nombre) =>
  (codigo && m.porCodigo.get(codigo.toLowerCase())) || (nombre && m.porNombre.get(nombre.trim().toLowerCase())) || null

// ───────────────────────────── informes ─────────────────────────────
async function informes() {
  const m = await mapas()
  const hay = new Set((await todas('informes', 'legacy_id,created_at,id')).map((i) => i.legacy_id))
  const filas = datos.informes.filter((i) => !hay.has(i.legacy_id)).map((i) => ({
    legacy_id: i.legacy_id,
    created_at: ts(i.creado),
    cliente_id: clienteId(m, i.cliente_codigo, i.cliente_nombre),
    cliente_nombre: i.cliente_nombre,
    cliente_codigo: i.cliente_codigo,
    ciudad: i.ciudad,
    zona: i.zona,
    comentario: i.comentario,
    lat: i.lat,
    lng: i.lng,
    usuario_id: m.usuario.get(i.usuario) ?? null,
    legacy_usuario: i.usuario,
  }))
  for (const t of trozos(filas, 200)) await rest('informes', { method: 'POST', body: t })
  log('informes insertados', filas.length, 'de', datos.informes.length, '| sin cliente:', filas.filter((f) => !f.cliente_id).length)
}

// ───────────────────────────── pedidos ─────────────────────────────
async function procesarFoto(p, usuarioId) {
  const buf = await bajar(`https://drive.google.com/uc?export=download&id=${p.imagen_drive}`)
  let salida = buf
  if (buf.length > 450_000) {
    salida = await sharp(buf).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  }
  const path = `${usuarioId ?? 'sin-usuario'}/${p.legacy_id}.jpg`
  await subir('pedidos', path, salida)
  return { path, antes: buf.length, despues: salida.length }
}

async function pedidos() {
  const m = await mapas()
  const hay = new Set((await todas('pedidos', 'legacy_id,created_at,id')).map((p) => p.legacy_id))
  const pendientes = datos.pedidos.filter((p) => !hay.has(p.legacy_id))
  log('pedidos pendientes', pendientes.length)
  let hechos = 0, bytesAntes = 0, bytesDespues = 0
  const fallos = []
  const CONCURRENCIA = 4
  for (const lote of trozos(pendientes, 20)) {
    const filas = []
    for (const grupo of trozos(lote, CONCURRENCIA)) {
      const res = await Promise.all(grupo.map(async (p) => {
        const usuarioId = m.usuario.get(p.usuario) ?? null
        let imagen_path = null
        try {
          if (p.imagen_drive) {
            const r = await procesarFoto(p, usuarioId)
            imagen_path = r.path; bytesAntes += r.antes; bytesDespues += r.despues
          }
        } catch (e) {
          fallos.push(`${p.legacy_id} ${p.imagen_drive}: ${e.message}`)
          log('FOTO FALLO', p.legacy_id, e.message)
        }
        return {
          legacy_id: p.legacy_id,
          created_at: ts(p.creado),
          cliente_id: clienteId(m, p.cliente_codigo, p.cliente_nombre),
          cliente_nombre: p.cliente_nombre,
          cliente_codigo: p.cliente_codigo,
          ciudad: p.ciudad,
          zona: p.zona,
          nro_orden: p.nro_orden,
          tipo: p.tipo,
          marca: p.marca,
          total_pares: p.total_pares,
          total_precio: p.total_precio,
          obs: p.obs,
          imagen_path,
          usuario_id: usuarioId,
          ruc: p.ruc,
          nro_pedido: p.nro_pedido,
          entrega: p.entrega,
          direccion: p.direccion,
          forma_pago: p.forma_pago,
          legacy_usuario: p.usuario,
          legacy_imagen: p.imagen_drive,
        }
      }))
      filas.push(...res)
    }
    await rest('pedidos', { method: 'POST', body: filas })
    hechos += filas.length
    log(`pedidos ${hechos}/${pendientes.length} | fotos ${(bytesAntes / 1e6).toFixed(0)} MB -> ${(bytesDespues / 1e6).toFixed(0)} MB`)
  }
  if (fallos.length) writeFileSync('migracion/fotos-fallidas.txt', fallos.join('\n'))
  log('pedidos listo. fotos fallidas:', fallos.length)
}

// Reintenta las fotos que fallaron (pedidos con legacy_imagen pero sin imagen_path).
async function fotos() {
  const sin = await rest('pedidos?select=id,legacy_id,legacy_imagen,usuario_id&imagen_path=is.null&legacy_imagen=not.is.null')
  log('fotos pendientes', sin.length)
  for (const p of sin) {
    try {
      const r = await procesarFoto({ legacy_id: p.legacy_id, imagen_drive: p.legacy_imagen }, p.usuario_id)
      await rest(`pedidos?id=eq.${p.id}`, { method: 'PATCH', body: { imagen_path: r.path } })
      log('foto ok', p.legacy_id)
    } catch (e) {
      log('FOTO FALLO', p.legacy_id, e.message.slice(0, 120))
    }
  }
}

// ───────────────────────────── verificar ─────────────────────────────
async function verificar() {
  const cuenta = async (t, f = '') => {
    const r = await fetch(`${URL}/rest/v1/${t}?select=id${f}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' } })
    return Number(r.headers.get('content-range').split('/')[1])
  }
  log('usuarios', await cuenta('usuarios'), '| clientes', await cuenta('clientes'), 'de', datos.clientes.length)
  log('informes', await cuenta('informes'), 'de', datos.informes.length, '| sin cliente', await cuenta('informes', '&cliente_id=is.null'))
  log('pedidos', await cuenta('pedidos'), 'de', datos.pedidos.length, '| sin foto', await cuenta('pedidos', '&imagen_path=is.null'), '| sin cliente', await cuenta('pedidos', '&cliente_id=is.null'), '| sin usuario', await cuenta('pedidos', '&usuario_id=is.null'))
}

const pasos = { usuarios, clientes, informes, pedidos, fotos, verificar }
const paso = process.argv[2]
if (!pasos[paso]) throw new Error(`Paso desconocido: ${paso}. Usar: ${Object.keys(pasos).join(' | ')}`)
await pasos[paso]()

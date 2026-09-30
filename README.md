# LC CRM

Pedidos, visitas a clientes y reportes de **LA COSTA S.R.L.** (mayorista de
calzado, Paraguay). Reemplaza a la app de Google Apps Script + Sheets
("Mayorista APP"): mismas funciones, sobre Supabase y Vercel, instalable
como PWA.

**Stack:** React + TypeScript + Vite · Tailwind v4 · React Router · Supabase
(Postgres + Auth + Storage) · Vercel Serverless Functions · OpenAI Vision.

## Que hace

| Seccion | Para que sirve |
| --- | --- |
| **Pedidos › Nuevo** | Se saca o sube la foto de una orden de compra (JPG, PNG, HEIC o PDF). OpenAI lee el encabezado y llena el formulario; se elige el cliente de la lista, se revisa y se guarda. Un PDF de varias paginas es una cola: un pedido por pagina. |
| **Pedidos › Pedidos** | Lista con busqueda, filtros, orden, KPIs, alerta de N° de orden duplicados y export a CSV. |
| **Informes** | Visita a un cliente con ubicacion GPS obligatoria. Lista (PDF/CSV) y mapa con la cara de cada vendedor. |
| **Clientes** | Listado, historial de compras por cliente y mapa con "como llegar". |
| **Reportes** | Totales, evolucion mensual, rankings y torta por vendedor. Exporta a PDF y CSV. |
| **Usuarios** | Altas, roles, foto y activacion de cuentas. |

## Roles

Tres niveles globales (`usuarios.rol`), aplicados por RLS en Postgres:

| Rol | Antes | Puede |
| --- | --- | --- |
| `admin` | Admin | Todo: edita y borra pedidos, informes y clientes; gestiona usuarios. |
| `supervisor` | AdminL | Ve todo (pedidos, informes, reportes, usuarios). No edita ni borra. |
| `vendedor` | User | Carga pedidos e informes y ve solo los suyos. De los clientes ve el total general de compras. |

Un admin puede nombrar a otro admin, pero **no puede sacarse a si mismo**:
ni bajarse de rol, ni desactivarse, ni borrar su cuenta.

Se inicia sesion con **nombre de usuario**, no con email. Por dentro cada
cuenta tiene un email interno `<usuario>@lc-crm.local` que nadie ve (lo arman
`src/lib/usuario.ts` y `api/admin/usuarios.ts`).

## Puesta en marcha

### 1. Supabase

El proyecto **LC-CRM** (`pxnzbicstomvdwugmuuv`, region `sa-east-1`) ya esta
creado y con las migraciones `001` a `005` aplicadas. Para rehacerlo en otro
proyecto, correr `supabase/migrations/*.sql` en orden (SQL Editor, o
`npx supabase db push`). `003_admin.sql` crea el primer admin y necesita que
el usuario exista antes en Authentication.

Las cuentas iniciales (un `admin` y tres de prueba) estan en
`credenciales.local.json`, que **no se sube a git**. Cambiar la contrasena del
admin desde la app (icono de la llave) y borrar las cuentas `prueba.*` antes de
usar el sistema de verdad.

### 2. Variables de entorno

Copiar `.env.example` a `.env` (local) y cargar las mismas en **Vercel →
Settings → Environment Variables**:

| Variable | Donde sale | Va al navegador |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API | si |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API (publishable / anon) | si |
| `SUPABASE_URL` | la misma URL | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (secret / service_role) | **no, nunca** |
| `OPENAI_API_KEY` | platform.openai.com | **no, nunca** |
| `OPENAI_MODEL` | opcional, por defecto `gpt-4o` | no |

Si a una de las dos claves secretas se le pone el prefijo `VITE_`, queda
publicada dentro del bundle y cualquiera puede leer y escribir toda la base.

### 3. Correr en local

```bash
npm install
npm run dev
```

`npm run dev` sirve solo el frontend. Las funciones de `/api` (crear usuarios,
leer la foto con OpenAI) necesitan correr con `vercel dev`, o probarse ya
desplegadas.

### 4. Deploy en Vercel

Importar el repositorio: Vercel detecta Vite. `vercel.json` reescribe todo
hacia `index.html` **menos** `/api/*`, y le da 60 s a la funcion que llama a
OpenAI.

## Que va en `/api` y que no

Solo lo que necesita un secreto del servidor:

- `api/admin/usuarios.ts` — crear, editar, borrar cuentas y cambiar contrasenas
  (tocan `auth.users` y el bucket de avatares). Solo admin.
- `api/cuenta/password.ts` — cada persona cambia su propia contrasena.
- `api/pedidos/extraer.ts` — lee la foto con OpenAI (la clave no puede llegar
  al navegador). Devuelve `{cliente, nroOrden, marca, totalPares, totalPrecio, obs}`;
  el prompt es el de la app original, sin cambios.

Todo lo demas va directo del navegador a PostgREST, protegido por RLS.

## Datos

```
usuarios ─┬─< pedidos  ──> clientes
          └─< informes ──> clientes
```

- `pedidos` e `informes` guardan una **copia** del nombre, codigo, ciudad y
  zona del cliente al momento de cargarse: renombrar un cliente no reescribe
  el historial. El autor, la fecha y esa copia los pone un trigger, nunca el
  navegador.
- Montos en Guaranies como `bigint` (sin decimales); fechas como `timestamptz`,
  mostradas en hora de Asuncion.
- Las fotos de pedidos van al bucket privado `pedidos` (URLs firmadas); los
  avatares, al bucket publico `avatares`.
- Columnas `legacy_*` y las que la app ya no captura (`ruc`, `nro_pedido`,
  `entrega`, `direccion`, `forma_pago`) existen para la migracion desde el Sheet.

## Tests

```bash
npm test             # vitest: formato, montos, fechas y calculos de reportes
npm run db:start     # Postgres local (necesita Docker Desktop)
npm run db:test      # pgTAP: la RLS probada contra Postgres de verdad
```

`supabase/tests/rls_test.sql` siembra seis personas (admin, supervisor, dos
vendedores, un vendedor desactivado y un admin desactivado) y prueba, para cada
tabla, que ve y que puede escribir cada una.

## PWA y versionado

Instalable (manifest + service worker). Los assets con hash se sirven
cache-first; HTML, `/api` y Supabase siempre van a la red, para que los datos
nunca queden viejos. **Hacer una release es un solo paso**: subir `"version"`
en `package.json` y desplegar.

## Comandos

```bash
npm run dev          # servidor de vite
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm test             # vitest
npm run iconos       # regenera logo e iconos (necesita `npm i --no-save sharp`)
```

## Pendiente: migracion desde el Sheet

Importar clientes, pedidos e informes del Google Sheet, con el mapeo
`Usuario` → `usuario_id` y las fotos de Drive → Storage. Los usuarios se
recrean con contrasena nueva (las viejas son SHA-256 sin sal y no se pueden
llevar a Supabase Auth).

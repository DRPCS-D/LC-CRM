# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Que es esto

LC CRM: pedidos (con lectura de la foto por OpenAI), visitas a clientes con
GPS y reportes de LA COSTA S.R.L. Reemplaza a una app de Apps Script + Google
Sheets. Se construyo sobre una base generica (login, usuarios, roles, tema,
PWA) a la que se le agrego el dominio. Ver [README.md](README.md) para la
explicacion a nivel producto, las variables de entorno y el deploy.

## Comandos

```bash
npm run dev              # servidor de vite
npm run build            # tsc -b && vite build
npm run lint             # oxlint
npm test                 # vitest run (una vez)
npm run test:watch       # vitest (watch)
npx vitest run src/lib/format.test.ts   # un solo archivo de test

npm run db:start         # Postgres + Auth + Studio local via Docker; aplica supabase/migrations/*.sql
npm run db:test          # corre supabase/tests/*.sql (pgTAP) contra la base local — necesita db:start antes
npx supabase test db supabase/tests/rls_test.sql   # un solo archivo pgTAP
npm run db:reset         # reaplica las migraciones desde cero en la base local
npm run db:stop          # apaga el stack local
```

Los `db:*` necesitan Docker Desktop corriendo. La CLI de Supabase esta
pinneada como devDependency (no se asume instalada global), asi que estos
comandos resuelven siempre la misma version.

## Arquitectura

### Tres niveles, los tres globales

`usuarios` cuelga de `auth.users` (comparten el `id`). `rol` vale `'admin'`,
`'supervisor'` o `'vendedor'` (antes Admin, AdminL y User en el Sheet). No hay
tenants ni roles por seccion.

- `admin` — todo: edita y borra pedidos, informes y clientes, y gestiona
  personas.
- `supervisor` — ve todo, no escribe nada.
- `vendedor` — carga pedidos e informes y ve solo los suyos.

Los helpers `security definer` viven en el esquema `private` (no `public`,
para que PostgREST no los exponga como RPC): `es_admin()`, `ve_todo()` (admin
o supervisor) y `esta_activo()`. Los tres exigen `activo`: una cuenta dada de
baja pierde el acceso aunque su rol diga otra cosa. Revocarles `execute` a
`authenticated` rompe la evaluacion de la RLS por completo.

Un admin **puede** nombrar a otro admin, a proposito, pero **no puede sacarse
a si mismo**: el `with check` de la policy de update exige que, si la fila es la
propia, siga saliendo `rol = 'admin' and activo`. Eliminar la propia cuenta lo
corta `/api`.

`activo = false` es la baja: la cuenta sigue en Auth y hasta puede iniciar
sesion, pero la RLS deja de devolverle filas y `AppLayout` muestra "cuenta
desactivada". Se prefiere a borrar porque borrar deja los pedidos sin autor.

**Se inicia sesion con `username`.** El email de Auth es uno interno,
`<username>@lc-crm.local`; `emailDeUsername()` (`src/lib/usuario.ts`) y
`api/admin/usuarios.ts` tienen cada uno su copia del dominio: si cambia, hay que
cambiarlo en los dos.

### El dominio (`supabase/migrations/004_dominio.sql`)

`clientes`, `pedidos` e `informes`. Reglas que no se ven leyendo solo el
frontend:

- **Autor, fecha y copia del cliente los pone un trigger**
  (`completar_registro_dominio`), nunca el navegador. Con sesion, `usuario_id`
  sale de `auth.uid()` y `created_at` de `now()`; en un update no cambian. Sin
  sesion (service_role: el script de migracion) se respetan los valores que
  vengan, asi se puede conservar el historial del Sheet.
- `cliente_nombre/codigo`, `ciudad` y `zona` de pedidos e informes son una
  **foto** del cliente al guardar; renombrar un cliente no reescribe el pasado.
- `pedidos.nro_orden` conserva los ceros ("0011504"); `nro_orden_norm` (columna
  generada, solo digitos y sin ceros) es la que sirve para detectar duplicados.
  Un duplicado avisa pero se puede guardar.
- `idempotency_key` reemplaza la deduplicacion de 120 s de Apps Script: el
  navegador genera una clave por intento de guardado y un reintento tras un
  timeout choca con el unique en vez de duplicar. `NuevoPedido` ademas
  reutiliza la foto ya subida en el reintento.
- Un informe se guarda con la RPC `guardar_informe()` y no con un insert, porque
  un vendedor no puede escribir en `clientes` pero su visita si tiene que
  actualizar la ubicacion del cliente (`security definer`). La ubicacion de un
  informe no se edita nunca: solo `cliente_id` y `comentario` tienen grant.
- `total_global_cliente()` devuelve la suma de compras de un cliente entre todos
  los vendedores, sin exponer los pedidos ajenos.
- Fotos: bucket privado `pedidos` (URLs firmadas, `src/lib/fotos.ts`) y bucket
  publico `avatares` (solo escribe `/api`). Al reemplazar o borrar un pedido hay
  que borrar su objeto de Storage; la base no lo hace sola.

### Los grants por columna no son un detalle

**Antes de conceder hay que revocar.** En Supabase las tablas nuevas de
`public` nacen con `ALL` para `authenticated`; sin un `revoke all ... from
authenticated` previo, un `grant update (col)` no restringe nada. Esto ya mordio
una vez y lo atrapo `rls_test.sql`.

`usuarios` tiene `grant update (rol, activo) ... to authenticated` y nada
mas: ni insert, ni delete, ni update de `nombre`/`username`/`email`/`foto_path`. No es redundante
con la RLS, resuelve algo que la RLS no puede expresar bien — que un admin
puede cambiar el rol de alguien desde el navegador, pero no su email, porque
el username es el login (vive tambien en `auth.users`) y cambiarlo solo en el
perfil dejaria a la persona viendo un usuario con el que no puede entrar.

Si en el futuro hay que permitir editar otra columna desde el cliente, hay
que acordarse de agregarla a ese grant: la policy sola no alcanza.

### `/api` existe solo para lo que necesita la service_role key

Las funciones serverless de Vercel bajo `api/` existen unicamente para lo que
necesita un secreto del servidor: operaciones sobre `auth.users` o el bucket de
avatares (`admin/usuarios.ts`, `cuenta/password.ts`) y la llamada a OpenAI
(`pedidos/extraer.ts`, porque `OPENAI_API_KEY` no puede llegar al navegador).
Todo lo demas — pedidos, informes, clientes, cambiar el rol, activar/desactivar
— va directo del cliente a PostgREST, protegido por la RLS. Antes de agregar un endpoint, conviene preguntarse si no alcanza con
una policy.

Los endpoints nunca confian en el rol que manda el cliente: derivan la
identidad del actor del lado del servidor con `usuarioAutenticado()` (que
verifica el JWT contra Supabase, en `api/_lib/auth.ts`) y leen su rol de la
base. `exigeAdmin()` es la puerta de entrada de todo `api/admin/usuarios.ts`.

`crear` hace dos escrituras que tienen que pasar o fallar juntas (la cuenta
de Auth y el perfil): si la segunda falla, borra la primera. Sin eso queda
una cuenta de Auth huerfana que ademas bloquea ese email para siempre.

### La carrera de auth/perfil al montar (`src/hooks/useAuth.tsx`)

Al montar, `supabase.auth.getSession()` y el evento `INITIAL_SESSION` de
`onAuthStateChange` se disparan casi al mismo tiempo para el mismo usuario.
Un token monotonico (`cargaActual`, un ref) descarta el resultado de
cualquier carga de perfil que ya no sea la mas nueva, para que una carga
lenta y vieja no pueda pisar el `usuario` de una carga mas nueva con
`loading=false` y un fogonazo de "no hay sesion". Si se toca este archivo,
hay que preservar esa guarda — el bug que evita solo se reproduce entrando
por URL directa o con F5 (nunca navegando con los links, porque ahi el
provider ya esta montado), asi que es facil "arreglarlo" de una forma que lo
reintroduce en silencio.

`useAuth` tambien solo reacciona cuando el id de usuario cambia de verdad en
`onAuthStateChange`, no ante cualquier nombre de evento: Supabase revalida la
sesion al recuperar el foco de la pestana y puede disparar `SIGNED_IN` para
el mismo usuario de siempre. Ponerle `loading=true` a eso desmontaria el
`<Outlet>` de `AppLayout` y se perderia un formulario a medio llenar.

`rol` se expone como `null` si la cuenta esta desactivada, aunque la columna
siga diciendo `'admin'`: la RLS ya no le devuelve nada, y mostrarle las
pantallas de administracion seria mentirle.

### El nombre de la app esta en un solo lugar

`app.config.json` (nombre, descripcion, color) + el `name`/`version` de
`package.json` son la unica fuente de la identidad de la app. De ahi salen,
sin repetirse en ningun lado:

- `vite.config.ts` → el `define` de `__APP_NOMBRE__`/`__APP_ID__`/etc., que
  consume `src/lib/app.ts` (ningun componente escribe el nombre a mano).
- el plugin `marcaApp()` del mismo archivo → reemplaza los `%MARCA_*%` de
  `index.html` (titulo, metas, theme-color y la clave de localStorage del
  script que aplica el tema antes del primer pintado), sirve
  `/manifest.webmanifest` en dev y lo escribe a `dist/` en el build, y genera
  `dist/sw.js` desde `scripts/sw-template.js`.

El manifest **no** vive en `public/` a proposito: si estuviera ahi habria que
editarlo a mano en cada app nueva. El service worker tampoco, y ademas por
una segunda razon — Vite lo copiaria tal cual, sin la version inyectada, y el
nombre del cache no coincidiria con lo publicado.

Las claves de localStorage se arman con `claveLocal()` de `src/lib/app.ts`,
que les pone el `name` de `package.json` de prefijo: dos apps hechas sobre
esta base no se pisan aunque corran en el mismo dominio.

### Probar la RLS de verdad, no solo a traves de la app

`supabase/tests/rls_test.sql` es una suite pgTAP que siembra seis personas —
un admin, un supervisor, dos vendedores, un vendedor desactivado y un admin
desactivado — y, para cada aserto, se hace pasar por una persona especifica
fijando los GUC de Postgres de los que depende PostgREST antes de correr la
consulta bajo prueba:

```sql
select set_config('request.jwt.claim.sub', '<uuid-de-la-persona>', true);
set local role authenticated;   -- o `anon`
```

Esto hace que los tests corran exactamente el mismo mecanismo de
`auth.uid()` / rol por el que pasa el trafico real en produccion — no un mock
aparte. Al extender la suite hay tres casos que conviene no confundir,
porque el test pasaria igual pero por la razon equivocada:

- Un UPDATE/DELETE bloqueado por el `using` **no** tira error: Postgres
  afecta cero filas. Esos asertos hacen la escritura, `reset role;` para
  bypassear la RLS, y verifican que la fila no cambio.
- Un UPDATE que falla el `with check` (un admin tratando de degradarse a si
  mismo) **si** tira excepcion: van con `throws_ok` y codigo `42501`.
- Un update sobre una columna sin `grant` (`nombre`, `email`) tambien tira
  `42501`, pero de permisos — salta antes de evaluar la policy.

### Tema (`src/lib/tema.ts`, sin contexto de React)

Claro/oscuro (claro por defecto, sin modo "sistema") vive en un modulo plano con sus propios suscriptores,
leido via `useSyncExternalStore` (`src/hooks/useTema.ts`), porque el
interruptor aparece en layouts que nunca estan montados a la vez (`Login`,
`AppLayout`) y todos necesitan ver el mismo valor sin un provider comun
arriba. `index.html` trae un script inline que aplica la clase `.dark`
**antes** de que cargue el bundle, para evitar un fogonazo blanco; su clave
de localStorage la inyecta `marcaApp()` con el mismo valor que calcula
`claveLocal('tema')`, asi que no se pueden desincronizar.

### Versionado del service worker

El nombre del cache incluye el `name` + `version` de `package.json`
(`scripts/sw-template.js` tiene los marcadores
`__APP_NOMBRE__`/`__APP_VERSION__`). Subir el `version` de `package.json` es
el proceso de release completo; no hay un segundo archivo que mantener
sincronizado a mano.

### Tipos de la base escritos a mano (`src/lib/database.types.ts`)

Los tipos se escriben a mano en vez de generarse, para mantener uniones
afinadas (`Rol`, no `string`) y los comentarios inline. El costo de eso — que
una migracion que renombra una columna en silencio no rompe el build — esta
anotado en un comentario ahi mismo, junto con el arreglo (generar los tipos
reales con `npm run tipos` y agregar un chequeo que compare solo los nombres
de columna contra ellos) para cuando el esquema crezca.

## Al agregar cosas

- La UI **nunca** es el control de acceso. `RequiereVeTodo`, el `veTodo` del
  `NAV` y el `esAdmin` de los botones existen para no mostrarle a alguien una
  pantalla o accion que le va a fallar; lo que protege los datos es la policy.
- Toda tabla nueva arranca con `enable row level security` y su policy en la
  misma migracion, y `revoke all ... from anon, authenticated` antes de los
  grants. Una tabla con RLS y sin policy no devuelve nada, que es el modo
  correcto de fallar. Sumar su bloque en `supabase/tests/rls_test.sql`.
- Las tablas de datos (`useDatos.ts`) se cachean en memoria (`src/lib/recurso.ts`)
  y se vacian al cambiar de sesion: si se agrega una, crearla con
  `crearRecurso()` para que tambien se vacie. Despues de una escritura, llamar a
  su `refetch()`.
- `Mapa`, `Reportes` y la exportacion a PDF se cargan con `lazy`/`import()`
  porque pesan; no importarlos de forma estatica.
- Los modulos se enganchan en tres lugares: la ruta (`src/App.tsx`), el link
  (`NAV` en `AppLayout`) y la tarjeta (`MODULOS` en `Inicio`).
- Al tocar `rls_test.sql`, vaciar `request.jwt.claim.sub` antes de sembrar o
  verificar como superusuario (`reset role` no lo limpia).

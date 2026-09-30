-- ═══════════════════════════════════════════════════════════════════════════
-- rls_test.sql — La RLS probada contra Postgres de verdad
--
--   npm run db:start   # levanta la base local (necesita Docker Desktop)
--   npm run db:test    # corre este archivo
--
-- Cada aserto se hace pasar por una persona puntual fijando los mismos GUC
-- que fija PostgREST en produccion:
--
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
--   set local role authenticated;   -- o `anon`
--
-- Asi se ejercita exactamente el mecanismo real de `auth.uid()` y de rol de
-- Postgres, no un mock aparte.
--
-- Tres trampas a tener en cuenta al extender esta suite:
--
--   · Un UPDATE/DELETE bloqueado por el `using` de una policy NO tira error:
--     Postgres simplemente afecta cero filas. Esos casos hacen la escritura,
--     `reset role;` para bypassear la RLS, y verifican que la fila no cambio.
--   · Un UPDATE que falla el `with check` SI tira excepcion, y va con
--     `throws_ok`. Confundir los dos casos deja un test que pasa por la
--     razon equivocada.
--   · Un update sobre una columna sin `grant` (nombre, username, lat, lng)
--     tambien tira excepcion, pero de permisos, antes de llegar siquiera a la
--     policy.
--   · `reset role` NO limpia `request.jwt.claim.sub`: antes de sembrar o
--     verificar como superusuario hay que vaciarlo, si no los triggers que
--     usan auth.uid() creen que escribe la ultima persona simulada.
-- ═══════════════════════════════════════════════════════════════════════════

begin;
select plan(71);

create extension if not exists pgtap with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
--
--   ana   — admin
--   sofi  — supervisor
--   beto  — vendedor
--   caro  — otro vendedor (para probar que beto no la ve)
--   dani  — vendedor DESACTIVADO
--   eva   — admin DESACTIVADA (el rol no alcanza: tiene que estar activa)
--
-- `usuarios.id` referencia `auth.users`, asi que hay que sembrar las dos.
-- Solo se insertan `id` y `email` en auth.users: es lo minimo que pide la
-- fk. Si una version futura de GoTrue agrega una columna NOT NULL sin
-- default, este insert es el primero que va a fallar.
-- ─────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'caro@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'dani@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'eva@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'sofi@test.local');

insert into usuarios (id, username, nombre, email, rol, activo) values
  ('11111111-1111-1111-1111-111111111111', 'ana',  'Ana',  'ana@test.local',  'admin',      true),
  ('22222222-2222-2222-2222-222222222222', 'beto', 'Beto', 'beto@test.local', 'vendedor',   true),
  ('33333333-3333-3333-3333-333333333333', 'caro', 'Caro', 'caro@test.local', 'vendedor',   true),
  ('44444444-4444-4444-4444-444444444444', 'dani', 'Dani', 'dani@test.local', 'vendedor',   false),
  ('55555555-5555-5555-5555-555555555555', 'eva',  'Eva',  'eva@test.local',  'admin',      false),
  ('66666666-6666-6666-6666-666666666666', 'sofi', 'Sofi', 'sofi@test.local', 'supervisor', true);

-- Dominio: dos clientes y un pedido de Caro ya cargado. Se siembra como
-- superusuario y SIN sesion (el claim esta vacio), asi los triggers respetan
-- el autor que se les da.
insert into clientes (id, codigo, razon_social, ciudad, zona) values
  ('c1000000-0000-0000-0000-000000000001', 'C1', 'Cliente Uno', 'Asuncion', 'Centro'),
  ('c2000000-0000-0000-0000-000000000002', 'C2', 'Cliente Dos', 'Luque', 'Este');

insert into pedidos (id, cliente_id, nro_orden, tipo, marca, total_pares, total_precio, usuario_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', '0000100', 'STOCK', 'NIKE', 10, 1000, '33333333-3333-3333-3333-333333333333');

-- ═════════════════════════════════════════════════════════════
-- USUARIOS
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is((select count(*)::int from usuarios), 6, 'El admin ve a todas las personas del sistema');

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select is((select count(*)::int from usuarios), 6, 'El supervisor tambien ve a todas las personas');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*)::int from usuarios), 1, 'Un vendedor ve una sola fila');
select is((select username from usuarios), 'beto', 'Y esa fila es la suya');
select is((select count(*)::int from usuarios where id = '33333333-3333-3333-3333-333333333333'), 0, 'Un vendedor no ve a otro vendedor');
select is((select count(*)::int from usuarios where id = '11111111-1111-1111-1111-111111111111'), 0, 'Un vendedor tampoco ve al admin');

-- Ve su propia fila aunque este desactivado: es lo que le permite a la app
-- decirle "tu cuenta fue desactivada" en vez de dejarlo en una pantalla vacia.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*)::int from usuarios), 1, 'Un usuario desactivado sigue viendo su propia fila (para poder avisarle)');

-- Un admin desactivado deja de ser admin: `private.es_admin()` exige activo.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select is((select count(*)::int from usuarios), 1, 'Un admin desactivado pierde la vista de todos');
select ok(not private.es_admin(), 'private.es_admin() es false para un admin desactivado');

-- Sin sesion
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok('select count(*) from usuarios', '42501', null, 'anon no tiene ni permiso de select sobre usuarios');
reset role;

-- Escritura: un vendedor no gestiona a nadie. Su update no falla: la policy
-- no matchea ninguna fila y Postgres afecta cero. Se vuelve a superusuario y
-- se mira la fila.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
update usuarios set rol = 'admin' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is((select rol from usuarios where id = '22222222-2222-2222-2222-222222222222'), 'vendedor', 'Un vendedor no puede ascenderse a admin');

set local role authenticated;
update usuarios set activo = false where id = '33333333-3333-3333-3333-333333333333';
reset role;
select ok((select activo from usuarios where id = '33333333-3333-3333-3333-333333333333'), 'Un vendedor no puede desactivar a otro');

-- El supervisor ve a todos pero no toca a nadie
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
set local role authenticated;
update usuarios set rol = 'admin' where id = '33333333-3333-3333-3333-333333333333';
reset role;
select is((select rol from usuarios where id = '33333333-3333-3333-3333-333333333333'), 'vendedor', 'Un supervisor no puede cambiar el rol de nadie');

-- Escritura: el admin si gestiona
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
update usuarios set rol = 'admin' where id = '33333333-3333-3333-3333-333333333333';
reset role;
select is((select rol from usuarios where id = '33333333-3333-3333-3333-333333333333'), 'admin', 'El admin puede nombrar a otro admin');

set local role authenticated;
update usuarios set rol = 'vendedor' where id = '33333333-3333-3333-3333-333333333333';
reset role;
select is((select rol from usuarios where id = '33333333-3333-3333-3333-333333333333'), 'vendedor', 'Y puede volver a bajarlo a vendedor');

set local role authenticated;
update usuarios set activo = false where id = '22222222-2222-2222-2222-222222222222';
reset role;
select ok(not (select activo from usuarios where id = '22222222-2222-2222-2222-222222222222'), 'El admin puede desactivar una cuenta');

set local role authenticated;
update usuarios set activo = true where id = '22222222-2222-2222-2222-222222222222';
reset role;
select ok((select activo from usuarios where id = '22222222-2222-2222-2222-222222222222'), 'Y puede volver a activarla');

-- El admin no puede sacarse a si mismo. Estos dos SI tiran excepcion: el
-- `using` los deja pasar (es admin) y el que falla es el `with check`.
set local role authenticated;
select throws_ok($$update usuarios set rol = 'vendedor' where id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'El admin no puede bajarse el rol a si mismo');
select throws_ok($$update usuarios set activo = false where id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'El admin no puede desactivarse a si mismo');
select is((select rol from usuarios where id = '11111111-1111-1111-1111-111111111111'), 'admin', 'Y despues de los dos intentos sigue siendo admin');

-- Columnas sin grant: username, nombre, email y foto. No las bloquea una
-- policy sino el `grant update (rol, activo)`: el error es de permisos. Cambiar
-- el username o el email tiene que pasar por /api, que lo actualiza tambien
-- en auth.users; si se pudiera hacer solo aca, la persona quedaria con un
-- login que no puede usar.
select throws_ok($$update usuarios set nombre = 'Otro' where id = '22222222-2222-2222-2222-222222222222'$$, '42501', null, 'Ni el admin puede cambiar el nombre desde el cliente');
select throws_ok($$update usuarios set username = 'otro' where id = '22222222-2222-2222-2222-222222222222'$$, '42501', null, 'Ni el admin puede cambiar el username desde el cliente');

-- Alta y baja: tampoco desde el cliente
select throws_ok($$insert into usuarios (id, username, nombre, email) values ('77777777-7777-7777-7777-777777777777', 'fede', 'Fede', 'fede@test.local')$$, '42501', null, 'Nadie inserta usuarios desde el cliente');
select throws_ok($$delete from usuarios where id = '22222222-2222-2222-2222-222222222222'$$, '42501', null, 'Nadie borra usuarios desde el cliente');

-- Helpers de la RLS
select ok(private.es_admin(), 'private.es_admin() es true para el admin');
select ok(private.esta_activo(), 'private.esta_activo() es true para el admin');
select ok(private.ve_todo(), 'private.ve_todo() es true para el admin');

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select ok(not private.es_admin(), 'private.es_admin() es false para un supervisor');
select ok(private.ve_todo(), 'private.ve_todo() es true para un supervisor');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(not private.es_admin(), 'private.es_admin() es false para un vendedor');
select ok(private.esta_activo(), 'private.esta_activo() es true para un vendedor activo');
select ok(not private.ve_todo(), 'private.ve_todo() es false para un vendedor');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select ok(not private.esta_activo(), 'private.esta_activo() es false para un desactivado');

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select ok(not private.ve_todo(), 'private.ve_todo() es false para un admin desactivado');

-- ═════════════════════════════════════════════════════════════
-- CLIENTES
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*)::int from clientes), 2, 'Un vendedor ve todos los clientes');
select throws_ok($$insert into clientes (codigo, razon_social) values ('C9', 'Nuevo')$$, '42501', null, 'Un vendedor no crea clientes');

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select throws_ok($$insert into clientes (codigo, razon_social) values ('C9', 'Nuevo')$$, '42501', null, 'Un supervisor no crea clientes');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select lives_ok($$insert into clientes (codigo, razon_social) values ('C9', 'Nuevo')$$, 'El admin crea clientes');
select throws_ok($$insert into clientes (codigo, razon_social) values ('c9', 'Repetido')$$, '23505', null, 'El codigo de cliente es unico sin importar mayusculas');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*)::int from clientes), 0, 'Un desactivado no ve clientes');

-- ═════════════════════════════════════════════════════════════
-- PEDIDOS
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

-- Beto intenta firmar el pedido como Caro y ponerle otro nombre de cliente:
-- el trigger se queda con quien tiene la sesion y con los datos reales.
select lives_ok(
  $$insert into pedidos (id, cliente_id, nro_orden, tipo, marca, total_pares, total_precio, usuario_id, cliente_nombre)
    values ('a0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000001', '0011504', 'STOCK', 'ADIDAS', 20, 2000,
            '33333333-3333-3333-3333-333333333333', 'FALSO')$$,
  'Un vendedor carga un pedido'
);

select is((select count(*)::int from pedidos), 1, 'Un vendedor ve solo su pedido, no el de Caro');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select is((select count(*)::int from pedidos), 1, 'Y Caro ve solo el suyo');

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select is((select count(*)::int from pedidos), 2, 'El supervisor ve los pedidos de todos');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is((select count(*)::int from pedidos), 2, 'El admin ve los pedidos de todos');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select count(*)::int from pedidos), 0, 'Un desactivado no ve pedidos');

-- Lo que el trigger dejo guardado (se mira sin RLS y sin sesion)
reset role;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select usuario_id from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'El autor sale de la sesion, no de lo que mande el navegador'
);
select is(
  (select cliente_nombre from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'),
  'Cliente Uno',
  'Los datos del cliente los copia la base, no el navegador'
);
select is(
  (select nro_orden_norm from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'),
  '11504',
  'El N° de orden normalizado saca los ceros a la izquierda'
);

-- Edicion y borrado: solo el admin
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
update pedidos set marca = 'HACK' where id = 'a0000000-0000-0000-0000-00000000000b';
delete from pedidos where id = 'a0000000-0000-0000-0000-00000000000b';
reset role;
select is((select marca from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'), 'ADIDAS', 'Un vendedor no edita ni borra ni sus propios pedidos');

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
set local role authenticated;
update pedidos set marca = 'HACK' where id = 'a0000000-0000-0000-0000-00000000000b';
reset role;
select is((select marca from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'), 'ADIDAS', 'Un supervisor no edita pedidos');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
update pedidos set marca = 'PUMA', usuario_id = '11111111-1111-1111-1111-111111111111' where id = 'a0000000-0000-0000-0000-00000000000b';
reset role;
select is((select marca from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'), 'PUMA', 'El admin edita pedidos');
select is(
  (select usuario_id from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Y editar un pedido no le cambia el autor'
);

set local role authenticated;
delete from pedidos where id = 'a0000000-0000-0000-0000-00000000000b';
reset role;
select is((select count(*)::int from pedidos where id = 'a0000000-0000-0000-0000-00000000000b'), 0, 'El admin borra pedidos');

-- Sin cliente, desactivado, sin sesion
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
select throws_ok(
  $$insert into pedidos (nro_orden, tipo, marca) values ('1', 'STOCK', 'X')$$,
  '23502', null, 'No se puede cargar un pedido sin cliente'
);

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok(
  $$insert into pedidos (cliente_id, nro_orden) values ('c1000000-0000-0000-0000-000000000001', '1')$$,
  '42501', null, 'Un desactivado no carga pedidos'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok('select count(*) from pedidos', '42501', null, 'anon no lee pedidos');
reset role;

-- ═════════════════════════════════════════════════════════════
-- INFORMES (visitas)
-- ═════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select lives_ok(
  $$select guardar_informe('c1000000-0000-0000-0000-000000000001', 'Visita de prueba', -25.3, -57.6, true, 'b0000000-0000-0000-0000-00000000000b')$$,
  'Un vendedor guarda un informe con guardar_informe()'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select lat from clientes where id = 'c1000000-0000-0000-0000-000000000001'),
  -25.3::double precision,
  'El informe actualiza la ubicacion del cliente (aunque el vendedor no pueda editar clientes)'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
select guardar_informe('c1000000-0000-0000-0000-000000000001', 'Visita de prueba', -25.3, -57.6, true, 'b0000000-0000-0000-0000-00000000000b');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from informes), 1, 'Reintentar el mismo guardado (misma clave) no duplica el informe');
select is((select cliente_nombre from informes limit 1), 'Cliente Uno', 'El informe copia los datos del cliente');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
select is((select count(*)::int from informes), 1, 'Un vendedor ve su informe');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select is((select count(*)::int from informes), 0, 'Otro vendedor no lo ve');

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select is((select count(*)::int from informes), 1, 'El supervisor lo ve');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update informes set comentario = 'HACK';
reset role;
select is((select comentario from informes limit 1), 'Visita de prueba', 'Un vendedor no edita informes');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select lives_ok($$update informes set comentario = 'Corregido'$$, 'El admin edita el comentario');
select throws_ok($$update informes set lat = 0$$, '42501', null, 'Ni el admin puede cambiar la ubicacion de una visita');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok(
  $$select guardar_informe('c1000000-0000-0000-0000-000000000001', 'x', null, null, true, gen_random_uuid())$$,
  '23502', null, 'No se guarda un informe sin ubicacion'
);

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok(
  $$select guardar_informe('c1000000-0000-0000-0000-000000000001', 'x', -25.0, -57.0, true, gen_random_uuid())$$,
  '42501', null, 'Un desactivado no guarda informes'
);

-- ═════════════════════════════════════════════════════════════
-- total_global_cliente
-- ═════════════════════════════════════════════════════════════
-- Queda el pedido de Caro (1000). Beto no lo ve, pero si el total del cliente.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is(
  total_global_cliente('c1000000-0000-0000-0000-000000000001'),
  1000::bigint,
  'Un vendedor ve el total del cliente aunque incluya pedidos de otros'
);

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is(total_global_cliente('c1000000-0000-0000-0000-000000000001'), null::bigint, 'Un desactivado no ve ni el total');

reset role;
select * from finish();
rollback;

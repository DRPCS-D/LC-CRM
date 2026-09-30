-- ═══════════════════════════════════════════════════════════════════════════
-- 004_dominio.sql — Clientes, pedidos e informes de visita
--
--   clientes ─┬─< pedidos   (foto en el bucket `pedidos`, ver 005_storage.sql)
--             └─< informes  (visita con ubicacion GPS)
--   usuarios ─┬─< pedidos
--             └─< informes
--
-- Sale de las cuatro pestanas del Google Sheet de la app original
-- (Pedidos, Clientes, Usuarios, Informes). Las columnas `legacy_*` y las que
-- la app ya no captura (ruc, nro_pedido, entrega, direccion, forma_pago)
-- existen solo para que la migracion del Sheet no pierda nada.
--
-- Permisos (ver el final del archivo):
--   · vendedor   — ve e inserta SOLO lo suyo; clientes en lectura.
--   · supervisor — ve todo, no escribe nada.
--   · admin      — todo.
--
-- Lo que la app original decidia en el servidor se sigue decidiendo en el
-- servidor, con triggers: quien cargo el registro (`usuario_id`), cuando
-- (`created_at`) y la copia de los datos del cliente. El navegador no puede
-- falsificarlos aunque mande otra cosa.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- clientes
--
-- `codigo` es el identificador de negocio (texto libre, unico sin importar
-- mayusculas). La clave primaria es un uuid aparte para que cambiarle el
-- codigo a un cliente no rompa sus pedidos.
--
-- `lat`/`lng` los actualiza `guardar_informe()`: la ubicacion de un cliente
-- es la de su ultima visita (si quien la cargo no destildo la opcion).
-- ─────────────────────────────────────────────────────────────
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (length(trim(codigo)) > 0),
  razon_social text not null check (length(trim(razon_social)) >= 2),
  nombre_fantasia text,
  ciudad text,
  zona text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clientes_codigo_idx on clientes (lower(codigo));

drop trigger if exists clientes_updated_at on clientes;
create trigger clientes_updated_at
  before update on clientes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- pedidos
--
-- `cliente_nombre`, `cliente_codigo`, `ciudad` y `zona` son una FOTO del
-- cliente al momento de guardar (igual que en el Sheet): renombrar un
-- cliente no reescribe su historial. Las completa el trigger de abajo.
--
-- `nro_orden` se guarda tal cual (con ceros a la izquierda). Para detectar
-- duplicados se compara `nro_orden_norm`: solo digitos, sin ceros adelante.
--
-- `idempotency_key` reemplaza la deduplicacion de 120 s de Apps Script: el
-- navegador genera una por intento de guardado, y si reintenta tras un
-- timeout el segundo insert choca con el unique en vez de duplicar el pedido.
-- ─────────────────────────────────────────────────────────────
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  cliente_id uuid references clientes (id) on delete set null,
  cliente_nombre text,
  cliente_codigo text,
  ciudad text,
  zona text,

  nro_orden text not null,
  nro_orden_norm text generated always as (
    nullif(ltrim(regexp_replace(nro_orden, '\D', '', 'g'), '0'), '')
  ) stored,
  tipo text check (tipo in ('SHOW ROOM', 'STOCK', 'MALETEO')),
  marca text,
  total_pares integer check (total_pares >= 0),
  total_precio bigint check (total_precio >= 0),
  obs text,

  -- Ruta dentro del bucket `pedidos`.
  imagen_path text,

  usuario_id uuid references usuarios (id) on delete set null,

  idempotency_key uuid unique,

  -- Solo migracion desde el Sheet
  ruc text,
  nro_pedido text,
  entrega text,
  direccion text,
  forma_pago text,
  legacy_id text unique,
  legacy_usuario text,
  legacy_imagen text
);

create index if not exists pedidos_created_at_idx on pedidos (created_at desc);
create index if not exists pedidos_usuario_idx on pedidos (usuario_id);
create index if not exists pedidos_cliente_idx on pedidos (cliente_id);
create index if not exists pedidos_nro_orden_norm_idx on pedidos (nro_orden_norm);
create index if not exists pedidos_imagen_path_idx on pedidos (imagen_path);

drop trigger if exists pedidos_updated_at on pedidos;
create trigger pedidos_updated_at
  before update on pedidos
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- informes (visitas)
--
-- La ubicacion es obligatoria y no se edita despues: es la prueba de que la
-- visita ocurrio ahi. Un admin puede corregir el cliente y el comentario.
-- ─────────────────────────────────────────────────────────────
create table if not exists informes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  cliente_id uuid references clientes (id) on delete set null,
  cliente_nombre text,
  cliente_codigo text,
  ciudad text,
  zona text,

  comentario text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),

  usuario_id uuid references usuarios (id) on delete set null,

  idempotency_key uuid unique,

  legacy_id text unique,
  legacy_usuario text
);

create index if not exists informes_created_at_idx on informes (created_at desc);
create index if not exists informes_usuario_idx on informes (usuario_id);
create index if not exists informes_cliente_idx on informes (cliente_id);

drop trigger if exists informes_updated_at on informes;
create trigger informes_updated_at
  before update on informes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Datos que decide el servidor
--
-- Con sesion de usuario (auth.uid() no nulo) el autor y la fecha de carga
-- salen de la sesion y del reloj de la base, sin importar lo que mande el
-- navegador. Sin sesion (service_role, o sea el script de migracion) se
-- respetan los valores que vengan, para poder conservar el historial.
--
-- La foto del cliente se toma de `clientes` siempre que `cliente_id` cambie.
-- ─────────────────────────────────────────────────────────────
create or replace function public.completar_registro_dominio()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := (select auth.uid());
  cli clientes%rowtype;
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.usuario_id := uid;
      new.created_at := now();
    end if;
  else
    -- El autor y la fecha de carga no cambian nunca en un update.
    new.usuario_id := old.usuario_id;
    new.created_at := old.created_at;
  end if;

  if new.cliente_id is not null
     and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id) then
    select * into cli from clientes where id = new.cliente_id;
    if found then
      new.cliente_nombre := cli.razon_social;
      new.cliente_codigo := cli.codigo;
      new.ciudad := cli.ciudad;
      new.zona := cli.zona;
    end if;
  end if;

  -- Desde la app el cliente es obligatorio; la migracion puede traer
  -- pedidos viejos sin codigo de cliente.
  if uid is not null and new.cliente_id is null then
    raise exception 'Debe seleccionar un cliente del listado.' using errcode = '23502';
  end if;

  return new;
end;
$$;

revoke execute on function public.completar_registro_dominio() from public, anon, authenticated;

drop trigger if exists pedidos_completar on pedidos;
create trigger pedidos_completar
  before insert or update on pedidos
  for each row execute function public.completar_registro_dominio();

drop trigger if exists informes_completar on informes;
create trigger informes_completar
  before insert or update on informes
  for each row execute function public.completar_registro_dominio();

-- ─────────────────────────────────────────────────────────────
-- guardar_informe — alta de visita + ubicacion del cliente
--
-- Es una funcion y no un insert directo porque un vendedor no puede
-- modificar `clientes` (solo el admin), pero su visita SI tiene que poder
-- actualizar la ubicacion del cliente. `security definer` le presta ese
-- permiso puntual, y nada mas: el resto lo decide la propia funcion.
--
-- Idempotente por `p_idempotency_key`: un reintento devuelve el id del
-- informe ya guardado.
-- ─────────────────────────────────────────────────────────────
create or replace function public.guardar_informe(
  p_cliente_id uuid,
  p_comentario text,
  p_lat double precision,
  p_lng double precision,
  p_actualizar_ubicacion boolean,
  p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nuevo_id uuid;
begin
  if not private.esta_activo() then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'La ubicacion es obligatoria para guardar el informe.' using errcode = '23502';
  end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'El cliente ya no existe. Refresca la pagina.' using errcode = '23503';
  end if;

  select id into nuevo_id from informes where idempotency_key = p_idempotency_key;
  if found then
    return nuevo_id;
  end if;

  insert into informes (cliente_id, comentario, lat, lng, idempotency_key)
  values (p_cliente_id, nullif(trim(p_comentario), ''), p_lat, p_lng, p_idempotency_key)
  returning id into nuevo_id;

  if coalesce(p_actualizar_ubicacion, true) then
    update clientes set lat = p_lat, lng = p_lng where id = p_cliente_id;
  end if;

  return nuevo_id;
end;
$$;

revoke execute on function public.guardar_informe(uuid, text, double precision, double precision, boolean, uuid) from public, anon;
grant execute on function public.guardar_informe(uuid, text, double precision, double precision, boolean, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- total_global_cliente — cuanto compro un cliente en total
--
-- Un vendedor solo ve SUS pedidos, pero la app original le mostraba ademas
-- el total historico del cliente sumando a todos los vendedores. Esta
-- funcion devuelve solo ese numero, sin exponer los pedidos ajenos.
-- ─────────────────────────────────────────────────────────────
create or replace function public.total_global_cliente(p_cliente_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select case
    when private.esta_activo()
      then coalesce((select sum(total_precio) from pedidos where cliente_id = p_cliente_id), 0)
    else null
  end
$$;

revoke execute on function public.total_global_cliente(uuid) from public, anon;
grant execute on function public.total_global_cliente(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- clientes: todos los activos leen, solo el admin escribe.
alter table clientes enable row level security;

drop policy if exists "Ver clientes" on clientes;
create policy "Ver clientes" on clientes for select to authenticated
  using (private.esta_activo());

-- Una policy por operacion y no un `for all`: un `for all` tambien cuenta
-- como policy de SELECT y Postgres evaluaria las dos en cada lectura.
drop policy if exists "Admin crea clientes" on clientes;
create policy "Admin crea clientes" on clientes for insert to authenticated
  with check (private.es_admin());

drop policy if exists "Admin edita clientes" on clientes;
create policy "Admin edita clientes" on clientes for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

drop policy if exists "Admin borra clientes" on clientes;
create policy "Admin borra clientes" on clientes for delete to authenticated
  using (private.es_admin());

revoke all on table clientes from anon;
grant select, insert, update, delete on table clientes to authenticated;

-- pedidos: el vendedor ve e inserta lo suyo; admin/supervisor ven todo;
-- solo el admin edita y borra.
alter table pedidos enable row level security;

drop policy if exists "Ver pedidos" on pedidos;
create policy "Ver pedidos" on pedidos for select to authenticated
  using (
    private.ve_todo()
    or (private.esta_activo() and usuario_id = (select auth.uid()))
  );

-- El `with check` sobre usuario_id es redundante con el trigger (que lo pisa
-- con auth.uid()), pero deja explicito en la policy quien puede insertar que.
drop policy if exists "Cargar pedidos" on pedidos;
create policy "Cargar pedidos" on pedidos for insert to authenticated
  with check (private.esta_activo() and usuario_id = (select auth.uid()));

drop policy if exists "Admin edita pedidos" on pedidos;
create policy "Admin edita pedidos" on pedidos for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

drop policy if exists "Admin borra pedidos" on pedidos;
create policy "Admin borra pedidos" on pedidos for delete to authenticated
  using (private.es_admin());

revoke all on table pedidos from anon;
grant select, insert, update, delete on table pedidos to authenticated;

-- informes: igual que pedidos, pero el alta pasa por guardar_informe().
alter table informes enable row level security;

drop policy if exists "Ver informes" on informes;
create policy "Ver informes" on informes for select to authenticated
  using (
    private.ve_todo()
    or (private.esta_activo() and usuario_id = (select auth.uid()))
  );

drop policy if exists "Admin edita informes" on informes;
create policy "Admin edita informes" on informes for update to authenticated
  using (private.es_admin())
  with check (private.es_admin());

drop policy if exists "Admin borra informes" on informes;
create policy "Admin borra informes" on informes for delete to authenticated
  using (private.es_admin());

-- Sin insert: el alta pasa por guardar_informe(). Y la ubicacion no se edita
-- nunca, ni siquiera el admin: solo cliente y comentario tienen grant de update.
-- (Se revoca todo de `authenticated` primero: Supabase lo concede por defecto.)
revoke all on table informes from anon;
revoke all on table informes from authenticated;
grant select, delete on table informes to authenticated;
grant update (cliente_id, comentario) on table informes to authenticated;

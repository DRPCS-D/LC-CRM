-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — Rol "cobrador"
--
-- Carga informes de visita (con GPS) y ve solo los suyos. No ve ni carga
-- pedidos. Necesita LEER clientes (para elegir a quien visito), y eso ya lo
-- permite la policy de clientes para cualquier cuenta activa.
--
-- Lo que se cierra aca es lo que antes alcanzaba con "estar activo":
--   · insertar pedidos y subir fotos de pedidos
--   · el total historico de un cliente (suma de pedidos de todos)
-- Ver pedidos ya queda cerrado solo: un cobrador no es autor de ninguno.
-- ═══════════════════════════════════════════════════════════════════════════

alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios
  add constraint usuarios_rol_check check (rol in ('admin', 'supervisor', 'vendedor', 'cobrador'));

-- ¿Quien llama es un cobrador activo?
create or replace function private.es_cobrador()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol = 'cobrador' and activo from usuarios where id = (select auth.uid())),
    false
  )
$$;

revoke execute on function private.es_cobrador() from public, anon;
grant execute on function private.es_cobrador() to authenticated;

-- Pedidos: el cobrador no inserta.
drop policy if exists "Cargar pedidos" on pedidos;
create policy "Cargar pedidos" on pedidos for insert to authenticated
  with check (
    private.esta_activo()
    and not private.es_cobrador()
    and usuario_id = (select auth.uid())
  );

-- Fotos de pedidos: el cobrador no sube.
drop policy if exists "Subir fotos de pedidos" on storage.objects;
create policy "Subir fotos de pedidos" on storage.objects for insert to authenticated
  with check (bucket_id = 'pedidos' and private.esta_activo() and not private.es_cobrador());

-- Total historico del cliente: no es para el cobrador.
create or replace function public.total_global_cliente(p_cliente_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select case
    when private.esta_activo() and not private.es_cobrador()
      then coalesce((select sum(total_precio) from pedidos where cliente_id = p_cliente_id), 0)
    else null
  end
$$;

revoke execute on function public.total_global_cliente(uuid) from public, anon;
grant execute on function public.total_global_cliente(uuid) to authenticated;

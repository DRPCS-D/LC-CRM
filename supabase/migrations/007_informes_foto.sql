-- ═══════════════════════════════════════════════════════════════════════════
-- 007_informes_foto.sql — Foto opcional en el informe de visita
--
-- La foto vive en el mismo bucket privado `pedidos`, bajo
-- `<usuario>/informes/<uuid>.jpg`. Esa carpeta es lo que le permite subirla a
-- un cobrador, que no puede subir fotos de pedidos.
--
-- guardar_informe() gana `p_imagen_path` con default null: el cliente viejo
-- (que no lo manda) sigue funcionando mientras se despliega el nuevo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table informes add column if not exists imagen_path text;

drop function if exists public.guardar_informe(uuid, text, double precision, double precision, boolean, uuid);

create or replace function public.guardar_informe(
  p_cliente_id uuid,
  p_comentario text,
  p_lat double precision,
  p_lng double precision,
  p_actualizar_ubicacion boolean,
  p_idempotency_key uuid,
  p_imagen_path text default null
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
  -- Solo una foto propia de informes: no se puede apuntar a la foto de otra persona.
  if p_imagen_path is not null
     and p_imagen_path not like (select auth.uid())::text || '/informes/%' then
    raise exception 'Foto no valida.' using errcode = '42501';
  end if;

  select id into nuevo_id from informes where idempotency_key = p_idempotency_key;
  if found then
    return nuevo_id;
  end if;

  insert into informes (cliente_id, comentario, lat, lng, idempotency_key, imagen_path)
  values (p_cliente_id, nullif(trim(p_comentario), ''), p_lat, p_lng, p_idempotency_key, p_imagen_path)
  returning id into nuevo_id;

  if coalesce(p_actualizar_ubicacion, true) then
    update clientes set lat = p_lat, lng = p_lng where id = p_cliente_id;
  end if;

  return nuevo_id;
end;
$$;

revoke execute on function public.guardar_informe(uuid, text, double precision, double precision, boolean, uuid, text) from public, anon;
grant execute on function public.guardar_informe(uuid, text, double precision, double precision, boolean, uuid, text) to authenticated;

-- Storage ---------------------------------------------------------------

drop policy if exists "Ver fotos de pedidos" on storage.objects;
create policy "Ver fotos de pedidos" on storage.objects for select to authenticated
  using (
    bucket_id = 'pedidos'
    and private.esta_activo()
    and (
      private.ve_todo()
      or owner = (select auth.uid())
      or exists (
        select 1 from public.pedidos p
        where p.imagen_path = storage.objects.name and p.usuario_id = (select auth.uid())
      )
      or exists (
        select 1 from public.informes i
        where i.imagen_path = storage.objects.name and i.usuario_id = (select auth.uid())
      )
    )
  );

-- Un cobrador solo sube a `<su id>/informes/`; el resto, como antes.
drop policy if exists "Subir fotos de pedidos" on storage.objects;
create policy "Subir fotos de pedidos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pedidos'
    and private.esta_activo()
    and (
      not private.es_cobrador()
      or name like (select auth.uid())::text || '/informes/%'
    )
  );

drop policy if exists "Borrar fotos de pedidos" on storage.objects;
create policy "Borrar fotos de pedidos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'pedidos'
    and (
      private.es_admin()
      or (
        owner = (select auth.uid())
        and not exists (select 1 from public.pedidos p where p.imagen_path = storage.objects.name)
        and not exists (select 1 from public.informes i where i.imagen_path = storage.objects.name)
      )
    )
  );

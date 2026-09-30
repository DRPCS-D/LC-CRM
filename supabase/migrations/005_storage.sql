-- ═══════════════════════════════════════════════════════════════════════════
-- 005_storage.sql — Fotos de pedidos y avatares
--
--   · pedidos  — PRIVADO. La foto de cada pedido (reemplaza la carpeta de
--     Drive). Se ve con URLs firmadas de corta duracion.
--   · avatares — PUBLICO en lectura. La foto de perfil de cada persona, que
--     aparece en los marcadores del mapa de visitas. Solo escribe /api (con
--     la service_role key), asi que no lleva policies de escritura.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pedidos', 'pedidos', false, 20 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('avatares', 'avatares', true, 2 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ver una foto de pedido: quien ve todo, quien la subio, o el dueno del
-- pedido que la usa (las fotos migradas desde Drive las sube el script, no
-- el vendedor, asi que `owner` no alcanza).
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
        where p.imagen_path = storage.objects.name
          and p.usuario_id = (select auth.uid())
      )
    )
  );

-- Subir: cualquier cuenta activa (es el primer paso de cargar un pedido).
drop policy if exists "Subir fotos de pedidos" on storage.objects;
create policy "Subir fotos de pedidos" on storage.objects for insert to authenticated
  with check (bucket_id = 'pedidos' and private.esta_activo());

-- Borrar: el admin (al borrar un pedido o cambiarle la foto) y quien la
-- subio, solo mientras ningun pedido la use (para limpiar una foto que quedo
-- huerfana porque fallo el guardado).
drop policy if exists "Borrar fotos de pedidos" on storage.objects;
create policy "Borrar fotos de pedidos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'pedidos'
    and (
      private.es_admin()
      or (
        owner = (select auth.uid())
        and not exists (select 1 from public.pedidos p where p.imagen_path = storage.objects.name)
      )
    )
  );

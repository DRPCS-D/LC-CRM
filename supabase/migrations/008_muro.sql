-- ═══════════════════════════════════════════════════════════════════════════
-- 008_muro.sql — Muro de informes (PRUEBA, solo administrador)
--
-- Me gusta y comentarios sobre los informes con foto. Todo es solo de admin:
-- si la prueba se descarta basta con `drop table informe_comentarios,
-- informe_likes;`.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists informe_likes (
  informe_id uuid not null references informes (id) on delete cascade,
  usuario_id uuid not null default auth.uid() references usuarios (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (informe_id, usuario_id)
);

create table if not exists informe_comentarios (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references informes (id) on delete cascade,
  usuario_id uuid not null default auth.uid() references usuarios (id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists informe_comentarios_informe_idx on informe_comentarios (informe_id, created_at);
create index if not exists informe_likes_usuario_idx on informe_likes (usuario_id);
create index if not exists informe_comentarios_usuario_idx on informe_comentarios (usuario_id);

alter table informe_likes enable row level security;
alter table informe_comentarios enable row level security;

drop policy if exists "Admin ve likes" on informe_likes;
create policy "Admin ve likes" on informe_likes for select to authenticated
  using (private.es_admin());
drop policy if exists "Admin da like" on informe_likes;
create policy "Admin da like" on informe_likes for insert to authenticated
  with check (private.es_admin() and usuario_id = (select auth.uid()));
drop policy if exists "Admin quita su like" on informe_likes;
create policy "Admin quita su like" on informe_likes for delete to authenticated
  using (private.es_admin() and usuario_id = (select auth.uid()));

drop policy if exists "Admin ve comentarios" on informe_comentarios;
create policy "Admin ve comentarios" on informe_comentarios for select to authenticated
  using (private.es_admin());
drop policy if exists "Admin comenta" on informe_comentarios;
create policy "Admin comenta" on informe_comentarios for insert to authenticated
  with check (private.es_admin() and usuario_id = (select auth.uid()));
drop policy if exists "Admin borra su comentario" on informe_comentarios;
create policy "Admin borra su comentario" on informe_comentarios for delete to authenticated
  using (private.es_admin() and usuario_id = (select auth.uid()));

revoke all on table informe_likes from anon, authenticated;
revoke all on table informe_comentarios from anon, authenticated;
grant select, insert, delete on table informe_likes to authenticated;
grant select, insert, delete on table informe_comentarios to authenticated;

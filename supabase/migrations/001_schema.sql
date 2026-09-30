-- ═══════════════════════════════════════════════════════════════════════════
-- 001_schema.sql — Esquema base
--
--   auth.users ── usuarios (username, nombre, email, rol, activo, foto)
--
-- El perfil de la persona, colgado de `auth.users`. El rol es GLOBAL y tiene
-- tres valores (los mismos tres de la app de Apps Script original):
--   · admin      — todo (antes "Admin").
--   · supervisor — ve todo, no edita ni borra (antes "AdminL").
--   · vendedor   — carga y ve solo lo suyo (antes "User").
--
-- Se inicia sesion con `username`, no con email: el email de Auth es uno
-- interno, `<username>@lc-crm.local`, que nadie tiene que conocer. Lo arma
-- /api/admin/usuarios al crear la cuenta y el Login al ingresar.
--
-- Las tablas del dominio (clientes, pedidos, informes) estan en 004_dominio.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- updated_at automatico, reutilizable por cualquier tabla nueva
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- usuarios — perfil colgado de auth.users (comparten el id).
--
-- `email` esta duplicado respecto de `auth.users.email` a proposito: asi las
-- pantallas lo leen con un select comun, sin pasar por la API de Auth (que
-- necesita la service_role key). El precio es que hay que mantenerlos
-- sincronizados: por eso cambiar el email pasa siempre por
-- /api/admin/usuarios, que actualiza los dos lados.
--
-- `activo = false` es la baja: la persona sigue existiendo en Auth y puede
-- llegar a iniciar sesion, pero la RLS deja de devolverle filas y la app le
-- muestra "cuenta desactivada". Se prefiere a borrar la cuenta porque no
-- arrastra los datos que haya cargado.
-- ─────────────────────────────────────────────────────────────
create table if not exists usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Lo que se escribe en el login. Minusculas, sin espacios.
  username text not null check (username ~ '^[a-z0-9._-]{3,40}$'),
  nombre text not null,
  -- Email INTERNO de Auth (`<username>@lc-crm.local`). Ver arriba.
  email text not null,
  rol text not null default 'vendedor' check (rol in ('admin', 'supervisor', 'vendedor')),
  activo boolean not null default true,
  -- Ruta del avatar en el bucket publico `avatares` (005_storage.sql).
  foto_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El email identifica la cuenta: dos perfiles con el mismo email dejarian
-- sin resolver a cual corresponde el login.
create unique index if not exists usuarios_email_idx on usuarios (lower(email));
create unique index if not exists usuarios_username_idx on usuarios (username);

drop trigger if exists usuarios_updated_at on usuarios;
create trigger usuarios_updated_at
  before update on usuarios
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 003_admin.sql — Alta del primer administrador
--
-- Este archivo se corre UNA sola vez, y DESPUES de haber creado el usuario a
-- mano en el dashboard de Supabase:
--
--   Authentication → Users → Add user → Create new user
--   Email: <username>@lc-crm.local   (por ejemplo admin@lc-crm.local)
--   (marcar "Auto Confirm User", si no, no va a poder entrar)
--
-- En el login de la app se escribe solo el <username> ("admin"): el sufijo
-- @lc-crm.local lo agrega la app. Cambiar abajo el username y el nombre si
-- se uso otro.
--
-- El primer admin no se crea desde la app a proposito: no hay cuentas
-- todavia, asi que no habria con quien iniciar sesion para crearlo. Del
-- segundo en adelante ya se dan de alta desde /usuarios.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.usuarios (id, username, nombre, email, rol)
select u.id, 'admin', 'Administrador', u.email, 'admin'
from auth.users u
where u.email = 'admin@lc-crm.local'
on conflict (id) do update
  set rol = 'admin', activo = true;

-- Verificacion: tiene que devolver exactamente una fila
select id, username, email, rol from public.usuarios where rol = 'admin';

-- WAYIRA E-SPORTS — roles, permisos, insignias, acceso a correos y endurecimiento de funciones.
-- Aprobado por el dueño del proyecto el 2026-11-02.
--
-- Roles (rango → quién puede asignar a quién):
--   usuario      10  implícito: todo perfil lo tiene, no se guarda fila
--   moderador    40  comunidad
--   editor       50  noticias y portada
--   organizador  50  torneos y sorteos
--   admin        90  todo lo anterior + buzón y configuración; asigna roles de rango < 90
--   superadmin  100  igual que admin + asigna admin + consulta correos; solo se asigna por SQL en el panel
--
-- Reglas contra auto-elevación (todas en el servidor):
--  * user_roles no tiene permisos de escritura para anon/authenticated: solo assign_role()/revoke_role().
--  * Esas funciones exigen 'roles.assign', impiden actuar sobre uno mismo, y exigen que el rango del
--    que asigna sea MAYOR que el del rol asignado y que todos los roles actuales del destinatario.
--  * Nadie tiene rango > 100, así que 'superadmin' no se puede asignar desde la app.
--  * Toda asignación y retiro queda en role_audit (solo lectura para quien gestiona roles).
--
-- Endurecimiento:
--  * has_permission, is_conversation_member y user_max_rank viven en el esquema "private", que la API no publica.
--  * start_conversation: máximo 20 conversaciones nuevas por hora por usuario.

-- ---------------------------------------------------------------------------
-- Esquema privado para funciones auxiliares (no expuesto por la API REST)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- Las políticas guardan la referencia a la función, no su nombre: siguen funcionando tras moverla.
alter function public.has_permission(text) set schema private;
alter function public.is_conversation_member(uuid) set schema private;

create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages m
     set read_at = now()
   where m.conversation_id = conv
     and m.read_at is null
     and m.sender_id <> (select auth.uid())
     and private.is_conversation_member(conv);
$$;

-- Límite de conversaciones nuevas
alter table public.conversations add column created_by uuid references public.profiles (id) on delete set null;
create index conversations_created_by_idx on public.conversations (created_by, created_at desc);

create or replace function public.start_conversation(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a uuid;
  b uuid;
  conv uuid;
begin
  if me is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if other is null or other = me then raise exception 'Destinatario no válido' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  a := least(me, other); b := greatest(me, other);
  select id into conv from public.conversations where user1_id = a and user2_id = b;
  if conv is not null then return conv; end if;

  perform pg_advisory_xact_lock(hashtext('start_conversation:' || me::text));
  if (select count(*) from public.conversations
      where created_by = me and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Has abierto demasiadas conversaciones nuevas. Intenta más tarde.' using errcode = '54000';
  end if;
  insert into public.conversations (user1_id, user2_id, created_by) values (a, b, me)
    on conflict (user1_id, user2_id) do nothing;
  select id into conv from public.conversations where user1_id = a and user2_id = b;
  return conv;
end;
$$;

create table public.roles (
  key          text primary key check (key ~ '^[a-z_]{3,20}$'),
  name         text not null,
  description  text not null,
  rank         int  not null check (rank between 1 and 100)
);

create table public.role_permissions (
  role_key    text not null references public.roles (key) on delete cascade,
  permission  text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role_key, permission)
);

create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role_key    text not null references public.roles (key) on delete restrict,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role_key)
);
create index user_roles_role_idx on public.user_roles (role_key);
create index user_roles_granted_by_idx on public.user_roles (granted_by);

create table public.role_audit (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  target_id   uuid references public.profiles (id) on delete set null,
  role_key    text not null,
  action      text not null check (action in ('grant', 'revoke')),
  created_at  timestamptz not null default now()
);
create index role_audit_actor_idx on public.role_audit (actor_id);
create index role_audit_target_idx on public.role_audit (target_id, created_at desc);

insert into public.roles (key, name, description, rank) values
 ('moderador',   'Moderador',   'Cuida la comunidad: retira publicaciones, comentarios y multimedia inapropiados.', 40),
 ('editor',      'Editor',      'Publica y edita noticias y los textos/estadísticas visibles del sitio.', 50),
 ('organizador', 'Organizador', 'Crea y gestiona torneos, inscripciones, llaves y sorteos.', 50),
 ('admin',       'Administrador', 'Gestiona usuarios y roles inferiores, buzón de contacto y configuración.', 90),
 ('superadmin',  'Superadministrador', 'Dueño del proyecto. Único que nombra administradores.', 100);

insert into public.role_permissions (role_key, permission)
select r, p from (values
  ('moderador',   'community.moderate'),
  ('editor',      'news.manage'),
  ('editor',      'site.content'),
  ('organizador', 'tournaments.manage'),
  ('organizador', 'giveaways.manage')
) v(r, p)
union all
select a, p from (values ('admin'), ('superadmin')) r(a)
cross join (values
  ('community.moderate'), ('news.manage'), ('site.content'), ('site.manage'),
  ('tournaments.manage'), ('giveaways.manage'),
  ('contact.read'), ('roles.assign')
) p(p)
union all
-- Consultar el correo de un usuario: SOLO superadmin (ver sección "Acceso a correos")
select 'superadmin', 'users.view_email';

-- ---------------------------------------------------------------------------
-- Comprobación real de permisos (reemplaza el stub que devolvía false)
-- ---------------------------------------------------------------------------
create or replace function private.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = (select auth.uid()) and rp.permission = perm
  );
$$;

create or replace function private.user_max_rank(target uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(r.rank), 10)
  from public.user_roles ur join public.roles r on r.key = ur.role_key
  where ur.user_id = target;
$$;

-- Para el frontend: qué puedo hacer (solo para mostrar/ocultar; la seguridad real es RLS)
create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission order by rp.permission), '{}')
  from public.user_roles ur join public.role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = (select auth.uid());
$$;

create or replace function public.assign_role(target uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_rank int;
  role_rank int;
begin
  if me is null or not private.has_permission('roles.assign') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if target = me then
    raise exception 'No puedes cambiar tus propios roles' using errcode = '42501';
  end if;
  select rank into role_rank from public.roles where key = p_role;
  if role_rank is null then raise exception 'Rol no válido' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  my_rank := private.user_max_rank(me);
  if role_rank >= my_rank or private.user_max_rank(target) >= my_rank then
    raise exception 'Solo puedes gestionar roles inferiores al tuyo' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role_key, granted_by) values (target, p_role, me)
    on conflict do nothing;
  if found then
    insert into public.role_audit (actor_id, target_id, role_key, action) values (me, target, p_role, 'grant');
  end if;
end;
$$;

create or replace function public.revoke_role(target uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_rank int;
begin
  if me is null or not private.has_permission('roles.assign') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if target = me then
    raise exception 'No puedes cambiar tus propios roles' using errcode = '42501';
  end if;
  my_rank := private.user_max_rank(me);
  if private.user_max_rank(target) >= my_rank then
    raise exception 'Solo puedes gestionar roles inferiores al tuyo' using errcode = '42501';
  end if;
  delete from public.user_roles where user_id = target and role_key = p_role;
  if found then
    insert into public.role_audit (actor_id, target_id, role_key, action) values (me, target, p_role, 'revoke');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acceso: catálogo legible; asignaciones y auditoría solo lectura; escritura solo por función
-- ---------------------------------------------------------------------------
alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;
alter table public.role_audit       enable row level security;

revoke all on public.roles, public.role_permissions, public.user_roles, public.role_audit from anon, authenticated;
grant select (key, name, rank) on public.roles to anon, authenticated;
grant select (description) on public.roles to authenticated;
grant select on public.role_permissions, public.role_audit to authenticated;
-- Insignias públicas: solo quién tiene qué rol. Quién lo asignó y cuándo queda en role_audit.
grant select (user_id, role_key) on public.user_roles to anon, authenticated;

create policy "roles: catálogo público" on public.roles for select to anon, authenticated using (true);
create policy "role_permissions: catálogo con sesión" on public.role_permissions for select to authenticated using (true);
create policy "user_roles: insignias públicas" on public.user_roles for select to anon, authenticated using (true);
create policy "role_audit: quien gestiona roles" on public.role_audit
  for select to authenticated using (private.has_permission('roles.assign'));

-- ---------------------------------------------------------------------------
-- Acceso a correos (soporte), endurecido
--  * Solo el permiso 'users.view_email' (únicamente superadmin).
--  * Un correo por llamada, por id exacto: no hay búsqueda, lista ni comodines.
--  * Motivo obligatorio (10–300 caracteres) y, si viene de un mensaje del buzón, debe ser de ese usuario.
--  * Registro inmutable de cada consulta: quién, a quién, motivo, cuándo.
--  * Límites por quien consulta: 5 por hora y 20 por día (con bloqueo para que llamadas en paralelo no los salten).
-- ---------------------------------------------------------------------------
create table public.email_access_log (
  id                  bigint generated always as identity primary key,
  actor_id            uuid references public.profiles (id) on delete set null,
  target_id           uuid references public.profiles (id) on delete set null,
  reason              text not null check (char_length(reason) between 10 and 300),
  contact_message_id  uuid references public.contact_messages (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index email_access_log_actor_idx on public.email_access_log (actor_id, created_at desc);
create index email_access_log_target_idx on public.email_access_log (target_id);
create index email_access_log_contact_idx on public.email_access_log (contact_message_id);
alter table public.email_access_log enable row level security;
revoke all on public.email_access_log from anon, authenticated;
grant select on public.email_access_log to authenticated;
create policy "email_access_log: solo quien puede consultar correos" on public.email_access_log
  for select to authenticated using (private.has_permission('users.view_email'));

drop function public.get_user_email(uuid);
create function public.get_user_email(target uuid, reason text, contact_message uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_reason text := btrim(coalesce(reason, ''));
  v_email text;
begin
  if me is null or not private.has_permission('users.view_email') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if target is null or not exists (select 1 from public.profiles where id = target) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  if char_length(v_reason) not between 10 and 300 then
    raise exception 'Indica el motivo de la consulta (10 a 300 caracteres)' using errcode = '22023';
  end if;
  if contact_message is not null and not exists (
       select 1 from public.contact_messages m where m.id = contact_message and m.sender_id = target) then
    raise exception 'El mensaje indicado no es de ese usuario' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('email_access:' || me::text));
  if (select count(*) from public.email_access_log where actor_id = me and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.email_access_log where actor_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Límite de consultas alcanzado. Intenta más tarde.' using errcode = '54000';
  end if;

  insert into public.email_access_log (actor_id, target_id, reason, contact_message_id)
  values (me, target, v_reason, contact_message);
  select u.email into v_email from auth.users u where u.id = target;
  return v_email;
end;
$$;

-- Cierre de funciones: solo la API pública listada aquí es ejecutable
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_permission(text)              to anon, authenticated;
grant execute on function private.is_conversation_member(uuid)      to authenticated;
grant execute on function public.count_registered_users()           to anon, authenticated;
grant execute on function public.get_user_email(uuid, text, uuid)   to authenticated;
grant execute on function public.start_conversation(uuid)           to authenticated;
grant execute on function public.mark_conversation_read(uuid)       to authenticated;
grant execute on function public.register_team(uuid, text, text, jsonb) to authenticated;
grant execute on function public.my_permissions()                   to authenticated;
grant execute on function public.assign_role(uuid, text)            to authenticated;
grant execute on function public.revoke_role(uuid, text)            to authenticated;

-- Configuración del sitio: 'site.content' (editor) edita claves de contenido; 'site.manage' (admin) todo.
drop policy "site_config: edita gestión" on public.site_config;
create policy "site_config: edita gestión" on public.site_config
  for update to authenticated
  using (private.has_permission('site.manage') or (private.has_permission('site.content') and key in ('social_stats', 'projects', 'home_highlights')))
  with check (private.has_permission('site.manage') or (private.has_permission('site.content') and key in ('social_stats', 'projects', 'home_highlights')));

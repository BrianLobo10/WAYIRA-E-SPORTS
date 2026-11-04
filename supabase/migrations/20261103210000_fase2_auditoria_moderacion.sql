-- Fase 2: auditoría, suspensiones, denuncias, proyectos, estadísticas y listado de usuarios.
-- Principios: la base decide (RLS + funciones con permiso y rango); la web solo muestra u oculta.

-- ---------------------------------------------------------------------------
-- 0. Complemento de perfiles públicos: reacciones de comentarios visibles a visitantes
-- ---------------------------------------------------------------------------
grant select on public.comment_reactions to anon;
drop policy if exists "comment_reactions: lectura pública" on public.comment_reactions;
create policy "comment_reactions: lectura pública" on public.comment_reactions for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 1. Permisos nuevos
--    users.view      ver listado de usuarios (Admin, Superadmin)
--    users.suspend   suspender/reactivar a rangos inferiores (Moderador, Admin, Superadmin)
--    audit.view      historial de auditoría completo (Superadmin)
--    platform.stats  estadísticas de la plataforma (Superadmin)
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_key, permission) values
  ('moderador',  'users.suspend'),
  ('admin',      'users.suspend'),
  ('admin',      'users.view'),
  ('superadmin', 'users.suspend'),
  ('superadmin', 'users.view'),
  ('superadmin', 'audit.view'),
  ('superadmin', 'platform.stats')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Auditoría: solo la escribe la base (funciones y disparadores); nadie la edita ni la borra
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_name  text,
  action      text not null check (char_length(action) <= 60),
  entity      text not null check (char_length(entity) <= 40),
  entity_id   text,
  summary     text check (char_length(summary) <= 300),
  details     jsonb not null default '{}'::jsonb,
  result      text not null default 'ok' check (result in ('ok', 'denied'))
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists "audit: solo con permiso" on public.audit_log;
create policy "audit: solo con permiso" on public.audit_log
  for select to authenticated using (private.has_permission('audit.view'));

create or replace function private.audit(
  p_action text, p_entity text, p_entity_id text, p_summary text,
  p_details jsonb default '{}'::jsonb, p_result text default 'ok')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, details, result)
  values (me, (select display_name from public.profiles where id = me), p_action, p_entity, p_entity_id,
          left(p_summary, 300), coalesce(p_details, '{}'::jsonb), p_result);
end;
$$;
revoke all on function private.audit(text, text, text, text, jsonb, text) from public, anon, authenticated;

-- Disparador genérico: crea, edita o borra contenido gestionado (torneos, noticias, proyectos, sorteos)
create or replace function private.audit_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text;
  rec jsonb := to_jsonb(coalesce(new, old));
  oldj jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  act text;
begin
  label := coalesce(rec ->> 'name', rec ->> 'title', '');
  if (select auth.uid()) is null then
    return coalesce(new, old); -- cambios hechos desde el panel de Supabase o tareas internas
  end if;
  if tg_op = 'INSERT' then
    act := 'created';
  elsif tg_op = 'DELETE' then
    act := 'deleted';
  else
    -- Solo cambios con significado (no cada clic del bracket)
    if tg_table_name = 'news' and (oldj ->> 'published') is distinct from (rec ->> 'published') then
      act := case when (rec ->> 'published')::boolean then 'published' else 'unpublished' end;
    elsif tg_table_name = 'projects' and (oldj ->> 'active') is distinct from (rec ->> 'active') then
      act := case when (rec ->> 'active')::boolean then 'activated' else 'deactivated' end;
    elsif (oldj ->> 'status') is distinct from (rec ->> 'status') then
      act := 'status:' || coalesce(rec ->> 'status', '');
    elsif (oldj - array['bracket','lower_bracket','updated_at','teams','registrations','sort_order'])
          is distinct from (rec - array['bracket','lower_bracket','updated_at','teams','registrations','sort_order']) then
      act := 'edited';
    else
      return new;
    end if;
  end if;
  perform private.audit(act, tg_table_name, rec ->> 'id', label);
  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_content() from public, anon, authenticated;

drop trigger if exists audit_tournaments on public.tournaments;
create trigger audit_tournaments after insert or update or delete on public.tournaments
  for each row execute function private.audit_content();
drop trigger if exists audit_news on public.news;
create trigger audit_news after insert or update or delete on public.news
  for each row execute function private.audit_content();
drop trigger if exists audit_giveaways on public.giveaways;
create trigger audit_giveaways after insert or update or delete on public.giveaways
  for each row execute function private.audit_content();

-- Moderación: borrar contenido de OTRA persona queda registrado
create or replace function private.audit_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is not null and old.author_id is distinct from me then
    perform private.audit('deleted', tg_table_name, old.id::text,
      'Contenido de ' || coalesce((select display_name from public.profiles where id = old.author_id), 'usuario'),
      jsonb_build_object('author_id', old.author_id, 'content', left(old.content, 200)));
  end if;
  return old;
end;
$$;
revoke all on function private.audit_moderation() from public, anon, authenticated;
drop trigger if exists audit_posts_moderation on public.posts;
create trigger audit_posts_moderation after delete on public.posts for each row execute function private.audit_moderation();
drop trigger if exists audit_comments_moderation on public.comments;
create trigger audit_comments_moderation after delete on public.comments for each row execute function private.audit_moderation();

-- ---------------------------------------------------------------------------
-- 3. Roles: los intentos rechazados también quedan registrados.
--    Para que el registro sobreviva, la función no lanza error: devuelve el motivo (null = hecho).
-- ---------------------------------------------------------------------------
drop function if exists public.assign_role(uuid, text);
drop function if exists public.revoke_role(uuid, text);

create or replace function public.assign_role(target uuid, p_role text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_rank int;
  role_rank int;
  who text := (select display_name from public.profiles where id = target);
  err text;
begin
  if me is null then return 'Inicia sesión'; end if;
  select rank into role_rank from public.roles where key = p_role;
  if not private.has_permission('roles.assign') then
    err := 'Sin permiso para asignar roles';
  elsif target = me then
    err := 'No puedes cambiar tus propios roles';
  elsif role_rank is null then
    err := 'Rol no válido';
  elsif who is null then
    err := 'Usuario no encontrado';
  else
    my_rank := private.user_max_rank(me);
    if role_rank >= my_rank or private.user_max_rank(target) >= my_rank then
      err := 'Solo puedes gestionar roles inferiores al tuyo';
    end if;
  end if;

  if err is not null then
    perform private.audit('role_grant', 'user', target::text,
      'Intentó dar ' || coalesce(p_role, '?') || ' a ' || coalesce(who, 'usuario'),
      jsonb_build_object('role', p_role, 'reason', p_reason, 'error', err), 'denied');
    return err;
  end if;

  insert into public.user_roles (user_id, role_key, granted_by) values (target, p_role, me)
    on conflict do nothing;
  if found then
    insert into public.role_audit (actor_id, target_id, role_key, action) values (me, target, p_role, 'grant');
    perform private.audit('role_grant', 'user', target::text, 'Dio ' || p_role || ' a ' || who,
      jsonb_build_object('role', p_role, 'reason', p_reason));
  end if;
  return null;
end;
$$;

create or replace function public.revoke_role(target uuid, p_role text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  who text := (select display_name from public.profiles where id = target);
  err text;
begin
  if me is null then return 'Inicia sesión'; end if;
  if not private.has_permission('roles.assign') then
    err := 'Sin permiso para retirar roles';
  elsif target = me then
    err := 'No puedes cambiar tus propios roles';
  elsif private.user_max_rank(target) >= private.user_max_rank(me) then
    err := 'Solo puedes gestionar roles inferiores al tuyo';
  end if;

  if err is not null then
    perform private.audit('role_revoke', 'user', target::text,
      'Intentó quitar ' || coalesce(p_role, '?') || ' a ' || coalesce(who, 'usuario'),
      jsonb_build_object('role', p_role, 'reason', p_reason, 'error', err), 'denied');
    return err;
  end if;

  delete from public.user_roles where user_id = target and role_key = p_role;
  if found then
    insert into public.role_audit (actor_id, target_id, role_key, action) values (me, target, p_role, 'revoke');
    perform private.audit('role_revoke', 'user', target::text, 'Quitó ' || p_role || ' a ' || coalesce(who, 'usuario'),
      jsonb_build_object('role', p_role, 'reason', p_reason));
  end if;
  return null;
end;
$$;

revoke all on function public.assign_role(uuid, text, text) from public, anon;
revoke all on function public.revoke_role(uuid, text, text) from public, anon;
grant execute on function public.assign_role(uuid, text, text) to authenticated;
grant execute on function public.revoke_role(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Suspensiones (Moderador, Admin, Superadmin, siempre sobre rangos inferiores)
-- ---------------------------------------------------------------------------
create table if not exists public.user_suspensions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  until       timestamptz,                       -- null = indefinida
  reason      text not null check (char_length(reason) between 5 and 300),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  lifted_at   timestamptz,
  lifted_by   uuid references auth.users (id) on delete set null
);
create index if not exists user_suspensions_user_idx on public.user_suspensions (user_id, created_at desc);

alter table public.user_suspensions enable row level security;
revoke all on public.user_suspensions from anon, authenticated;
grant select on public.user_suspensions to authenticated;
drop policy if exists "suspensions: la propia o con permiso" on public.user_suspensions;
create policy "suspensions: la propia o con permiso" on public.user_suspensions
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission('users.suspend') or private.has_permission('users.view'));

create or replace function private.is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_suspensions s
    where s.user_id = uid and s.lifted_at is null and (s.until is null or s.until > now())
  );
$$;
revoke all on function private.is_suspended(uuid) from public, anon, authenticated;

create or replace function public.suspend_user(target uuid, p_hours int, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  who text := (select display_name from public.profiles where id = target);
  err text;
  v_until timestamptz := case when p_hours is null or p_hours <= 0 then null else now() + make_interval(hours => p_hours) end;
begin
  if me is null then return 'Inicia sesión'; end if;
  if not private.has_permission('users.suspend') then
    err := 'Sin permiso para suspender';
  elsif target = me then
    err := 'No puedes suspenderte a ti mismo';
  elsif who is null then
    err := 'Usuario no encontrado';
  elsif private.user_max_rank(target) >= private.user_max_rank(me) then
    err := 'Solo puedes suspender a usuarios de rango inferior';
  elsif p_reason is null or char_length(trim(p_reason)) < 5 then
    err := 'Escribe un motivo (mínimo 5 caracteres)';
  elsif p_hours is not null and p_hours > 0 and p_hours > 24 * 365 then
    err := 'Duración no válida';
  end if;

  if err is not null then
    perform private.audit('suspend', 'user', target::text, 'Intentó suspender a ' || coalesce(who, 'usuario'),
      jsonb_build_object('hours', p_hours, 'reason', p_reason, 'error', err), 'denied');
    return err;
  end if;

  update public.user_suspensions set lifted_at = now(), lifted_by = me
    where user_id = target and lifted_at is null;
  insert into public.user_suspensions (user_id, until, reason, created_by)
    values (target, v_until, trim(p_reason), me);
  perform private.audit('suspend', 'user', target::text,
    'Suspendió a ' || who || case when v_until is null then ' (indefinida)' else ' ' || p_hours || ' h' end,
    jsonb_build_object('hours', p_hours, 'reason', trim(p_reason)));
  return null;
end;
$$;

create or replace function public.lift_suspension(target uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  who text := (select display_name from public.profiles where id = target);
  err text;
begin
  if me is null then return 'Inicia sesión'; end if;
  if not private.has_permission('users.suspend') then
    err := 'Sin permiso para reactivar';
  elsif private.user_max_rank(target) >= private.user_max_rank(me) then
    err := 'Solo puedes gestionar a usuarios de rango inferior';
  end if;
  if err is not null then
    perform private.audit('unsuspend', 'user', target::text, 'Intentó reactivar a ' || coalesce(who, 'usuario'),
      jsonb_build_object('error', err), 'denied');
    return err;
  end if;
  update public.user_suspensions set lifted_at = now(), lifted_by = me
    where user_id = target and lifted_at is null;
  perform private.audit('unsuspend', 'user', target::text, 'Reactivó a ' || coalesce(who, 'usuario'),
    jsonb_build_object('reason', p_reason));
  return null;
end;
$$;

revoke all on function public.suspend_user(uuid, int, text) from public, anon;
revoke all on function public.lift_suspension(uuid, text) from public, anon;
grant execute on function public.suspend_user(uuid, int, text) to authenticated;
grant execute on function public.lift_suspension(uuid, text) to authenticated;

-- El disparador anti-spam ahora también frena a los suspendidos
create or replace function private.user_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    return new;
  end if;
  if private.is_suspended(me) then
    raise exception 'Tu cuenta está suspendida temporalmente.' using errcode = '42501';
  end if;
  if not public.consume_rate_limit(tg_table_name || ':' || me::text, tg_argv[0]::int, tg_argv[1]::int) then
    raise exception 'Vas demasiado rápido. Espera unos minutos e intenta de nuevo.' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists comment_reactions_rate_limit on public.comment_reactions;
create trigger comment_reactions_rate_limit before insert on public.comment_reactions
  for each row execute function private.user_insert_rate_limit('120', '600');
-- Inscripciones a torneos y sorteos: solo se frena a los suspendidos
-- (ya tienen sus propios límites; el staff carga listas de participantes sin tope)
create or replace function private.block_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is not null and private.is_suspended(me) then
    raise exception 'Tu cuenta está suspendida temporalmente.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.block_suspended() from public, anon, authenticated;
drop trigger if exists tournament_teams_guard on public.tournament_teams;
create trigger tournament_teams_guard before insert on public.tournament_teams
  for each row execute function private.block_suspended();
drop trigger if exists giveaway_entries_guard on public.giveaway_entries;
create trigger giveaway_entries_guard before insert on public.giveaway_entries
  for each row execute function private.block_suspended();

-- ---------------------------------------------------------------------------
-- 5. Denuncias (la cola de moderación usa community.moderate)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  target_type  text not null check (target_type in ('post', 'comment', 'user')),
  target_id    uuid not null,
  reason       text not null check (reason in ('spam', 'acoso', 'ofensivo', 'trampas', 'otro')),
  details      text check (char_length(details) <= 500),
  status       text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at   timestamptz not null default now(),
  resolved_by  uuid references auth.users (id) on delete set null,
  resolved_at  timestamptz,
  unique (reporter_id, target_type, target_id)
);
create index if not exists reports_open_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select, insert on public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;
drop policy if exists "reports: denuncio como yo" on public.reports;
create policy "reports: denuncio como yo" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'open');
drop policy if exists "reports: veo las mías o modero" on public.reports;
create policy "reports: veo las mías o modero" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or private.has_permission('community.moderate'));
drop policy if exists "reports: modero" on public.reports;
create policy "reports: modero" on public.reports
  for update to authenticated
  using (private.has_permission('community.moderate'))
  with check (private.has_permission('community.moderate') and resolved_by = (select auth.uid()));
drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function private.user_insert_rate_limit('20', '3600');

-- ---------------------------------------------------------------------------
-- 6. Proyectos como tabla propia (antes: lista JSON en site_config)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 120),
  description  text not null default '' check (char_length(description) <= 600),
  icon         text not null default 'trophy' check (icon ~ '^[a-z_-]{1,30}$'),
  status_label text not null default 'Activo' check (char_length(status_label) <= 30),
  period       text check (char_length(period) <= 30),
  image_urls   text[] not null default '{}' check (cardinality(image_urls) <= 6),
  link_url     text check (link_url is null or link_url ~ '^https://'),
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function private.projects_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
revoke all on function private.projects_touch() from public, anon, authenticated;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before insert or update on public.projects
  for each row execute function private.projects_touch();
drop trigger if exists audit_projects on public.projects;
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function private.audit_content();

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
drop policy if exists "projects: activos públicos o gestión" on public.projects;
create policy "projects: activos públicos o gestión" on public.projects
  for select to anon, authenticated
  using (active or private.has_permission('site.content') or private.has_permission('site.manage'));
drop policy if exists "projects: gestión crea" on public.projects;
create policy "projects: gestión crea" on public.projects
  for insert to authenticated with check (private.has_permission('site.content') or private.has_permission('site.manage'));
drop policy if exists "projects: gestión edita" on public.projects;
create policy "projects: gestión edita" on public.projects
  for update to authenticated
  using (private.has_permission('site.content') or private.has_permission('site.manage'))
  with check (private.has_permission('site.content') or private.has_permission('site.manage'));
drop policy if exists "projects: gestión borra" on public.projects;
create policy "projects: gestión borra" on public.projects
  for delete to authenticated using (private.has_permission('site.content') or private.has_permission('site.manage'));

-- Datos iniciales: los cuatro proyectos que la web mostraba por defecto (solo si la tabla está vacía)
insert into public.projects (title, description, icon, status_label, period, sort_order)
select * from (values
  ('Liga Wayira 2024', 'Torneo nacional de League of Legends con premios en efectivo y reconocimiento profesional', 'trophy', 'En curso', '2024', 1),
  ('Academia de Jugadores', 'Programa de formación y desarrollo de talento para jugadores aspirantes a profesionales', 'graduation', 'Activo', '2024', 2),
  ('Transmisiones en Vivo', 'Lives y streams profesionales de torneos y eventos competitivos', 'video', 'Activo', '2024', 3),
  ('Alianzas Estratégicas', 'Colaboraciones con marcas y organizaciones para el crecimiento del ecosistema', 'handshake', 'Activo', '2024', 4)
) v(title, description, icon, status_label, period, sort_order)
where not exists (select 1 from public.projects);

-- Imágenes de proyectos: lectura pública, escritura solo con permiso de contenido
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-images', 'project-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;
drop policy if exists "storage: proyectos con permiso (subida)" on storage.objects;
create policy "storage: proyectos con permiso (subida)" on storage.objects
  for insert to authenticated with check (bucket_id = 'project-images' and (private.has_permission('site.content') or private.has_permission('site.manage')));
drop policy if exists "storage: proyectos con permiso (cambio)" on storage.objects;
create policy "storage: proyectos con permiso (cambio)" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-images' and (private.has_permission('site.content') or private.has_permission('site.manage')))
  with check (bucket_id = 'project-images' and (private.has_permission('site.content') or private.has_permission('site.manage')));
drop policy if exists "storage: proyectos con permiso (borrado)" on storage.objects;
create policy "storage: proyectos con permiso (borrado)" on storage.objects
  for delete to authenticated using (bucket_id = 'project-images' and (private.has_permission('site.content') or private.has_permission('site.manage')));

-- ---------------------------------------------------------------------------
-- 7. Estadísticas (Superadmin) y listado de usuarios (Admin y Superadmin)
-- ---------------------------------------------------------------------------
create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('platform.stats') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total',        (select count(*) from auth.users),
    'users_new_7d',       (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_new_30d',      (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'users_active_30d',   (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'posts_total',        (select count(*) from public.posts),
    'news_published',     (select count(*) from public.news where published),
    'projects_active',    (select count(*) from public.projects where active),
    'tournaments_active', (select count(*) from public.tournaments where status in ('upcoming', 'ongoing')),
    'tournaments_done',   (select count(*) from public.tournaments where status = 'finished'),
    'reports_open',       (select count(*) from public.reports where status = 'open'),
    'suspended_now',      (select count(distinct user_id) from public.user_suspensions
                            where lifted_at is null and (until is null or until > now())),
    'signups_weekly',     (select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'count', w.n) order by w.week), '[]'::jsonb)
                           from (select gs::date as week,
                                        (select count(*) from auth.users u
                                          where u.created_at >= gs and u.created_at < gs + interval '7 days') as n
                                 from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') gs) w)
  );
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_role text default null, p_limit int default 100)
returns table (
  id uuid, display_name text, avatar_url text, roles text[], provider text,
  created_at timestamptz, last_sign_in_at timestamptz, suspended_until timestamptz, suspended boolean, max_rank int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('users.view') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return query
  select p.id, p.display_name, p.avatar_url,
         coalesce((select array_agg(ur.role_key order by r.rank desc) from public.user_roles ur join public.roles r on r.key = ur.role_key where ur.user_id = p.id), '{}'),
         coalesce(u.raw_app_meta_data ->> 'provider', p.auth_provider),
         u.created_at, u.last_sign_in_at,
         (select s.until from public.user_suspensions s where s.user_id = p.id and s.lifted_at is null and (s.until is null or s.until > now()) order by s.created_at desc limit 1),
         private.is_suspended(p.id),
         private.user_max_rank(p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where (p_search is null or p_search = '' or p.display_name ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%' or p.id::text = p_search)
    and (p_role is null or p_role = '' or
         (p_role = 'user' and not exists (select 1 from public.user_roles x where x.user_id = p.id)) or
         exists (select 1 from public.user_roles x where x.user_id = p.id and x.role_key = p_role))
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Rango propio (para que la web sepa qué roles puede ofrecer; la base vuelve a validarlo)
create or replace function public.my_rank()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_max_rank((select auth.uid()));
$$;

revoke all on function public.platform_stats() from public, anon;
revoke all on function public.admin_list_users(text, text, int) from public, anon;
revoke all on function public.my_rank() from public, anon;
grant execute on function public.platform_stats() to authenticated;
grant execute on function public.admin_list_users(text, text, int) to authenticated;
grant execute on function public.my_rank() to authenticated;

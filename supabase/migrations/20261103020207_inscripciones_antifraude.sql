-- WAYIRA E-SPORTS — inscripción de equipos sin teléfono ni correo, con medidas antifraude.
-- Aprobado por el dueño del proyecto el 2026-11-02.
--
--  * Se eliminan los datos de contacto de jugadores (tabla y permiso).
--  * Estados del equipo: pending (espera aprobación), approved, rejected, waitlisted (lista de espera), withdrawn.
--    Los cupos los ocupan pending + approved. Si el torneo está lleno, la inscripción entra en lista de espera.
--  * Al rechazar, retirar o borrar un equipo que ocupaba cupo, sube el primero de la lista de espera.
--  * Riot ID obligatorio para el capitán (en su perfil) y para cada jugador; un Riot ID no puede estar en dos
--    equipos activos del mismo torneo.
--  * Máximo 3 inscripciones por usuario cada 24 horas.
--  * El capitán solo retira su equipo antes del inicio, y hace check-in en la ventana previa al inicio.

-- ---------------------------------------------------------------------------
-- Sin datos de contacto
-- ---------------------------------------------------------------------------
drop table public.tournament_player_contacts;

-- ---------------------------------------------------------------------------
-- Estado de la inscripción y check-in
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column check_in_minutes int not null default 60 check (check_in_minutes between 0 and 1440);

alter table public.tournament_teams
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'waitlisted', 'withdrawn')),
  add column checked_in_at timestamptz,
  add column decided_by uuid references public.profiles (id) on delete set null,
  add column decided_at timestamptz;
create index tournament_teams_status_idx on public.tournament_teams (tournament_id, status, registered_at);
create index tournament_teams_decided_by_idx on public.tournament_teams (decided_by);

alter table public.tournament_players
  add constraint tournament_players_riot_format check (
    game_name is null or (char_length(game_name) between 3 and 16 and coalesce(tag_line, '') ~ '^[A-Za-z0-9]{3,5}$')
  );

-- Quién gestiona puede cambiar el estado; el navegador no puede tocar fechas de decisión ni check-in
revoke update on public.tournament_teams from authenticated;
grant update (name, logo_url, status) on public.tournament_teams to authenticated;

-- El capitán ya no borra su equipo (usa withdraw_team, que respeta el inicio y la lista de espera)
drop policy "teams: borra gestión o capitán" on public.tournament_teams;
create policy "teams: borra gestión" on public.tournament_teams
  for delete to authenticated using (private.has_permission('tournaments.manage'));

-- ---------------------------------------------------------------------------
-- Reglas de cupo y lista de espera (se aplican también a quien gestiona)
-- ---------------------------------------------------------------------------
create or replace function private.team_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_active int;
begin
  if new.status is distinct from old.status then
    if new.status in ('pending', 'approved') and old.status not in ('pending', 'approved') then
      select max_teams into v_max from public.tournaments where id = new.tournament_id for update;
      select count(*) into v_active from public.tournament_teams
       where tournament_id = new.tournament_id and status in ('pending', 'approved') and id <> new.id;
      if v_active >= v_max then
        raise exception 'El torneo no tiene cupos libres' using errcode = '22023';
      end if;
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := now();
    if new.status <> 'approved' then new.checked_in_at := null; end if;
  end if;
  return new;
end;
$$;
create trigger tournament_teams_status_guard before update on public.tournament_teams
  for each row execute function private.team_status_guard();

create or replace function private.promote_waitlist(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_active int;
  v_next uuid;
begin
  select max_teams into v_max from public.tournaments where id = p_tournament for update;
  if v_max is null then return; end if;
  select count(*) into v_active from public.tournament_teams
   where tournament_id = p_tournament and status in ('pending', 'approved');
  while v_active < v_max loop
    select id into v_next from public.tournament_teams
     where tournament_id = p_tournament and status = 'waitlisted'
     order by registered_at, id limit 1 for update skip locked;
    exit when v_next is null;
    update public.tournament_teams set status = 'pending' where id = v_next;
    v_active := v_active + 1;
    v_next := null;
  end loop;
end;
$$;

create or replace function private.on_team_slot_freed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('pending', 'approved') then perform private.promote_waitlist(old.tournament_id); end if;
    return old;
  end if;
  if old.status in ('pending', 'approved') and new.status in ('rejected', 'withdrawn') then
    perform private.promote_waitlist(new.tournament_id);
  end if;
  return new;
end;
$$;
create trigger tournament_teams_slot_freed_upd after update of status on public.tournament_teams
  for each row execute function private.on_team_slot_freed();
create trigger tournament_teams_slot_freed_del after delete on public.tournament_teams
  for each row execute function private.on_team_slot_freed();

-- ---------------------------------------------------------------------------
-- Inscripción (misma firma; ya no recibe teléfono ni correo)
-- p_players: [{display_name, game_name, tag_line, position, main_champion, is_substitute, user_id?}]
-- ---------------------------------------------------------------------------
create or replace function public.register_team(
  p_tournament uuid,
  p_name text,
  p_logo_url text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_t public.tournaments%rowtype;
  v_team uuid;
  v_item jsonb;
  v_order int := 0;
  v_active int;
  v_status text;
  v_riot text[];
  v_player_user uuid;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;

  -- Límite general: 3 inscripciones cada 24 horas por usuario
  perform pg_advisory_xact_lock(hashtext('register_team:' || v_uid::text));
  if (select count(*) from public.tournament_teams
      where captain_id = v_uid and registered_at > now() - interval '24 hours') >= 3 then
    raise exception 'Alcanzaste el máximo de 3 inscripciones en 24 horas' using errcode = '54000';
  end if;

  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Torneo no encontrado' using errcode = 'P0002'; end if;
  if v_t.status <> 'upcoming' or v_t.confirmed or (v_t.start_date is not null and v_t.start_date <= now()) then
    raise exception 'Las inscripciones están cerradas' using errcode = '22023';
  end if;
  if exists (select 1 from public.tournament_teams
             where tournament_id = p_tournament and captain_id = v_uid
               and status in ('pending', 'approved', 'waitlisted')) then
    raise exception 'Ya tienes un equipo inscrito en este torneo' using errcode = '23505';
  end if;
  if not exists (select 1 from public.profiles
                 where id = v_uid and riot_game_name is not null and riot_tag_line is not null) then
    raise exception 'Agrega tu Riot ID a tu perfil antes de inscribir un equipo' using errcode = '22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 then
    raise exception 'Nombre de equipo no válido' using errcode = '22023';
  end if;
  if p_logo_url is not null and p_logo_url !~ '^https://' then
    raise exception 'Logo no válido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) not between 1 and 10 then
    raise exception 'Lista de jugadores no válida' using errcode = '22023';
  end if;

  -- Riot ID obligatorio, con formato, sin repetir en el equipo ni en otro equipo activo del torneo
  select array_agg(lower(btrim(e ->> 'game_name')) || '#' || lower(btrim(e ->> 'tag_line')))
    into v_riot from jsonb_array_elements(p_players) e;
  if exists (select 1 from jsonb_array_elements(p_players) e
             where coalesce(char_length(btrim(e ->> 'game_name')), 0) not between 3 and 16
                or coalesce(btrim(e ->> 'tag_line'), '') !~ '^[A-Za-z0-9]{3,5}$') then
    raise exception 'Cada jugador necesita un Riot ID válido (nombre#TAG)' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(v_riot) x) <> cardinality(v_riot) then
    raise exception 'Hay un Riot ID repetido en el equipo' using errcode = '23505';
  end if;
  if exists (select 1 from public.tournament_players p
             join public.tournament_teams t on t.id = p.team_id
             where t.tournament_id = p_tournament and t.status in ('pending', 'approved', 'waitlisted')
               and lower(p.game_name) || '#' || lower(p.tag_line) = any (v_riot)) then
    raise exception 'Uno de los Riot ID ya está inscrito en otro equipo de este torneo' using errcode = '23505';
  end if;

  select count(*) into v_active from public.tournament_teams
   where tournament_id = p_tournament and status in ('pending', 'approved');
  v_status := case when v_active >= v_t.max_teams then 'waitlisted' else 'pending' end;

  insert into public.tournament_teams (tournament_id, name, logo_url, captain_id, captain_name, status)
  values (p_tournament, btrim(p_name), p_logo_url, v_uid,
          (select display_name from public.profiles where id = v_uid), v_status)
  returning id into v_team;

  for v_item in select * from jsonb_array_elements(p_players) loop
    v_player_user := null;
    if v_item ? 'user_id' and nullif(v_item ->> 'user_id', '') is not null then
      select id into v_player_user from public.profiles where id = (v_item ->> 'user_id')::uuid;
    end if;
    insert into public.tournament_players (team_id, user_id, display_name, game_name, tag_line, position,
                                           main_champion, is_substitute, sort_order)
    values (v_team, v_player_user,
            left(coalesce(nullif(btrim(v_item ->> 'display_name'), ''), btrim(v_item ->> 'game_name')), 60),
            btrim(v_item ->> 'game_name'), btrim(v_item ->> 'tag_line'), left(v_item ->> 'position', 20),
            left(v_item ->> 'main_champion', 40), coalesce((v_item ->> 'is_substitute')::boolean, false), v_order);
    v_order := v_order + 1;
  end loop;
  return v_team;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acciones del capitán
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.tournament_teams%rowtype;
  v_t public.tournaments%rowtype;
begin
  select * into v_team from public.tournament_teams where id = p_team for update;
  if not found or v_team.captain_id is distinct from (select auth.uid()) then
    raise exception 'Solo el capitán puede retirar su equipo' using errcode = '42501';
  end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.status <> 'upcoming' or (v_t.start_date is not null and v_t.start_date <= now()) then
    raise exception 'El torneo ya empezó: habla con el organizador' using errcode = '22023';
  end if;
  if v_team.status in ('rejected', 'withdrawn') then return; end if;
  update public.tournament_teams set status = 'withdrawn' where id = p_team;
end;
$$;

create or replace function public.check_in_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.tournament_teams%rowtype;
  v_t public.tournaments%rowtype;
begin
  select * into v_team from public.tournament_teams where id = p_team for update;
  if not found or v_team.captain_id is distinct from (select auth.uid()) then
    raise exception 'Solo el capitán puede hacer check-in' using errcode = '42501';
  end if;
  if v_team.status <> 'approved' then
    raise exception 'El equipo aún no está aprobado' using errcode = '22023';
  end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.start_date is null or v_t.check_in_minutes = 0
     or now() < v_t.start_date - make_interval(mins => v_t.check_in_minutes) or now() >= v_t.start_date then
    raise exception 'El check-in no está abierto' using errcode = '22023';
  end if;
  update public.tournament_teams set checked_in_at = now() where id = p_team;
end;
$$;

-- Al cerrar el check-in, los equipos aprobados sin check-in pierden el cupo (solo quien gestiona torneos)
create or replace function public.close_check_in(p_tournament uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not private.has_permission('tournaments.manage') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.tournament_teams set status = 'withdrawn'
   where tournament_id = p_tournament and status = 'approved' and checked_in_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- El trigger de estado necesita escribir checked_in_at aunque el navegador no tenga ese permiso:
-- check_in_team es security definer, así que lo hace como propietario.

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_permission(text)              to anon, authenticated;
grant execute on function private.is_conversation_member(uuid)      to authenticated;
grant execute on function public.count_registered_users()           to anon, authenticated;
grant execute on function public.get_user_email(uuid, text, uuid)   to authenticated;
grant execute on function public.start_conversation(uuid)           to authenticated;
grant execute on function public.mark_conversation_read(uuid)       to authenticated;
grant execute on function public.register_team(uuid, text, text, jsonb) to authenticated;
grant execute on function public.withdraw_team(uuid)                to authenticated;
grant execute on function public.check_in_team(uuid)                to authenticated;
grant execute on function public.close_check_in(uuid)               to authenticated;
grant execute on function public.my_permissions()                   to authenticated;
grant execute on function public.assign_role(uuid, text)            to authenticated;
grant execute on function public.revoke_role(uuid, text)            to authenticated;

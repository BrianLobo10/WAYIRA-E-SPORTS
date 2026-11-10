-- Partidas de League of Legends guardadas para el dashboard de estadísticas del perfil.
-- Cada partida se descarga de Riot UNA sola vez (aunque la jueguen varios usuarios de Wayira) y se guarda
-- en versión reducida (~3 KB). Solo la Edge Function "riot" (service_role) lee y escribe estas tablas.

create table if not exists public.riot_matches (
  match_id text primary key check (match_id ~ '^[A-Z0-9]{2,6}_[0-9]{4,15}$'),
  game_creation timestamptz not null,
  queue_id integer not null,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Qué partidas tiene cada jugador. El PUUID depende de la clave de Riot: si cambia la clave, los enlaces
-- se rehacen solos (las partidas ya guardadas se reutilizan sin volver a pedirlas).
create table if not exists public.riot_player_matches (
  puuid text not null check (length(puuid) between 40 and 100),
  match_id text not null references public.riot_matches (match_id) on delete cascade,
  game_creation timestamptz not null,
  queue_id integer not null,
  primary key (puuid, match_id)
);
create index if not exists riot_player_matches_recent on public.riot_player_matches (puuid, game_creation desc);

-- Progreso de la descarga por jugador (lo que falta y un candado para que no se descargue dos veces a la vez)
create table if not exists public.riot_sync_state (
  puuid text primary key check (length(puuid) between 40 and 100),
  ids_synced_at timestamptz,
  pending text[] not null default '{}',
  total integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.riot_matches enable row level security;
alter table public.riot_player_matches enable row level security;
alter table public.riot_sync_state enable row level security;
revoke all on public.riot_matches, public.riot_player_matches, public.riot_sync_state from anon, authenticated;

-- Toma el candado de sincronización (null si otra descarga del mismo jugador sigue en curso)
create or replace function public.riot_sync_lock(p_puuid text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.riot_sync_state;
begin
  insert into public.riot_sync_state (puuid) values (p_puuid) on conflict (puuid) do nothing;
  update public.riot_sync_state
     set locked_until = now() + interval '50 seconds', updated_at = now()
   where puuid = p_puuid and (locked_until is null or locked_until < now())
  returning * into s;
  return case when s.puuid is null then null else to_jsonb(s) end;
end;
$$;

-- Enlaza al jugador con las partidas que ya están guardadas y devuelve las que faltan por descargar
create or replace function public.riot_link_known(p_puuid text, p_ids text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  missing text[];
begin
  insert into public.riot_player_matches (puuid, match_id, game_creation, queue_id)
  select p_puuid, m.match_id, m.game_creation, m.queue_id
    from public.riot_matches m
   where m.match_id = any (p_ids)
  on conflict do nothing;

  select coalesce(array_agg(i order by ord), '{}') into missing
    from unnest(p_ids) with ordinality as t(i, ord)
   where not exists (select 1 from public.riot_matches m where m.match_id = t.i);
  return missing;
end;
$$;

-- Guarda una partida descargada y la enlaza al jugador
create or replace function public.riot_store_match(p_puuid text, p_match_id text, p_created timestamptz, p_queue integer, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.riot_matches (match_id, game_creation, queue_id, data)
  values (p_match_id, p_created, p_queue, p_data)
  on conflict (match_id) do nothing;
  insert into public.riot_player_matches (puuid, match_id, game_creation, queue_id)
  values (p_puuid, p_match_id, p_created, p_queue)
  on conflict do nothing;
end;
$$;

-- Guarda el progreso, suelta el candado y devuelve cuántas partidas tiene ya guardadas el jugador
create or replace function public.riot_sync_save(p_puuid text, p_pending text[], p_total integer, p_ids_synced boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.riot_sync_state
     set pending = coalesce(p_pending, '{}'),
         total = greatest(coalesce(p_total, 0), 0),
         ids_synced_at = case when p_ids_synced then now() else ids_synced_at end,
         locked_until = null,
         updated_at = now()
   where puuid = p_puuid;
  select count(*) into n from public.riot_player_matches where puuid = p_puuid;
  return n;
end;
$$;

-- Partidas guardadas de un jugador desde una fecha (más recientes primero)
create or replace function public.riot_history(p_puuid text, p_since timestamptz)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select m.data
    from public.riot_player_matches pm
    join public.riot_matches m on m.match_id = pm.match_id
   where pm.puuid = p_puuid and pm.game_creation >= p_since
   order by pm.game_creation desc
   limit 1500;
$$;

revoke all on function public.riot_sync_lock(text) from public, anon, authenticated;
revoke all on function public.riot_link_known(text, text[]) from public, anon, authenticated;
revoke all on function public.riot_store_match(text, text, timestamptz, integer, jsonb) from public, anon, authenticated;
revoke all on function public.riot_sync_save(text, text[], integer, boolean) from public, anon, authenticated;
revoke all on function public.riot_history(text, timestamptz) from public, anon, authenticated;
grant execute on function public.riot_sync_lock(text) to service_role;
grant execute on function public.riot_link_known(text, text[]) to service_role;
grant execute on function public.riot_store_match(text, text, timestamptz, integer, jsonb) to service_role;
grant execute on function public.riot_sync_save(text, text[], integer, boolean) to service_role;
grant execute on function public.riot_history(text, timestamptz) to service_role;
grant select, insert, update, delete on public.riot_matches, public.riot_player_matches, public.riot_sync_state to service_role;

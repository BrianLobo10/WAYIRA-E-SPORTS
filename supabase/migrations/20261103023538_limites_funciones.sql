-- WAYIRA E-SPORTS — contador de límites para las funciones de servidor (Riot, POTATO, redes sociales).
-- Lo usan solo las Edge Functions con la clave de servidor; ni visitantes ni usuarios pueden llamarlo.

create table private.rate_limits (
  bucket        text primary key check (char_length(bucket) <= 200),
  window_start  timestamptz not null,
  hits          int not null
);
-- Sin políticas: nadie la lee ni la escribe salvo la función de abajo (que corre como propietaria)
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

create or replace function public.consume_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits <= p_max;
$$;

revoke execute on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;

-- Limpieza de contadores viejos (la llama la misma tarea diaria de limpieza)
create or replace function private.purge_rate_limits()
returns int
language sql
security definer
set search_path = ''
as $$
  with d as (delete from private.rate_limits where window_start < now() - interval '2 days' returning 1)
  select count(*)::int from d;
$$;
revoke execute on function private.purge_rate_limits() from public, anon, authenticated;
grant execute on function private.purge_rate_limits() to service_role;

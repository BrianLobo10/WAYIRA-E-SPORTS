-- Pruebas de las partidas guardadas para el dashboard (20261110000000_riot_partidas.sql)
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- T1 los visitantes y usuarios no pueden leer ni escribir las tablas ni llamar a las funciones
set role anon;
do $$ begin
  begin perform 1 from public.riot_matches; raise exception 'FALLO T1: anon lee riot_matches';
  exception when insufficient_privilege then null; end;
  begin perform public.riot_history(repeat('p', 78), now()); raise exception 'FALLO T1: anon llama a riot_history';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin insert into public.riot_matches values ('LA1_1', now(), 420, '{}'); raise exception 'FALLO T1: authenticated escribe';
  exception when insufficient_privilege then null; end;
  begin perform public.riot_store_match(repeat('p', 78), 'LA1_1', now(), 420, '{}'); raise exception 'FALLO T1: authenticated guarda partidas';
  exception when insufficient_privilege then null; end;
  raise notice 'OK T1 anon y authenticated no tocan las partidas guardadas';
end $$;
reset role;

-- T2 flujo de la Edge Function (service_role): candado, enlaces, guardado e historial
set role service_role;
do $$
declare
  a text := repeat('a', 78); b text := repeat('b', 78);
  s jsonb; missing text[]; n int; h jsonb[];
begin
  s := public.riot_sync_lock(a); assert s->>'puuid' = a and s->'pending' = '[]', 'toma el candado';
  assert public.riot_sync_lock(a) is null, 'segunda descarga simultánea bloqueada';

  missing := public.riot_link_known(a, array['LA1_3000', 'LA1_2000', 'LA1_1000']);
  assert missing = array['LA1_3000', 'LA1_2000', 'LA1_1000'], 'sin partidas guardadas faltan todas, en orden';

  perform public.riot_store_match(a, 'LA1_3000', now() - interval '1 day', 420, '{"id":"LA1_3000"}');
  perform public.riot_store_match(a, 'LA1_2000', now() - interval '2 day', 450, '{"id":"LA1_2000"}');
  perform public.riot_store_match(a, 'LA1_2000', now() - interval '2 day', 450, '{"id":"LA1_2000"}'); -- repetida: no duplica
  n := public.riot_sync_save(a, array['LA1_1000'], 3, true);
  assert n = 2, 'dos partidas enlazadas';
  assert public.riot_sync_lock(a) is not null, 'candado liberado al guardar';

  -- Otro jugador de la misma partida la reutiliza sin descargarla
  missing := public.riot_link_known(b, array['LA1_3000', 'LA1_9999']);
  assert missing = array['LA1_9999'], 'solo falta la que nadie tiene';
  select count(*) into n from public.riot_player_matches where puuid = b; assert n = 1, 'enlace reutilizado';
  select count(*) into n from public.riot_matches; assert n = 2, 'cada partida se guarda una vez';

  select array_agg(x) into h from public.riot_history(a, now() - interval '10 day') x;
  assert h[1]->>'id' = 'LA1_3000' and h[2]->>'id' = 'LA1_2000', 'historial más reciente primero';
  select count(*) into n from public.riot_history(a, now() - interval '36 hours'); assert n = 1, 'filtra por fecha';

  begin perform public.riot_store_match(a, 'x; drop table', now(), 1, '{}'); raise exception 'FALLO T2: aceptó un id inválido';
  exception when check_violation then null; end;
  raise notice 'OK T2 candado, partidas reutilizadas entre jugadores, sin duplicados, historial ordenado y filtrado';
end $$;
reset role;

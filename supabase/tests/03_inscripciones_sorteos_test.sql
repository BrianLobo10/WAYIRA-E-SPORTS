-- Pruebas de inscripciones antifraude, sorteos en el servidor, límite de conversaciones
-- y barrido de escalada de privilegios. Se ejecuta después de 01 y 02 (usa sus usuarios y roles).
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- Datos creados por el servidor
insert into public.tournaments (id, name, status, max_teams, start_date, check_in_minutes) values
 ('30000000-0000-0000-0000-000000000002', 'Liga Antifraude', 'upcoming', 2, now() + interval '30 minutes', 60),
 ('30000000-0000-0000-0000-000000000003', 'Copa 3', 'upcoming', 8, now() + interval '3 days', 60),
 ('30000000-0000-0000-0000-000000000004', 'Copa 4', 'upcoming', 8, now() + interval '3 days', 60),
 ('30000000-0000-0000-0000-000000000005', 'Copa 5', 'upcoming', 8, now() + interval '3 days', 60);
insert into public.user_roles (user_id, role_key) values ('00000000-0000-0000-0000-0000000000c0', 'organizador')
  on conflict do nothing;

-- ===================== INSCRIPCIONES =====================
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');  -- Beto
set role authenticated;
do $$ declare v uuid; begin
  begin perform public.register_team('30000000-0000-0000-0000-000000000002', 'Beto Team', null, '[{"game_name":"Beto1","tag_line":"LAN"}]');
        raise exception 'FALLO I1: inscribió sin Riot ID en su perfil';
  exception when invalid_parameter_value then null; end;
  update public.profiles set riot_game_name = 'BetoD', riot_tag_line = 'LAS' where id = auth.uid();
  begin perform public.register_team('30000000-0000-0000-0000-000000000002', 'Beto Team', null, '[{"game_name":"Be","tag_line":"LAN"}]');
        raise exception 'FALLO I1: aceptó un Riot ID inválido';
  exception when invalid_parameter_value then null; end;
  begin perform public.register_team('30000000-0000-0000-0000-000000000002', 'Beto Team', null,
        '[{"game_name":"BetoD","tag_line":"LAS"},{"game_name":"betod","tag_line":"las"}]');
        raise exception 'FALLO I1: aceptó un Riot ID repetido en el equipo';
  exception when unique_violation then null; end;
  begin perform public.register_team('30000000-0000-0000-0000-000000000002', 'Beto Team', null,
        '[{"game_name":"BetoD","tag_line":"LAS","phone":"3000000000"}]');
  end;
  assert not exists (select 1 from information_schema.tables where table_name = 'tournament_player_contacts'), 'ya no existen contactos';
  raise notice 'OK I1 Riot ID obligatorio y válido, sin repetidos; no se guardan teléfonos';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');  -- Caro
set role authenticated;
do $$ begin
  update public.profiles set riot_game_name = 'CaroX', riot_tag_line = 'NA1' where id = auth.uid();
  begin perform public.register_team('30000000-0000-0000-0000-000000000002', 'Caro Team', null,
        '[{"game_name":"CaroX","tag_line":"NA1"},{"game_name":"BETOD","tag_line":"LAS"}]');
        raise exception 'FALLO I2: un Riot ID en dos equipos del mismo torneo';
  exception when unique_violation then null; end;
  perform public.register_team('30000000-0000-0000-0000-000000000002', 'Caro Team', null, '[{"game_name":"CaroX","tag_line":"NA1"}]');
  raise notice 'OK I2 un Riot ID no puede estar en dos equipos del mismo torneo';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');  -- Ana: torneo lleno
set role authenticated;
do $$ declare s text; begin
  perform public.register_team('30000000-0000-0000-0000-000000000002', 'Ana Team 2', null, '[{"game_name":"AnaW","tag_line":"LAN"}]');
  select status into s from public.tournament_teams where name = 'Ana Team 2'; assert s = 'waitlisted', 'lista de espera';
  raise notice 'OK I3 con el torneo lleno, la inscripción entra en lista de espera';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');  -- Organizador
set role authenticated;
do $$ declare s text; begin
  update public.tournament_teams set status = 'rejected' where name = 'Beto Team';
  select status into s from public.tournament_teams where name = 'Ana Team 2';
  assert s = 'pending', 'al rechazar, sube el primero de la lista de espera';
  begin update public.tournament_teams set status = 'approved' where name = 'Beto Team';
        raise exception 'FALLO I4: aprobó por encima del cupo';
  exception when invalid_parameter_value then null; end;
  update public.tournament_teams set status = 'approved' where name in ('Ana Team 2', 'Caro Team');
  raise notice 'OK I4 rechazar libera el cupo y sube la lista de espera; nadie aprueba por encima del cupo';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  begin perform public.withdraw_team((select id from public.tournament_teams where name = 'Caro Team'));
        raise exception 'FALLO I5: retiró un equipo ajeno';
  exception when insufficient_privilege then null; end;
  begin update public.tournament_teams set checked_in_at = now() where name = 'Ana Team 2';
        raise exception 'FALLO I5: hizo check-in sin la función';
  exception when insufficient_privilege then null; end;
  begin delete from public.tournament_teams where name = 'Ana Team 2'; end;
  assert exists (select 1 from public.tournament_teams where name = 'Ana Team 2'), 'el capitán no borra: retira';
  perform public.check_in_team((select id from public.tournament_teams where name = 'Ana Team 2'));
  assert (select checked_in_at from public.tournament_teams where name = 'Ana Team 2') is not null, 'check-in';
  raise notice 'OK I5 solo el capitán retira o hace check-in, y solo con las funciones';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');  -- Beto: límite de 3 inscripciones en 24 h
set role authenticated;
do $$ begin
  perform public.register_team('30000000-0000-0000-0000-000000000003', 'Beto 3', null, '[{"game_name":"BetoD","tag_line":"LAS"}]');
  perform public.register_team('30000000-0000-0000-0000-000000000004', 'Beto 4', null, '[{"game_name":"BetoD","tag_line":"LAS"}]');
  begin perform public.register_team('30000000-0000-0000-0000-000000000005', 'Beto 5', null, '[{"game_name":"BetoD","tag_line":"LAS"}]');
        raise exception 'FALLO I6: superó 3 inscripciones en 24 horas';
  exception when program_limit_exceeded then null; end;
  begin perform public.close_check_in('30000000-0000-0000-0000-000000000002'); raise exception 'FALLO I6: usuario cerró check-in';
  exception when insufficient_privilege then null; end;
  raise notice 'OK I6 máximo 3 inscripciones en 24 horas; solo la organización cierra el check-in';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');
set role authenticated;
do $$ declare n int; begin
  n := public.close_check_in('30000000-0000-0000-0000-000000000002');
  assert n = 1, 'Caro no hizo check-in';
  assert (select status from public.tournament_teams where name = 'Caro Team') = 'withdrawn', 'sin check-in pierde el cupo';
  assert (select status from public.tournament_teams where name = 'Ana Team 2') = 'approved', 'con check-in sigue';
  raise notice 'OK I7 al cerrar el check-in, los aprobados sin check-in pierden el cupo';
end $$;
reset role;

update public.tournaments set start_date = now() - interval '1 minute' where id = '30000000-0000-0000-0000-000000000002';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  begin perform public.withdraw_team((select id from public.tournament_teams where name = 'Ana Team 2'));
        raise exception 'FALLO I8: retiró con el torneo empezado';
  exception when invalid_parameter_value then null; end;
  begin perform public.register_team('30000000-0000-0000-0000-000000000002', 'Tarde', null, '[{"game_name":"AnaW","tag_line":"LAN"}]');
        raise exception 'FALLO I8: inscribió con el torneo empezado';
  exception when invalid_parameter_value then null; end;
  raise notice 'OK I8 con el torneo empezado no se retira ni se inscribe nadie';
end $$;
reset role;

-- ===================== SORTEOS =====================
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  begin insert into public.giveaways (title) values ('Sorteo falso'); raise exception 'FALLO S1: usuario creó sorteo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK S1 un usuario no crea sorteos';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');
set role authenticated;
do $$ declare g uuid; begin
  insert into public.giveaways (title, entry_mode, winners_count)
  values ('Skins de diciembre', 'users', 2) returning id into g;
  perform set_config('prueba.sorteo', g::text, false);
  begin update public.giveaways set status = 'drawn' where id = current_setting('prueba.sorteo')::uuid;
        raise exception 'FALLO S2: marcó ganador a mano';
  exception when insufficient_privilege then null; end;
  begin update public.giveaways set drawn_at = now() where id = current_setting('prueba.sorteo')::uuid;
        raise exception 'FALLO S2: tocó la fecha de ejecución';
  exception when insufficient_privilege then null; end;
  raise notice 'OK S2 nadie marca un sorteo como ejecutado a mano';
end $$;
reset role;

select pg_temp.as_user(null);
set role anon;
do $$ begin
  assert (select count(*) from public.giveaways) = 0, 'borrador invisible';
  raise notice 'OK S3 los borradores no son visibles para el público';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  begin insert into public.giveaway_entries (giveaway_id, user_id) values (current_setting('prueba.sorteo')::uuid, auth.uid());
        raise exception 'FALLO S4: se apuntó a un borrador';
  exception when insufficient_privilege then null; end;
  raise notice 'OK S4 no se apunta nadie antes de abrir';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');
set role authenticated;
update public.giveaways set status = 'open' where id = current_setting('prueba.sorteo')::uuid;
reset role;

do $$ declare u text; begin
  foreach u in array array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'] loop
    perform set_config('request.jwt.claim.sub', u, false);
    set local role authenticated;
    insert into public.giveaway_entries (giveaway_id, user_id) values (current_setting('prueba.sorteo')::uuid, u::uuid);
    reset role;
  end loop;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  begin insert into public.giveaway_entries (giveaway_id, user_id) values (current_setting('prueba.sorteo')::uuid, auth.uid());
        raise exception 'FALLO S5: se apuntó dos veces';
  exception when unique_violation then null; end;
  begin insert into public.giveaway_entries (giveaway_id, user_id) values (current_setting('prueba.sorteo')::uuid, '00000000-0000-0000-0000-0000000000e0');
        raise exception 'FALLO S5: apuntó a otro';
  exception when insufficient_privilege then null; end;
  begin perform public.draw_giveaway(current_setting('prueba.sorteo')::uuid); raise exception 'FALLO S5: usuario ejecutó el sorteo';
  exception when insufficient_privilege then null; end;
  begin insert into public.giveaway_winners (giveaway_id, entry_id, position)
        values (current_setting('prueba.sorteo')::uuid, (select id from public.giveaway_entries where user_id = auth.uid()), 1);
        raise exception 'FALLO S5: se declaró ganador';
  exception when insufficient_privilege then null; end;
  raise notice 'OK S5 un usuario se apunta una vez, no apunta a otros, no ejecuta ni se declara ganador';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.draw_giveaway(current_setting('prueba.sorteo')::uuid);
  assert n = 2, 'dos ganadores';
  assert (select count(distinct entry_id) from public.giveaway_winners where giveaway_id = current_setting('prueba.sorteo')::uuid) = 2, 'distintos';
  assert (select entries_at_draw from public.giveaways where id = current_setting('prueba.sorteo')::uuid) = 3, 'participantes congelados';
  begin perform public.draw_giveaway(current_setting('prueba.sorteo')::uuid); raise exception 'FALLO S6: repitió el sorteo';
  exception when invalid_parameter_value then null; end;
  begin update public.giveaways set title = 'Cambiado' where id = current_setting('prueba.sorteo')::uuid;
        raise exception 'FALLO S6: modificó un sorteo ejecutado';
  exception when insufficient_privilege then null; end;
  begin delete from public.giveaways where id = current_setting('prueba.sorteo')::uuid; raise exception 'FALLO S6: borró un sorteo ejecutado';
  exception when insufficient_privilege then null; end;
  delete from public.giveaway_entries where giveaway_id = current_setting('prueba.sorteo')::uuid; get diagnostics n = row_count;
  assert n = 0, 'participantes congelados tras el sorteo';
  raise notice 'OK S6 el sorteo se ejecuta una sola vez en el servidor y queda inmutable';
end $$;
reset role;

select pg_temp.as_user(null);
set role anon;
do $$ begin
  assert (select count(*) from public.giveaway_winners) = 2, 'ganadores públicos';
  raise notice 'OK S7 los ganadores son públicos';
end $$;
reset role;

-- Aleatoriedad: 600 sorteos de 1 ganador entre 3 nombres; cada uno debe ganar cerca de 1/3
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');
set role authenticated;
do $$ declare g uuid; a int; b int; c int; begin
  for i in 1..600 loop
    insert into public.giveaways (title, entry_mode, winners_count) values ('Prueba ' || i, 'list', 1) returning id into g;
    insert into public.giveaway_entries (giveaway_id, label) values (g, 'A'), (g, 'B'), (g, 'C');
    update public.giveaways set status = 'open' where id = g;
    perform public.draw_giveaway(g);
  end loop;
  select count(*) filter (where e.label = 'A'), count(*) filter (where e.label = 'B'), count(*) filter (where e.label = 'C')
    into a, b, c
    from public.giveaway_winners w join public.giveaway_entries e on e.id = w.entry_id where e.label in ('A', 'B', 'C');
  assert least(a, b, c) > 140 and greatest(a, b, c) < 260, format('reparto sesgado: %s / %s / %s', a, b, c);
  raise notice 'OK S8 reparto uniforme en 600 sorteos (A=%, B=%, C=%)', a, b, c;
end $$;
reset role;

-- ===================== CONVERSACIONES =====================
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'z' || i || '@example.com', '{}', '{"provider":"google"}'
  from generate_series(1, 25) i;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare made int; begin
  made := (select count(*) from public.conversations where created_by = auth.uid());
  for i in 1..(20 - made) loop
    perform public.start_conversation(('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid);
  end loop;
  begin perform public.start_conversation('00000000-0000-0000-0000-000000000125'); raise exception 'FALLO C1: superó 20 por hora';
  exception when program_limit_exceeded then null; end;
  perform public.start_conversation('00000000-0000-0000-0000-00000000000b');  -- reabrir una existente no cuenta
  raise notice 'OK C1 máximo 20 conversaciones nuevas por hora; reabrir una existente sigue funcionando';
end $$;
reset role;

-- ===================== ESCALADA DE PRIVILEGIOS =====================
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  begin perform private.user_max_rank(auth.uid()); raise exception 'FALLO E1: ejecutó user_max_rank';
  exception when insufficient_privilege then null; end;
  begin insert into public.user_roles (user_id, role_key) values (auth.uid(), 'superadmin'); raise exception 'FALLO E1: se dio superadmin';
  exception when insufficient_privilege then null; end;
  begin update public.roles set rank = 1 where key = 'superadmin'; raise exception 'FALLO E1: cambió rangos';
  exception when insufficient_privilege then null; end;
  begin insert into public.role_permissions values ('moderador', 'users.view_email'); raise exception 'FALLO E1: se dio permisos';
  exception when insufficient_privilege then null; end;
  begin insert into public.email_access_log (actor_id, target_id, reason) values (auth.uid(), auth.uid(), 'falso registro');
        raise exception 'FALLO E1: escribió el registro de correos';
  exception when insufficient_privilege then null; end;
  begin insert into public.role_audit (actor_id, target_id, role_key, action) values (auth.uid(), auth.uid(), 'admin', 'grant');
        raise exception 'FALLO E1: escribió la auditoría de roles';
  exception when insufficient_privilege then null; end;
  begin update public.tournament_teams set decided_by = auth.uid() where true; raise exception 'FALLO E1: falsificó una decisión';
  exception when insufficient_privilege then null; end;
  assert public.assign_role(auth.uid(), 'moderador') is not null, 'FALLO E1: se asignó un rol';
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000a', 'Quiero el correo de Ana'); raise exception 'FALLO E1: leyó un correo';
  exception when insufficient_privilege then null; end;
  assert public.my_permissions() = '{}', 'sigue sin permisos';
  raise notice 'OK E1 un usuario normal no se eleva por tablas, funciones, auditorías ni registros';
end $$;
reset role;

-- Visitante: solo puede escribir en el formulario de contacto
do $$ declare bad text; begin
  select string_agg(format('%s:%s', c.relname, p.priv), ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv)
  where n.nspname = 'public' and c.relkind = 'r'
    and (has_table_privilege('anon', c.oid, p.priv)
         or (p.priv in ('INSERT', 'UPDATE') and has_any_column_privilege('anon', c.oid, p.priv)))
    and not (c.relname = 'contact_messages' and p.priv = 'INSERT');
  assert bad is null, 'el visitante puede escribir en: ' || coalesce(bad, '');
  raise notice 'OK E2 el visitante solo puede enviar el formulario de contacto';
end $$;

-- Ninguna tabla de seguridad es escribible por usuarios
do $$ declare bad text; begin
  select string_agg(format('%s:%s', t, p), ', ') into bad
  from unnest(array['roles', 'role_permissions', 'user_roles', 'role_audit', 'email_access_log', 'giveaway_winners', 'notifications']) t
  cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) p
  where (has_table_privilege('authenticated', 'public.' || t, p)
         or (p <> 'DELETE' and has_any_column_privilege('authenticated', 'public.' || t, p)))
    and not (t = 'notifications' and p in ('UPDATE', 'DELETE'));
  assert bad is null, 'tablas de seguridad escribibles: ' || coalesce(bad, '');
  raise notice 'OK E3 roles, permisos, auditorías, ganadores y notificaciones no son escribibles por usuarios';
end $$;

-- ===================== LÍMITES DE LAS FUNCIONES DE SERVIDOR =====================
do $$ declare ok boolean; begin
  assert public.consume_rate_limit('prueba', 2, 60) and public.consume_rate_limit('prueba', 2, 60), 'dos permitidas';
  assert not public.consume_rate_limit('prueba', 2, 60), 'la tercera se rechaza';
  update private.rate_limits set window_start = now() - interval '2 minutes' where bucket = 'prueba';
  assert public.consume_rate_limit('prueba', 2, 60), 'nueva ventana';
  assert not has_function_privilege('anon', 'public.consume_rate_limit(text,int,int)', 'execute'), 'visitante no';
  assert not has_function_privilege('authenticated', 'public.consume_rate_limit(text,int,int)', 'execute'), 'usuario no';
  assert has_function_privilege('service_role', 'public.consume_rate_limit(text,int,int)', 'execute'), 'servidor sí';
  raise notice 'OK L1 el contador de límites funciona y solo lo usa el servidor';
end $$;

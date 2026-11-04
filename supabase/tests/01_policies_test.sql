-- Pruebas de seguridad del esquema base (Postgres local con 00_supabase_stub.sql).
-- Usuarios sin roles asignados: has_permission() es false, nadie administra desde la app.
-- Cada bloque imprime "OK ..." o aborta con "FALLO ...".
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'ana@example.com',
  '{"full_name":"Ana Google","avatar_url":"https://lh3.example/ana.png"}', '{"provider":"google"}'),
 ('00000000-0000-0000-0000-00000000000b', 'beto@example.com',
  '{"custom_claims":{"global_name":"Beto Discord"},"avatar_url":"http://inseguro.example/b.png"}', '{"provider":"discord"}'),
 ('00000000-0000-0000-0000-00000000000c', 'caro@example.com', '{}', '{"provider":"discord"}');

-- Datos creados por el servidor (como lo haría el panel de Supabase)
insert into public.tournaments (id, name, status, max_teams) values
 ('10000000-0000-0000-0000-000000000001', 'Copa Wayira', 'upcoming', 2);
insert into public.news (title, published) values ('Publicada', true), ('Borrador', false);
insert into public.site_config (key, value) values ('social_stats', '{"discord":120}');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
end $$;

-- 1. Alta automática desde Google y Discord
do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Ana Google', 'nombre Google';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Beto Discord', 'nombre Discord';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000b') is null, 'avatar http descartado';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'Jugador', 'nombre por defecto';
  assert (select auth_provider from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'discord', 'proveedor';
  raise notice 'OK 1 perfiles automáticos (Google, Discord, valores por defecto, avatar solo https)';
end $$;

-- ===================== VISITANTE (sin sesión) =====================
select pg_temp.as_user(null);
set role anon;
do $$ declare n int; begin
  select count(*) into n from public.tournaments;      assert n = 1, 'torneos públicos';
  select count(*) into n from public.news;             assert n = 1, 'solo noticias publicadas';
  select count(*) into n from public.site_config;      assert n = 1, 'config pública';
  assert public.count_registered_users() = 3, 'contador';
  raise notice 'OK 2 visitante lee torneos, noticias publicadas, config y contador';

  if has_column_privilege('anon', 'public.profiles', 'display_name', 'select') then
    -- Con perfiles públicos (propuesta seguridad_lote1): ve columnas públicas, nunca las privadas
    begin perform auth_provider from public.profiles limit 1; raise exception 'FALLO 3: visitante leyó columna privada';
    exception when insufficient_privilege then null; end;
  else
    begin perform 1 from public.profiles limit 1; raise exception 'FALLO 3: visitante leyó perfiles';
    exception when insufficient_privilege then null; end;
    begin perform 1 from public.posts limit 1; raise exception 'FALLO 3: visitante leyó posts';
    exception when insufficient_privilege then null; end;
  end if;
  begin perform 1 from public.role_permissions limit 1; raise exception 'FALLO 3: visitante leyó permisos internos';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.contact_messages limit 1; raise exception 'FALLO 3: visitante leyó mensajes de contacto';
  exception when insufficient_privilege then null; end;
  begin perform public.register_team('10000000-0000-0000-0000-000000000001', 'X', null, '[]'); raise exception 'FALLO 3: visitante inscribió';
  exception when insufficient_privilege then null; end;
  begin insert into public.tournaments (name) values ('Hack'); raise exception 'FALLO 3: visitante creó torneo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 3 visitante sin acceso a perfiles, comunidad, permisos internos ni escritura';

  insert into public.contact_messages (name, email, message) values ('Visitante', 'v@example.com', 'Hola');
  begin insert into public.contact_messages (name, email, message, sender_id)
        values ('Falso', 'f@example.com', 'x', '00000000-0000-0000-0000-00000000000a');
        raise exception 'FALLO 4: visitante suplantó remitente';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 4 visitante envía contacto, sin suplantar a un usuario';
end $$;
reset role;

-- ===================== USUARIO NORMAL (Ana) =====================
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare n int; v uuid; begin
  update public.profiles set display_name = 'Ana W', bio = 'Hola' where id = auth.uid();
  get diagnostics n = row_count; assert n = 1, 'edita su perfil';
  update public.profiles set display_name = 'Hackeado' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count; assert n = 0, 'no edita perfil ajeno';
  begin update public.profiles set riot_verified = true where id = auth.uid(); raise exception 'FALLO 5: se auto-verificó';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set id = gen_random_uuid() where id = auth.uid(); raise exception 'FALLO 5: cambió su id';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set avatar_url = 'javascript:alert(1)' where id = auth.uid(); raise exception 'FALLO 5: avatar no https';
  exception when check_violation then null; end;
  raise notice 'OK 5 usuario edita solo su perfil; no toca riot_verified, id ni URLs inseguras';

  assert private.has_permission('tournaments.manage') = false, 'sin permisos';
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000b', 'Quiero el correo de Beto'); raise exception 'FALLO 6: leyó correo ajeno';
  exception when insufficient_privilege then null; end;
  begin perform 1 from auth.users; raise exception 'FALLO 6: leyó auth.users';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 6 correos y auth.users inaccesibles';

  -- Publicaciones
  insert into public.posts (id, author_id, content) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'Mi post');
  begin insert into public.posts (author_id, content) values ('00000000-0000-0000-0000-00000000000b', 'suplanto');
        raise exception 'FALLO 7: publicó como otro';
  exception when insufficient_privilege then null; end;
  begin update public.posts set author_id = '00000000-0000-0000-0000-00000000000b' where id = '20000000-0000-0000-0000-00000000000a';
        raise exception 'FALLO 7: cambió autor';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 7 publica solo a su nombre y no cambia el autor';

  -- Notificaciones: no puede crearlas
  begin insert into public.notifications (user_id, type) values ('00000000-0000-0000-0000-00000000000b', 'follow');
        raise exception 'FALLO 8: creó notificación';
  exception when insufficient_privilege then null; end;
  -- Conversaciones: solo por función
  begin insert into public.conversations (user1_id, user2_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
        raise exception 'FALLO 8: creó conversación directa';
  exception when insufficient_privilege then null; end;
  v := public.start_conversation('00000000-0000-0000-0000-00000000000b');
  assert v = public.start_conversation('00000000-0000-0000-0000-00000000000b'), 'idempotente';
  insert into public.messages (conversation_id, sender_id, content) values (v, auth.uid(), 'Hola Beto');
  begin perform public.start_conversation(auth.uid()); raise exception 'FALLO 8: conversación consigo';
  exception when invalid_parameter_value then null; end;
  raise notice 'OK 8 notificaciones y conversaciones solo desde el servidor';

  -- Interacciones que generan notificaciones
  insert into public.follows (follower_id, following_id) values (auth.uid(), '00000000-0000-0000-0000-00000000000b');
  begin insert into public.follows (follower_id, following_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
        raise exception 'FALLO 9: siguió en nombre de otro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 9 sigue solo en su nombre';

  -- Torneos: no gestiona
  update public.tournaments set name = 'Hackeado' where true;
  get diagnostics n = row_count; assert n = 0, 'no edita torneos';
  begin insert into public.tournaments (name) values ('Mío'); raise exception 'FALLO 10: creó torneo';
  exception when insufficient_privilege then null; end;
  -- pero sí se inscribe como capitán
  update public.profiles set riot_game_name = 'AnaW', riot_tag_line = 'LAN' where id = auth.uid();
  v := public.register_team('10000000-0000-0000-0000-000000000001', 'Team Ana', null,
       '[{"display_name":"Ana","game_name":"AnaW","tag_line":"LAN"}]');
  assert v is not null, 'inscripción';
  assert (select status from public.tournament_teams where id = v) = 'pending', 'queda pendiente de aprobación';
  begin perform public.register_team('10000000-0000-0000-0000-000000000001', 'Otro', null, '[{"game_name":"Otro1","tag_line":"LAN"}]');
        raise exception 'FALLO 10: doble inscripción';
  exception when unique_violation then null; end;
  begin update public.tournament_teams set status = 'approved' where id = v; get diagnostics n = row_count;
        assert n = 0, 'el capitán no aprueba su propio equipo';
  end;
  raise notice 'OK 10 no gestiona torneos; se inscribe una vez, queda pendiente y no puede aprobarse';

  -- Contacto, noticias, config
  select count(*) into n from public.contact_messages; assert n = 0, 'no lee contacto';
  select count(*) into n from public.news; assert n = 1, 'no ve borradores';
  update public.site_config set value = '{}' where true; get diagnostics n = row_count; assert n = 0, 'no edita config';
  raise notice 'OK 11 sin acceso a buzón de contacto, borradores ni configuración';

  -- Storage
  insert into storage.objects (bucket_id, name) values ('avatars', auth.uid()::text || '/a.webp');
  begin insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000b/a.webp');
        raise exception 'FALLO 12: subió en carpeta ajena';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('news-images', auth.uid()::text || '/n.webp');
        raise exception 'FALLO 12: subió imagen de noticia';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 12 Storage: solo su carpeta; noticias bloqueadas';
end $$;
reset role;

-- ===================== OTRO USUARIO (Beto) =====================
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.notifications; assert n = 2, 'Beto recibe follow + message';
  select count(*) into n from public.messages; assert n = 1, 'Beto lee su conversación';
  perform public.mark_conversation_read((select id from public.conversations limit 1));
  select count(*) into n from public.messages where read_at is not null; assert n = 1, 'marcado como leído';
  delete from public.posts where id = '20000000-0000-0000-0000-00000000000a'; get diagnostics n = row_count;
  assert n = 0, 'no borra post ajeno';
  insert into public.post_reactions (post_id, user_id, kind) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'like');
  insert into public.comments (post_id, author_id, content) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'Bien');
  raise notice 'OK 13 recibe notificaciones por trigger y no borra posts ajenos';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.messages; assert n = 0, 'Caro no lee mensajes ajenos';
  select count(*) into n from public.notifications; assert n = 0, 'Caro no ve notificaciones ajenas';
  begin insert into public.messages (conversation_id, sender_id, content)
        values ((select id from public.conversations limit 1), auth.uid(), 'intruso');
        raise exception 'FALLO 14: escribió en conversación ajena';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 14 un tercero no lee ni escribe en conversaciones ajenas';
end $$;
reset role;

-- Ana recibió like + comentario de Beto
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.notifications where type in ('like', 'comment'); assert n = 2, 'like + comment';
  raise notice 'OK 15 like y comentario notificados al autor';
end $$;
reset role;

-- Solo la API pública es ejecutable: lista cerrada de funciones permitidas por rol
do $$ declare bad text; begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and has_function_privilege('anon', p.oid, 'execute')
    and n.nspname || '.' || p.proname not in ('private.has_permission', 'public.count_registered_users');
  assert bad is null, 'ejecutables por visitantes fuera de la lista: ' || coalesce(bad, '');
  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and has_function_privilege('authenticated', p.oid, 'execute')
    and n.nspname || '.' || p.proname not in (
      'private.has_permission', 'private.is_conversation_member', 'public.count_registered_users',
      'public.get_user_email', 'public.start_conversation', 'public.mark_conversation_read',
      'public.register_team', 'public.withdraw_team', 'public.check_in_team', 'public.close_check_in',
      'public.draw_giveaway', 'public.my_permissions', 'public.assign_role', 'public.revoke_role',
      'public.suspend_user', 'public.lift_suspension', 'public.platform_stats', 'public.admin_list_users', 'public.my_rank');
  assert bad is null, 'ejecutables por usuarios fuera de la lista: ' || coalesce(bad, '');
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false);
  assert bad is null, 'security definer sin search_path fijo: ' || coalesce(bad, '');
  raise notice 'OK 16 solo la API pública es ejecutable; security definer con search_path vacío';
end $$;

-- RLS activo en todas las tablas públicas
do $$ declare bad text; begin
  select string_agg(relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity;
  assert bad is null, 'tablas sin RLS: ' || coalesce(bad, '');
  raise notice 'OK 17 RLS activo en todas las tablas';
end $$;

-- Pruebas de seguridad de las migraciones (Postgres local con 00_supabase_stub.sql).
-- Cada bloque imprime "OK ..." o aborta con "FALLO ...".
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Usuarios de prueba (como si vinieran de Google / Discord)
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'ana@example.com',
  '{"full_name":"Ana Google","avatar_url":"https://lh3.example/ana.png"}', '{"provider":"google"}'),
 ('00000000-0000-0000-0000-00000000000b', 'beto@example.com',
  '{"custom_claims":{"global_name":"Beto Discord"},"avatar_url":"https://cdn.discord.example/b.png"}', '{"provider":"discord"}'),
 ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com',
  '{"name":"Admin"}', '{"provider":"google"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
end $$;

-- 1. Perfiles creados por el trigger con datos del proveedor
do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Ana Google', 'nombre Google';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Beto Discord', 'nombre Discord';
  assert (select auth_provider from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'discord', 'proveedor';
  raise notice 'OK 1 perfiles automáticos desde Google y Discord';
end $$;

-- 2. Un usuario NO puede darse rol admin
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FALLO 2: pudo cambiarse el rol';
  exception when insufficient_privilege then raise notice 'OK 2 no puede cambiar su rol (privilegio de columna)';
  end;
  begin
    perform public.set_user_role(auth.uid(), 'admin');
    raise exception 'FALLO 2b: set_user_role permitió auto-promoción';
  exception when insufficient_privilege then raise notice 'OK 2b set_user_role rechaza a no-admin';
  end;
end $$;

-- 3. El correo de otros no es legible; el propio sí, por función
do $$ declare e text; begin
  begin
    select email into e from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FALLO 3: leyó el correo de otro';
  exception when insufficient_privilege then raise notice 'OK 3 correo ajeno protegido';
  end;
  select email into e from public.my_profile_private();
  assert e = 'ana@example.com', 'FALLO 3b';
  raise notice 'OK 3b el usuario lee su propio correo';
end $$;

-- 4. Publicaciones: edito lo mío, no lo ajeno
insert into public.posts (id, author_id, content) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'post de Ana');
reset role;
insert into public.posts (id, author_id, content) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'post de Beto');
set role authenticated;
do $$ declare n int; begin
  update public.posts set content = 'hackeado' where id = '10000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'FALLO 4: editó post ajeno';
  update public.posts set content = 'editado' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'FALLO 4b: no editó su post';
  begin
    insert into public.posts (author_id, content) values ('00000000-0000-0000-0000-00000000000b', 'suplantación');
    raise exception 'FALLO 4c: publicó como otro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 4 posts: propio sí, ajeno no, sin suplantación';
end $$;

-- 5. Reacciones: solo las propias
do $$ begin
  insert into public.post_reactions (post_id, user_id, kind) values ('10000000-0000-0000-0000-000000000002', auth.uid(), 'like');
  begin
    insert into public.post_reactions (post_id, user_id, kind)
      values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ad', 'like');
    raise exception 'FALLO 5';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 5 reacciones propias';
end $$;

-- 6. Mensajes privados: un tercero no los ve
reset role;
insert into public.conversations (id, user1_id, user2_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ad');
set role authenticated;
insert into public.messages (conversation_id, sender_id, content)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'hola admin');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.messages) = 0, 'FALLO 6: tercero ve mensajes';
  assert (select count(*) from public.conversations) = 0, 'FALLO 6b: tercero ve conversación';
  begin
    insert into public.messages (conversation_id, sender_id, content)
      values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'intruso');
    raise exception 'FALLO 6c';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 6 conversaciones privadas';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ begin
  assert (select count(*) from public.messages) = 1, 'FALLO 6d: destinatario no ve el mensaje';
  perform public.mark_conversation_read('20000000-0000-0000-0000-000000000001');
  assert (select read_at is not null from public.messages limit 1), 'FALLO 6e: no marcó leído';
  raise notice 'OK 6d destinatario lee y marca leído';
end $$;

-- 7. Notificaciones: se crean a nombre propio y solo las lee el destinatario
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  insert into public.notifications (user_id, actor_id, type) values ('00000000-0000-0000-0000-00000000000b', auth.uid(), 'follow');
  begin
    insert into public.notifications (user_id, actor_id, type)
      values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000ad', 'follow');
    raise exception 'FALLO 7';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.notifications) = 0, 'FALLO 7b: ve notificaciones ajenas';
  raise notice 'OK 7 notificaciones';
end $$;

-- 8. Noticias y contacto como visitante anónimo
reset role;
insert into public.news (title, published) values ('Publicada', true), ('Borrador', false);
select pg_temp.as_user(null);
set role anon;
do $$ begin
  assert (select count(*) from public.news) = 1, 'FALLO 8: anónimo ve borradores';
  insert into public.contact_messages (name, email, message) values ('Visitante', 'v@example.com', 'Hola');
  raise notice 'OK 8 anónimo: noticias publicadas y envío de contacto';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  assert (select count(*) from public.contact_messages) = 0, 'FALLO 8b: usuario normal lee contacto';
  raise notice 'OK 8b contacto solo para admin';
end $$;

-- 9. Torneos: inscripción por función y contactos privados
reset role;
insert into public.tournaments (id, name, max_teams, created_by) values
  ('30000000-0000-0000-0000-000000000001', 'Copa Guajira', 2, '00000000-0000-0000-0000-0000000000ad');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare t uuid; begin
  t := public.register_team('30000000-0000-0000-0000-000000000001', 'Gallos', null,
        '[{"display_name":"Ana","game_name":"AnaLoL","tag_line":"LAN","phone":"3000000000","email":"ana@example.com"}]');
  begin
    perform public.register_team('30000000-0000-0000-0000-000000000001', 'Gallos 2', null, '[{"display_name":"X"}]');
    raise exception 'FALLO 9: doble inscripción';
  exception when unique_violation then null; end;
  assert (select count(*) from public.tournament_player_contacts) = 1, 'FALLO 9b: capitán no ve sus contactos';
  begin
    update public.tournaments set name = 'hack' where id = '30000000-0000-0000-0000-000000000001';
  end;
  assert (select name from public.tournaments where id = '30000000-0000-0000-0000-000000000001') = 'Copa Guajira', 'FALLO 9c';
  raise notice 'OK 9 inscripción validada; usuario no edita torneo ajeno';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.tournament_players) = 1, 'FALLO 9d: jugadores no públicos';
  assert (select count(*) from public.tournament_player_contacts) = 0, 'FALLO 9e: tercero ve teléfonos';
  raise notice 'OK 9d jugadores públicos, contactos privados';
end $$;
reset role;
select pg_temp.as_user(null);
set role anon;
do $$ begin
  begin
    perform count(*) from public.tournament_player_contacts;
    raise exception 'FALLO 9f: anónimo accede a contactos';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 9f anónimo sin acceso a contactos';
end $$;

-- 10. Storage: solo en la carpeta propia
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/foto.webp');
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000b/foto.webp');
    raise exception 'FALLO 10';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('news-images', '00000000-0000-0000-0000-00000000000a/x.webp');
    raise exception 'FALLO 10b';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 10 storage por carpeta y noticias solo admin';
end $$;

-- 11. Admin: puede cambiar roles y ver contacto
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ begin
  perform public.set_user_role('00000000-0000-0000-0000-00000000000b', 'admin');
  perform public.set_user_role('00000000-0000-0000-0000-00000000000b', 'user');
  assert (select count(*) from public.contact_messages) = 1, 'FALLO 11';
  raise notice 'OK 11 admin gestiona roles y contacto';
end $$;
reset role;

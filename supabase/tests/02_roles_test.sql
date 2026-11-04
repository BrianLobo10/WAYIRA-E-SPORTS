-- Pruebas de roles y permisos (migración 20261103100000_roles_permisos.sql), sobre una base con 01 ya ejecutado.
-- Cubre visitante, usuario, moderador, editor, organizador, admin y superadmin: permitido y rechazado.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000f0', 'dueno@example.com', '{"name":"Dueño"}', '{"provider":"google"}'),
 ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com', '{"name":"Admin"}', '{"provider":"google"}'),
 ('00000000-0000-0000-0000-0000000000a2', 'admin2@example.com', '{"name":"Admin 2"}', '{"provider":"discord"}'),
 ('00000000-0000-0000-0000-0000000000d0', 'mod@example.com', '{"name":"Mod"}', '{"provider":"discord"}'),
 ('00000000-0000-0000-0000-0000000000e0', 'editor@example.com', '{"name":"Editor"}', '{"provider":"google"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'org@example.com', '{"name":"Org"}', '{"provider":"google"}');

-- Superadmin: solo por SQL en el panel (como aquí, sin sesión de app)
insert into public.user_roles (user_id, role_key) values ('00000000-0000-0000-0000-0000000000f0', 'superadmin');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- SUPERADMIN nombra administradores
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ begin
  perform public.assign_role('00000000-0000-0000-0000-0000000000ad', 'admin');
  perform public.assign_role('00000000-0000-0000-0000-0000000000a2', 'admin');
  assert public.assign_role('00000000-0000-0000-0000-0000000000ad', 'superadmin') is not null, 'FALLO R1: nombró otro superadmin desde la app';
  assert public.revoke_role('00000000-0000-0000-0000-0000000000f0', 'superadmin') is not null, 'FALLO R1: se quitó su propio rol';
  raise notice 'OK R1 superadmin nombra admins; superadmin no asignable desde la app; no se modifica a sí mismo';
end $$;
reset role;

-- ADMIN asigna roles inferiores, nunca iguales ni superiores ni a sí mismo
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
do $$ declare n int; begin
  perform public.assign_role('00000000-0000-0000-0000-0000000000d0', 'moderador');
  perform public.assign_role('00000000-0000-0000-0000-0000000000e0', 'editor');
  perform public.assign_role('00000000-0000-0000-0000-0000000000c0', 'organizador');
  assert public.assign_role('00000000-0000-0000-0000-00000000000a', 'admin') is not null, 'FALLO R2: admin creó admin';
  assert public.revoke_role('00000000-0000-0000-0000-0000000000a2', 'admin') is not null, 'FALLO R2: admin quitó a otro admin';
  assert public.revoke_role('00000000-0000-0000-0000-0000000000f0', 'superadmin') is not null, 'FALLO R2: admin degradó al dueño';
  assert public.assign_role('00000000-0000-0000-0000-0000000000ad', 'moderador') is not null, 'FALLO R2: se asignó a sí mismo';
  begin insert into public.user_roles (user_id, role_key) values ('00000000-0000-0000-0000-00000000000a', 'admin');
        raise exception 'FALLO R2: escribió user_roles directo';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.role_audit; assert n = 5, 'auditoría (2 del dueño + 3 del admin)';
  -- Administración del sitio
  select count(*) into n from public.contact_messages; assert n = 1, 'admin lee buzón';
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000a', 'Soporte: no puede iniciar sesión');
        raise exception 'FALLO R2: admin leyó correo';
  exception when insufficient_privilege then null; end;
  insert into public.site_config (key, value) values ('maintenance', '{"on":false}');
  raise notice 'OK R2 admin gestiona roles inferiores, buzón y configuración; no ve correos; nada por encima ni sobre sí mismo';
end $$;
reset role;

-- MODERADOR
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
do $$ declare n int; begin
  update public.posts set content = 'editado por mod' where id = '20000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count; assert n = 0, 'mod no reescribe posts ajenos';
  delete from public.comments where post_id = '20000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count; assert n = 1, 'mod borra comentario ajeno';
  begin insert into storage.objects (bucket_id, name) values ('post-media', '00000000-0000-0000-0000-00000000000a/x.webp');
        raise exception 'FALLO R3: mod subió en carpeta ajena';
  exception when insufficient_privilege then null; end;
  raise notice 'OK R3a moderador borra comentarios ajenos, no reescribe posts ni sube en carpetas ajenas';
end $$;
do $$ declare n int; begin
  delete from public.posts where id = '20000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count; assert n = 1, 'mod retira post';
  update public.tournaments set name = 'x' where true; get diagnostics n = row_count; assert n = 0, 'mod sin torneos';
  select count(*) into n from public.contact_messages; assert n = 0, 'mod sin buzón';
  select count(*) into n from public.role_audit; assert n = 0, 'mod sin auditoría';
  assert public.assign_role('00000000-0000-0000-0000-00000000000b', 'moderador') is not null, 'FALLO R3: mod asignó rol';
  assert public.my_permissions() = '{community.moderate,users.suspend}', 'permisos del mod';
  raise notice 'OK R3b moderador retira publicaciones; sin torneos, buzón, auditoría ni asignación de roles';
end $$;
reset role;

-- EDITOR
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e0');
set role authenticated;
do $$ declare n int; begin
  insert into public.news (title, published, author_id) values ('Nueva noticia', false, auth.uid());
  select count(*) into n from public.news; assert n = 3, 'editor ve borradores';
  insert into storage.objects (bucket_id, name) values ('news-images', 'portadas/n1.webp');
  update public.site_config set value = '{"discord":200}' where key = 'social_stats';
  get diagnostics n = row_count; assert n = 1, 'editor actualiza estadísticas';
  update public.site_config set value = '{"on":true}' where key = 'maintenance';
  get diagnostics n = row_count; assert n = 0, 'editor no toca configuración técnica';
  begin insert into public.site_config (key, value) values ('nueva', '{}'); raise exception 'FALLO R4: editor creó clave';
  exception when insufficient_privilege then null; end;
  begin insert into public.tournaments (name) values ('Torneo editor'); raise exception 'FALLO R4: editor creó torneo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK R4 editor publica noticias e imágenes y edita contenido del sitio; sin configuración técnica ni torneos';
end $$;
reset role;

-- ORGANIZADOR
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c0');
set role authenticated;
do $$ declare n int; begin
  insert into public.tournaments (name, created_by) values ('Liga Org', auth.uid());
  update public.tournaments set status = 'ongoing' where name = 'Copa Wayira'; get diagnostics n = row_count; assert n = 1, 'edita torneos';
  update public.tournament_teams set status = 'approved' where name = 'Team Ana'; get diagnostics n = row_count;
  assert n = 1, 'aprueba inscripciones';
  assert (select decided_by from public.tournament_teams where name = 'Team Ana') = auth.uid(), 'queda quién decidió';
  begin insert into public.news (title) values ('No'); raise exception 'FALLO R5: organizador creó noticia';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.contact_messages; assert n = 0, 'sin buzón';
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000a', 'Contactar al capitán del equipo'); raise exception 'FALLO R5: leyó correo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK R5 organizador gestiona torneos y aprueba inscripciones; sin noticias, buzón ni correos';
end $$;
reset role;

-- USUARIO normal y VISITANTE siguen sin nada
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare n int; begin
  assert public.my_permissions() = '{}', 'usuario sin permisos';
  select count(*) into n from public.role_audit; assert n = 0, 'usuario sin auditoría';
  assert public.assign_role('00000000-0000-0000-0000-00000000000a', 'admin') is not null, 'FALLO R6: auto-elevación';
  begin update public.user_roles set role_key = 'admin' where true; raise exception 'FALLO R6: editó user_roles';
  exception when insufficient_privilege then null; end;
  begin insert into public.role_permissions values ('moderador', 'roles.assign'); raise exception 'FALLO R6: editó permisos';
  exception when insufficient_privilege then null; end;
  raise notice 'OK R6 usuario normal no puede auto-elevarse por función ni por tabla';
end $$;
reset role;

select pg_temp.as_user(null);
set role anon;
do $$ begin
  -- Insignias públicas: el visitante ve quién tiene qué rol, pero no quién lo asignó ni cuándo
  assert (select count(*) from public.user_roles) >= 3, 'insignias visibles';
  begin perform granted_by from public.user_roles limit 1; raise exception 'FALLO R7: visitante vio quién asignó';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.role_audit limit 1; raise exception 'FALLO R7: visitante leyó auditoría';
  exception when insufficient_privilege then null; end;
  begin perform public.assign_role('00000000-0000-0000-0000-00000000000a', 'admin'); raise exception 'FALLO R7: visitante asignó';
  exception when insufficient_privilege then null; end;
  assert private.has_permission('news.manage') = false;
  raise notice 'OK R7 visitante ve insignias de staff, sin datos de asignación ni auditoría, y no asigna roles';
end $$;
reset role;

-- Retirar un rol quita el permiso al instante
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
select public.revoke_role('00000000-0000-0000-0000-0000000000d0', 'moderador');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
do $$ begin
  assert private.has_permission('community.moderate') = false, 'permiso retirado';
  raise notice 'OK R8 al retirar el rol se pierde el permiso inmediatamente';
end $$;
reset role;

-- CORREOS: solo superadmin, con motivo, un correo por llamada, registro y límites
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ declare n int; e text; msg uuid; begin
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000a', 'corto'); raise exception 'FALLO R9: sin motivo válido';
  exception when invalid_parameter_value then null; end;
  begin perform public.get_user_email('00000000-0000-0000-0000-0000000000ff', 'Usuario que no existe'); raise exception 'FALLO R9: usuario inexistente';
  exception when no_data_found then null; end;
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000a', 'Respuesta a un mensaje ajeno',
                                      (select id from public.contact_messages limit 1));
        raise exception 'FALLO R9: mensaje de otro remitente';
  exception when invalid_parameter_value then null; end;
  e := public.get_user_email('00000000-0000-0000-0000-00000000000a', 'Soporte: no puede iniciar sesión');
  assert e = 'ana@example.com', 'superadmin obtiene un correo';
  select count(*) into n from public.email_access_log; assert n = 1, 'consulta registrada';
  assert (select reason from public.email_access_log) = 'Soporte: no puede iniciar sesión', 'motivo registrado';
  for i in 1..4 loop perform public.get_user_email('00000000-0000-0000-0000-00000000000b', 'Consulta de prueba ' || i); end loop;
  begin perform public.get_user_email('00000000-0000-0000-0000-00000000000c', 'Sexta consulta en una hora');
        raise exception 'FALLO R9: superó el límite por hora';
  exception when program_limit_exceeded then null; end;
  select count(*) into n from public.email_access_log; assert n = 5, 'la consulta rechazada no queda registrada ni devuelve correo';
  begin delete from public.email_access_log; raise exception 'FALLO R9: borró el registro';
  exception when insufficient_privilege then null; end;
  begin update public.email_access_log set reason = 'cambiado aquí' where true; raise exception 'FALLO R9: editó el registro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK R9 superadmin: un correo por llamada con motivo válido, registro inmutable y límite de 5 por hora';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.email_access_log; assert n = 0, 'admin no ve el registro de correos';
  raise notice 'OK R10 el registro de consultas de correo solo lo ve quien puede consultarlos';
end $$;
reset role;

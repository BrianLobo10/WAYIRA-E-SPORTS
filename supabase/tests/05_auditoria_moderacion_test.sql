-- Pruebas de la fase 2 (20261103210000_fase2_auditoria_moderacion.sql), sobre una base con 01-04 ya ejecutados.
-- Usuarios: f0 superadmin, ad/a2 admin, d0 (mod tras re-asignar), e0 editor, c0 organizador, 0a/0b usuarios.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- A1 superadmin vuelve a nombrar moderador; admin intenta crear admin y queda registrado como rechazado
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ begin
  assert public.assign_role('00000000-0000-0000-0000-0000000000d0', 'moderador', 'Vuelve al equipo') is null, 'asignación válida';
  raise notice 'OK A1 asignación válida devuelve null';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
do $$ declare n int; begin
  assert public.assign_role('00000000-0000-0000-0000-00000000000a', 'admin', 'prueba') = 'Solo puedes gestionar roles inferiores al tuyo', 'motivo';
  select count(*) into n from public.audit_log; assert n = 0, 'admin no lee auditoría completa';
  begin perform public.platform_stats(); raise exception 'FALLO A2: admin vio estadísticas';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.admin_list_users(); assert n >= 8, 'admin ve listado';
  assert public.my_rank() = 90, 'rango admin';
  raise notice 'OK A2 admin: intento rechazado, sin auditoría ni estadísticas, con listado de usuarios';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ declare n int; s jsonb; begin
  select count(*) into n from public.audit_log
   where result = 'denied' and action = 'role_grant' and actor_id = '00000000-0000-0000-0000-0000000000ad'
     and details ->> 'reason' = 'prueba';
  assert n = 1, 'el rechazo quedó registrado';
  select count(*) into n from public.audit_log where result = 'ok' and action = 'role_grant' and details ->> 'reason' = 'Vuelve al equipo';
  assert n = 1, 'el cambio con motivo quedó registrado';
  begin insert into public.audit_log (action, entity) values ('x', 'y'); raise exception 'FALLO A3: escribió auditoría';
  exception when insufficient_privilege then null; end;
  begin delete from public.audit_log where true; raise exception 'FALLO A3: borró auditoría';
  exception when insufficient_privilege then null; end;
  s := public.platform_stats();
  assert (s ->> 'users_total')::int >= 8 and jsonb_array_length(s -> 'signups_weekly') = 8, 'estadísticas';
  raise notice 'OK A3 superadmin ve auditoría con rechazos y estadísticas; nadie edita la auditoría';
end $$;
reset role;

-- S1 moderador suspende a un usuario; no a sí mismo ni a rangos iguales o superiores
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
do $$ declare n int; begin
  assert public.suspend_user('00000000-0000-0000-0000-00000000000a', 24, 'Spam repetido en el feed') is null, 'suspende';
  assert public.suspend_user('00000000-0000-0000-0000-0000000000ad', 24, 'Intento indebido') is not null, 'no suspende admin';
  assert public.suspend_user('00000000-0000-0000-0000-0000000000d0', 24, 'Me suspendo') is not null, 'no a sí mismo';
  assert public.suspend_user('00000000-0000-0000-0000-00000000000b', 24, 'no') is not null, 'motivo obligatorio';
  begin perform public.admin_list_users(); raise exception 'FALLO S1: mod vio listado completo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK S1 moderador suspende solo a rangos inferiores, con motivo';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare n int; begin
  begin insert into public.posts (author_id, content) values (auth.uid(), 'sigo publicando'); raise exception 'FALLO S2: suspendido publicó';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.user_suspensions where user_id = auth.uid(); assert n = 1, 've su suspensión';
  begin update public.user_suspensions set lifted_at = now() where true; raise exception 'FALLO S2: se levantó la suspensión';
  exception when insufficient_privilege then null; end;
  assert public.lift_suspension(auth.uid()) is not null, 'no se reactiva solo';
  raise notice 'OK S2 un suspendido no publica ni se reactiva a sí mismo';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
do $$ begin
  assert public.lift_suspension('00000000-0000-0000-0000-00000000000a', 'Apelación aceptada') is null, 'reactiva';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  insert into public.posts (author_id, content) values (auth.uid(), 'de vuelta');
  raise notice 'OK S3 al reactivar vuelve a publicar';
end $$;
reset role;

-- P1 proyectos: públicos los activos; solo con permiso de contenido se gestionan
select pg_temp.as_user(null);
set role anon;
do $$ declare n int; begin
  select count(*) into n from public.projects; assert n = 4, 'cuatro proyectos iniciales';
  begin insert into public.projects (title) values ('Hack'); raise exception 'FALLO P1: visitante creó proyecto';
  exception when insufficient_privilege then null; end;
  perform 1 from public.comment_reactions limit 1;
  raise notice 'OK P1 visitante ve proyectos activos y reacciones de comentarios, sin escribir';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  begin insert into public.projects (title) values ('Proyecto falso'); raise exception 'FALLO P2: usuario creó proyecto';
  exception when insufficient_privilege then null; end;
  raise notice 'OK P2 usuario normal no crea proyectos';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e0');
set role authenticated;
do $$ declare n int; begin
  insert into public.projects (title, description, active) values ('Copa Andina', 'Torneo regional', true);
  update public.projects set active = false where title = 'Alianzas Estratégicas';
  select count(*) into n from public.projects; assert n = 5, 'el editor ve también los inactivos';
  raise notice 'OK P3 editor crea y desactiva proyectos';
end $$;
reset role;

select pg_temp.as_user(null);
set role anon;
do $$ declare n int; begin
  select count(*) into n from public.projects; assert n = 4, 'el inactivo desaparece de la web';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.audit_log where entity = 'projects' and actor_id = '00000000-0000-0000-0000-0000000000e0';
  assert n = 2, 'creación y desactivación auditadas';
  select count(*) into n from public.audit_log where action = 'suspend' and result = 'denied'; assert n = 3, 'intentos de suspensión rechazados';
  raise notice 'OK P4 la auditoría recoge proyectos, suspensiones y rechazos';
end $$;
reset role;

-- R1 denuncias: cada quien ve las suyas; el moderador las resuelve
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ declare pid uuid; n int; begin
  select id into pid from public.posts where content = 'de vuelta';
  insert into public.reports (target_type, target_id, reason, details) values ('post', pid, 'spam', 'Repite el mismo mensaje');
  update public.reports set status = 'dismissed' where true;
  get diagnostics n = row_count; assert n = 0, 'FALLO R1: resolvió su propia denuncia';
  begin update public.reports set details = 'cambio' where true; raise exception 'FALLO R1: editó la denuncia';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.reports; assert n = 0, 'el denunciado no ve denuncias ajenas';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d0');
set role authenticated;
do $$ declare n int; begin
  update public.reports set status = 'actioned', resolved_by = auth.uid(), resolved_at = now() where status = 'open';
  get diagnostics n = row_count; assert n = 1, 'moderador resuelve';
  raise notice 'OK R1 denuncias privadas; solo moderación las resuelve';
end $$;
reset role;

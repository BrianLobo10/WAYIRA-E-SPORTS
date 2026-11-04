-- Pruebas del tema de colores (20261103230000_tema_colores.sql), sobre una base con 01-05 ya ejecutados.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- T1 el Superadmin guarda colores válidos y queda en la auditoría
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ declare n int; begin
  insert into public.site_config (key, value) values ('theme', '{"bg":"#101014","accent":"#7CB8FF"}');
  update public.site_config set value = '{"bg":"#101014","accent":"#FF5A36","text":"#F0F0F0"}' where key = 'theme';
  get diagnostics n = row_count; assert n = 1, 'superadmin edita el tema';
  begin update public.site_config set value = '{"bg":"red; background:url(x)"}' where key = 'theme'; raise exception 'FALLO T1: aceptó CSS libre';
  exception when check_violation then null; end;
  begin update public.site_config set value = '{"logo":"#FFFFFF"}' where key = 'theme'; raise exception 'FALLO T1: aceptó una clave desconocida';
  exception when check_violation then null; end;
  select count(*) into n from public.audit_log where action = 'theme_saved'; assert n = 2, 'cambios auditados';
  raise notice 'OK T1 superadmin guarda colores #RRGGBB; rechaza CSS libre y claves desconocidas; queda auditado';
end $$;
reset role;

-- T2 un Admin (site.manage) no puede tocar el tema, pero sí otras claves
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
do $$ declare n int; begin
  update public.site_config set value = '{"bg":"#FFFFFF"}' where key = 'theme';
  get diagnostics n = row_count; assert n = 0, 'admin no edita el tema';
  delete from public.site_config where key = 'theme';
  get diagnostics n = row_count; assert n = 0, 'admin no borra el tema';
  update public.site_config set value = '{"on":true}' where key = 'maintenance';
  get diagnostics n = row_count; assert n = 1, 'admin sigue gestionando otras claves';
  raise notice 'OK T2 admin no cambia los colores, sí el resto de la configuración';
end $$;
reset role;

-- T3 visitante lee el tema (la web lo necesita) pero no lo escribe
select pg_temp.as_user(null);
set role anon;
do $$ begin
  assert (select value ->> 'accent' from public.site_config where key = 'theme') = '#FF5A36', 'visitante lee el tema';
  begin update public.site_config set value = '{}' where key = 'theme'; raise exception 'FALLO T3: visitante editó';
  exception when insufficient_privilege then null; end;
  raise notice 'OK T3 visitante lee los colores sin poder cambiarlos';
end $$;
reset role;

-- Pruebas del archivo theme.css (20261111000000_tema_css.sql), sobre una base con 01-10 ya ejecutados.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- T1 el Superadmin publica y reemplaza theme.css
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ declare n int; begin
  insert into storage.objects (bucket_id, name) values ('site', 'theme.css');
  update storage.objects set created_at = now() where bucket_id = 'site' and name = 'theme.css';
  get diagnostics n = row_count; assert n = 1, 'superadmin reemplaza theme.css';
  begin insert into storage.objects (bucket_id, name) values ('site', 'otro.css'); raise exception 'FALLO T1: subió otro archivo';
  exception when insufficient_privilege then null; end;
  raise notice 'OK T1 superadmin publica theme.css y nada más en el bucket site';
end $$;
reset role;

-- T2 un Admin (site.manage, sin site.theme) no puede tocarlo
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
do $$ declare n int; begin
  begin insert into storage.objects (bucket_id, name) values ('site', 'theme.css'); raise exception 'FALLO T2: admin subió theme.css';
  exception when insufficient_privilege then null; end;
  update storage.objects set created_at = now() where bucket_id = 'site' and name = 'theme.css';
  get diagnostics n = row_count; assert n = 0, 'admin no reemplaza theme.css';
  delete from storage.objects where bucket_id = 'site';
  get diagnostics n = row_count; assert n = 0, 'admin no borra theme.css';
  raise notice 'OK T2 admin no puede cambiar ni borrar theme.css';
end $$;
reset role;

-- T3 el bucket es público y solo acepta CSS pequeño
do $$ begin
  assert (select public and allowed_mime_types = array['text/css'] and file_size_limit = 65536 from storage.buckets where id = 'site'), 'bucket site público, solo text/css, 64 KB';
  raise notice 'OK T3 bucket site público, solo text/css de hasta 64 KB';
end $$;

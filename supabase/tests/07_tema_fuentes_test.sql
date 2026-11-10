-- Fuentes del tema (20261104*, 20261108000000_tema_fuentes.sql)
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
set role authenticated;
do $$ begin
  update public.site_config set value = '{"bg":"#0D0221","surface":"#1A0B3A","accent":"#FF2A6D","alert":"#05D9E8","text":"#F5F3FF","textSecondary":"#B4A9D6","headingFont":"Press Start 2P","bodyFont":"Chakra Petch"}' where key = 'theme';
  begin update public.site_config set value = '{"headingFont":"Comic Sans; } body{display:none"}' where key = 'theme'; raise exception 'FALLO F1: aceptó fuente inventada';
  exception when check_violation then null; end;
  begin update public.site_config set value = '{"bodyFont":"Creepster"}' where key = 'theme'; raise exception 'FALLO F1: fuente de títulos como texto';
  exception when check_violation then null; end;
  raise notice 'OK F1 fuentes del catálogo aceptadas; inventadas o en el rol equivocado, rechazadas';
end $$;
reset role;

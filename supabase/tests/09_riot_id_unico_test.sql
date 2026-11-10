-- Pruebas: una cuenta de Riot no se puede vincular a dos perfiles (20261110010000_riot_id_unico.sql)
\set ON_ERROR_STOP 1
set client_min_messages = notice;
do $$
declare a uuid; b uuid;
begin
  select id into a from public.profiles order by id limit 1;
  select id into b from public.profiles where id <> a order by id limit 1;
  assert a is not null and b is not null, 'hay dos perfiles de prueba';
  update public.profiles set riot_game_name = 'BR LOBO', riot_tag_line = 'MADFK', riot_region = 'la1', riot_puuid = repeat('x', 78) where id = a;
  begin
    update public.profiles set riot_game_name = 'br lobo', riot_tag_line = 'madfk', riot_region = 'la1', riot_puuid = repeat('y', 78) where id = b;
    raise exception 'FALLO: dos perfiles con la misma cuenta de Riot';
  exception when unique_violation then null; end;
  update public.profiles set riot_game_name = null, riot_tag_line = null, riot_region = null, riot_puuid = null where id = a;
  update public.profiles set riot_game_name = 'BR LOBO', riot_tag_line = 'MADFK', riot_region = 'la1' where id = b;
  raise notice 'OK T1 una cuenta de Riot por perfil (sin importar mayúsculas); al desvincular queda libre';
end $$;

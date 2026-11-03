-- Pruebas de la propuesta supabase/proposals/20261103170000_seguridad_lote1.sql
set client_min_messages = notice;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000e1', 'spam@example.com', '{"full_name":"Spammer"}', '{"provider":"google"}')
on conflict do nothing;

do $$
declare ok boolean; n int;
begin
  -- R1: 10 publicaciones pasan, la 11.ª se bloquea
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
  set local role authenticated;
  for i in 1..10 loop
    insert into public.posts (author_id, content) values ('00000000-0000-0000-0000-0000000000e1', 'post ' || i);
  end loop;
  begin
    insert into public.posts (author_id, content) values ('00000000-0000-0000-0000-0000000000e1', 'post 11');
    ok := false;
  exception when others then ok := sqlstate = '54000';
  end;
  reset role;
  if ok then raise notice 'OK R1 la publicación 11 en 10 min se bloquea'; else raise notice 'FALLO R1'; end if;

  -- P1: un visitante lee columnas públicas del perfil
  perform set_config('request.jwt.claim.sub', '', false);
  set local role anon;
  select count(*) into n from (select id, display_name, avatar_url, bio from public.profiles) t;
  reset role;
  if n > 0 then raise notice 'OK P1 visitante ve perfiles públicos (%)', n; else raise notice 'FALLO P1'; end if;

  -- P2: un visitante NO lee columnas privadas
  set local role anon;
  begin
    perform auth_provider from public.profiles limit 1;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  begin
    perform riot_puuid from public.profiles limit 1;
    ok := ok and false;
  exception when insufficient_privilege then ok := ok and true;
  end;
  reset role;
  if ok then raise notice 'OK P2 visitante no ve auth_provider ni riot_puuid'; else raise notice 'FALLO P2'; end if;

  -- P3: un visitante lee publicaciones pero no puede publicar
  set local role anon;
  select count(*) into n from public.posts;
  begin
    insert into public.posts (author_id, content) values ('00000000-0000-0000-0000-0000000000e1', 'anon');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if n > 0 and ok then raise notice 'OK P3 visitante lee publicaciones y no puede publicar'; else raise notice 'FALLO P3'; end if;

  -- P4: un visitante no lee mensajes privados
  set local role anon;
  begin
    perform 1 from public.messages limit 1;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then raise notice 'OK P4 visitante no lee mensajes privados'; else raise notice 'FALLO P4'; end if;
end $$;

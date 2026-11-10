-- Pruebas del módulo social v2 (20261110020000_social_v2.sql)
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- Datos: Ana (a) publica, Beto (b) comenta
reset role;
select pg_temp.as_user(null);
insert into public.posts (id, author_id, content) values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Post social v2')
on conflict do nothing;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$
declare c1 uuid; r1 uuid; r2 uuid; n int; k text;
begin
  -- T1 respuestas a un solo nivel
  insert into public.comments (post_id, author_id, content) values ('30000000-0000-0000-0000-00000000000a', auth.uid(), 'Comentario') returning id into c1;
  insert into public.comments (post_id, author_id, content, parent_id) values ('30000000-0000-0000-0000-00000000000a', auth.uid(), 'Respuesta', c1) returning id into r1;
  insert into public.comments (post_id, author_id, content, parent_id) values ('30000000-0000-0000-0000-00000000000a', auth.uid(), 'Respuesta a respuesta', r1) returning id into r2;
  select count(*) into n from public.comments where id = r2 and parent_id = c1 and reply_to_id = r1;
  assert n = 1, 'la respuesta a una respuesta cuelga del original y recuerda a quién responde';
  raise notice 'OK T1 respuestas a un nivel con «respondiendo a»';

  -- T2 editar mi comentario (solo el texto) y marca de edición
  update public.comments set content = 'Comentario editado' where id = c1;
  select count(*) into n from public.comments where id = c1 and content = 'Comentario editado' and updated_at is not null;
  assert n = 1, 'edita su comentario y queda marcado';
  begin
    update public.comments set post_id = '30000000-0000-0000-0000-00000000000a', author_id = '00000000-0000-0000-0000-00000000000a' where id = c1;
    raise exception 'FALLO T2: cambió el autor del comentario';
  exception when insufficient_privilege then null; end;
  raise notice 'OK T2 edita solo el texto de su comentario';

  -- T3 reacciones nuevas, una por usuario, se pueden cambiar
  insert into public.post_reactions (post_id, user_id, kind) values ('30000000-0000-0000-0000-00000000000a', auth.uid(), 'love');
  update public.post_reactions set kind = 'haha' where post_id = '30000000-0000-0000-0000-00000000000a' and user_id = auth.uid();
  select kind into k from public.post_reactions where post_id = '30000000-0000-0000-0000-00000000000a' and user_id = auth.uid();
  assert k = 'haha', 'cambia de reacción';
  begin
    insert into public.post_reactions (post_id, user_id, kind) values ('30000000-0000-0000-0000-00000000000a', auth.uid(), 'like');
    raise exception 'FALLO T3: reacción duplicada';
  exception when unique_violation then null; end;
  begin
    insert into public.comment_reactions (comment_id, user_id, kind) values (c1, auth.uid(), 'fuego');
    raise exception 'FALLO T3: aceptó una reacción inventada';
  exception when check_violation then null; end;
  insert into public.comment_reactions (comment_id, user_id, kind) values (c1, auth.uid(), 'wow');
  raise notice 'OK T3 7 reacciones, una por usuario, se puede cambiar, sin inventadas';

  -- T4 guardados
  insert into public.saved_posts (post_id) values ('30000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.saved_posts; assert n = 1, 'guarda la publicación';
  begin
    insert into public.saved_posts (user_id, post_id) values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a');
    raise exception 'FALLO T4: guardó a nombre de otro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK T4 guarda solo a su nombre';
end $$;
reset role;

-- T5 otra persona no edita ni ve lo ajeno
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ declare n int; begin
  update public.comments set content = 'hackeado' where post_id = '30000000-0000-0000-0000-00000000000a'; get diagnostics n = row_count;
  assert n = 0, 'no edita comentarios ajenos';
  update public.posts set content = 'hackeado' where id = '30000000-0000-0000-0000-00000000000a'; get diagnostics n = row_count;
  assert n = 0, 'no edita publicaciones ajenas';
  select count(*) into n from public.saved_posts; assert n = 0, 'no ve guardados ajenos';
  delete from public.saved_posts; get diagnostics n = row_count; assert n = 0, 'no borra guardados ajenos';
  raise notice 'OK T5 sin acceso a lo ajeno';
end $$;
reset role;

-- T6 visitantes sin sesión no guardan ni ven guardados
set role anon;
do $$ begin
  begin perform 1 from public.saved_posts; raise exception 'FALLO T6: anon lee guardados';
  exception when insufficient_privilege then null; end;
  raise notice 'OK T6 visitantes sin acceso a guardados';
end $$;
reset role;

-- T7 respuesta a un comentario de otra publicación: rechazada
select pg_temp.as_user(null);
insert into public.posts (id, author_id, content) values ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'Otro post') on conflict do nothing;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ declare c uuid; begin
  select id into c from public.comments where post_id = '30000000-0000-0000-0000-00000000000a' and parent_id is null limit 1;
  begin
    insert into public.comments (post_id, author_id, content, parent_id) values ('30000000-0000-0000-0000-00000000000b', auth.uid(), 'cruzada', c);
    raise exception 'FALLO T7: respuesta cruzada entre publicaciones';
  exception when check_violation then null; end;
  raise notice 'OK T7 no se puede responder un comentario de otra publicación';
end $$;
reset role;

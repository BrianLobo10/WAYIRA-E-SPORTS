-- APLICADA en Supabase el 3 nov 2026 (secciones 1 y 2). La sección 3 está pendiente de aplicar.
-- 1) Límite de envíos por usuario en publicaciones, comentarios, mensajes, reacciones y seguimientos.
-- 2) Perfiles públicos en modo lectura para visitantes (decisión aprobada): solo columnas públicas.
-- Se prueba en local con supabase/proposals/20261103170000_seguridad_lote1_test.sql antes de aplicarla.

-- ---------------------------------------------------------------------------
-- 1. Rate limiting por usuario (anti-spam). Usa el contador private.rate_limits existente.
--    Argumentos del disparador: máximo de inserciones y ventana en segundos.
-- ---------------------------------------------------------------------------
create or replace function private.user_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    return new; -- las escrituras sin sesión ya las bloquea RLS
  end if;
  if not public.consume_rate_limit(tg_table_name || ':' || me::text, tg_argv[0]::int, tg_argv[1]::int) then
    raise exception 'Vas demasiado rápido. Espera unos minutos e intenta de nuevo.' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.user_insert_rate_limit() from public, anon, authenticated;

drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit before insert on public.posts
  for each row execute function private.user_insert_rate_limit('10', '600');      -- 10 publicaciones / 10 min

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments
  for each row execute function private.user_insert_rate_limit('30', '600');      -- 30 comentarios / 10 min

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function private.user_insert_rate_limit('60', '600');      -- 60 mensajes / 10 min

drop trigger if exists post_reactions_rate_limit on public.post_reactions;
create trigger post_reactions_rate_limit before insert on public.post_reactions
  for each row execute function private.user_insert_rate_limit('120', '600');    -- 120 reacciones / 10 min

drop trigger if exists follows_rate_limit on public.follows;
create trigger follows_rate_limit before insert on public.follows
  for each row execute function private.user_insert_rate_limit('60', '3600');     -- 60 seguimientos / hora

-- ---------------------------------------------------------------------------
-- 2. Perfiles públicos en modo lectura (visitantes sin sesión)
--    Solo columnas públicas: nunca auth_provider ni riot_puuid.
-- ---------------------------------------------------------------------------
grant select (id, username, display_name, avatar_url, cover_url, bio,
              riot_game_name, riot_tag_line, riot_region, riot_verified, created_at)
  on public.profiles to anon;
drop policy if exists "profiles: lectura pública" on public.profiles;
create policy "profiles: lectura pública" on public.profiles
  for select to anon using (true);

-- Publicaciones, comentarios, reacciones y seguidores visibles en el perfil público
grant select on public.posts, public.comments, public.post_reactions, public.follows to anon;
drop policy if exists "posts: lectura pública" on public.posts;
create policy "posts: lectura pública" on public.posts for select to anon using (true);
drop policy if exists "comments: lectura pública" on public.comments;
create policy "comments: lectura pública" on public.comments for select to anon using (true);
drop policy if exists "post_reactions: lectura pública" on public.post_reactions;
create policy "post_reactions: lectura pública" on public.post_reactions for select to anon using (true);
drop policy if exists "follows: lectura pública" on public.follows;
create policy "follows: lectura pública" on public.follows for select to anon using (true);

-- 3. (complemento) Reacciones de comentarios visibles en el perfil público
grant select on public.comment_reactions to anon;
drop policy if exists "comment_reactions: lectura pública" on public.comment_reactions;
create policy "comment_reactions: lectura pública" on public.comment_reactions for select to anon using (true);

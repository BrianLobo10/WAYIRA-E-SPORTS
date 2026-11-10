-- Módulo social v2 (incremental: no borra tablas, columnas ni datos)
-- 1) Comentarios editables por su autor (solo el texto) y marca de edición
-- 2) Respuestas a un solo nivel: responder a una respuesta cuelga del comentario original y guarda a quién se responde
-- 3) Más reacciones: Me gusta, Me encanta, Me divierte, Me sorprende, Me entristece, Me enfada y No me gusta
-- 4) Publicaciones guardadas (cada usuario solo ve y maneja las suyas)
-- 5) Tiempo real para reacciones a comentarios e índices para cargar comentarios rápido

-- 1) Edición de comentarios ----------------------------------------------------------
alter table public.comments add column if not exists updated_at timestamptz;
alter table public.comments add column if not exists reply_to_id uuid references public.comments (id) on delete set null;

create or replace function private.comments_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.comments_touch() from public, anon, authenticated;
drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before update on public.comments
  for each row execute function private.comments_touch();

-- Solo el texto se puede cambiar (ni el autor, ni la publicación, ni las fechas)
grant update (content) on public.comments to authenticated;
drop policy if exists "comments: edito lo mío" on public.comments;
create policy "comments: edito lo mío" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- 2) Respuestas a un nivel -----------------------------------------------------------
create or replace function private.comments_flatten_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.comments;
begin
  if new.parent_id is null then
    new.reply_to_id := null;
    return new;
  end if;
  select * into parent from public.comments where id = new.parent_id;
  if parent.id is null or parent.post_id <> new.post_id then
    raise exception 'El comentario al que respondes no es de esta publicación.' using errcode = '23514';
  end if;
  if parent.parent_id is not null then
    -- Responder a una respuesta: cuelga del comentario original y recuerda a quién se responde
    new.reply_to_id := parent.id;
    new.parent_id := parent.parent_id;
  else
    new.reply_to_id := null;
  end if;
  return new;
end;
$$;
revoke all on function private.comments_flatten_reply() from public, anon, authenticated;
drop trigger if exists comments_flatten_reply on public.comments;
create trigger comments_flatten_reply before insert on public.comments
  for each row execute function private.comments_flatten_reply();

create index if not exists comments_post_created on public.comments (post_id, created_at);
create index if not exists comments_parent on public.comments (parent_id);

-- 3) Más reacciones ------------------------------------------------------------------
alter table public.post_reactions drop constraint if exists post_reactions_kind_check;
alter table public.post_reactions add constraint post_reactions_kind_check
  check (kind in ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'dislike'));
alter table public.comment_reactions drop constraint if exists comment_reactions_kind_check;
alter table public.comment_reactions add constraint comment_reactions_kind_check
  check (kind in ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'dislike'));

-- 4) Publicaciones guardadas ---------------------------------------------------------
create table if not exists public.saved_posts (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saved_posts_recent on public.saved_posts (user_id, created_at desc);
alter table public.saved_posts enable row level security;
revoke all on public.saved_posts from anon;
grant select, insert, delete on public.saved_posts to authenticated;
drop policy if exists "saved_posts: veo los míos" on public.saved_posts;
create policy "saved_posts: veo los míos" on public.saved_posts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "saved_posts: guardo yo" on public.saved_posts;
create policy "saved_posts: guardo yo" on public.saved_posts
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "saved_posts: quito los míos" on public.saved_posts;
create policy "saved_posts: quito los míos" on public.saved_posts
  for delete to authenticated using (user_id = (select auth.uid()));

-- 5) Tiempo real para reacciones a comentarios ----------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_reactions') then
    alter publication supabase_realtime add table public.comment_reactions;
  end if;
end $$;

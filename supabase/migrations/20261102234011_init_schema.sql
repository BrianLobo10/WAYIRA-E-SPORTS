-- WAYIRA E-SPORTS — esquema base en Supabase (arranque limpio, sin datos de Firebase)
-- Estructura, relaciones, índices y triggers. Los permisos están en 20261103001055_security_rls.sql.
-- Los ROLES no se definen aquí: se añadirán en una migración aparte cuando se apruebe la propuesta.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfiles: 1:1 con auth.users. Sin correo ni teléfono (viven solo en auth.users).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name    text not null default 'Jugador' check (char_length(display_name) between 1 and 40),
  avatar_url      text check (avatar_url is null or avatar_url ~ '^https://'),
  cover_url       text check (cover_url is null or cover_url ~ '^https://'),
  bio             text check (char_length(bio) <= 500),
  auth_provider   text,
  riot_game_name  text check (char_length(riot_game_name) <= 32),
  riot_tag_line   text check (char_length(riot_tag_line) <= 8),
  riot_region     text check (char_length(riot_region) <= 8),
  riot_puuid      text unique,
  riot_verified   boolean not null default false,   -- solo lo marca el servidor tras verificar con Riot
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_display_name_idx on public.profiles (lower(display_name));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

create table public.potato_chat_sessions (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  updated_at timestamptz not null default now()
);
create trigger potato_chat_updated_at before update on public.potato_chat_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Comunidad
-- ---------------------------------------------------------------------------
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  content     text not null default '' check (char_length(content) <= 5000),
  image_urls  text[] not null default '{}' check (cardinality(image_urls) <= 10),
  video_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(content) > 0 or cardinality(image_urls) > 0 or video_url is not null)
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_reactions_user_idx on public.post_reactions (user_id);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  parent_id   uuid references public.comments (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id);

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_reactions_user_idx on public.comment_reactions (user_id);

-- ---------------------------------------------------------------------------
-- Mensajes privados
-- ---------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user1_id         uuid not null references public.profiles (id) on delete cascade,
  user2_id         uuid not null references public.profiles (id) on delete cascade,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  check (user1_id < user2_id),
  unique (user1_id, user2_id)
);
create index conversations_user2_idx on public.conversations (user2_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  content          text not null check (char_length(content) between 1 and 4000),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- Notificaciones (las crean triggers del servidor, nunca el navegador)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         text not null check (type in ('like', 'comment', 'comment_reply', 'follow', 'message')),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);
create index notifications_actor_idx on public.notifications (actor_id);
create index notifications_post_idx on public.notifications (post_id);
create index notifications_comment_idx on public.notifications (comment_id);

-- ---------------------------------------------------------------------------
-- Torneos (el bracket se guarda en JSONB: el motor de llaves trabaja con arrays completos)
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id                              uuid primary key default gen_random_uuid(),
  name                            text not null check (char_length(name) between 3 and 120),
  description                     text not null default '' check (char_length(description) <= 4000),
  game                            text not null default 'League of Legends',
  start_date                      timestamptz,
  end_date                        timestamptz,
  max_teams                       int not null default 8 check (max_teams between 2 and 256),
  status                          text not null default 'upcoming'
                                    check (status in ('upcoming', 'ongoing', 'finished', 'confirmed')),
  format                          text check (format in ('single', 'double')),
  configured_rounds               int,
  bracket                         jsonb not null default '[]'::jsonb check (jsonb_typeof(bracket) = 'array'),
  lower_bracket                   jsonb not null default '[]'::jsonb check (jsonb_typeof(lower_bracket) = 'array'),
  confirmed                       boolean not null default false,
  confirmed_at                    timestamptz,
  prize_pool_usd                  numeric(10, 2) check (prize_pool_usd >= 0),
  grand_final_best_of             int check (grand_final_best_of in (1, 3)),
  redemption_final_best_of        int check (redemption_final_best_of in (1, 3)),
  finished_at                     timestamptz,
  champion_team_id                uuid,
  champion_team_name              text,
  redemption_champion_team_id     uuid,
  redemption_champion_team_name   text,
  created_by                      uuid references public.profiles (id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index tournaments_status_idx on public.tournaments (status, start_date);
create index tournaments_created_by_idx on public.tournaments (created_by);
create trigger tournaments_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();

create table public.tournament_teams (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 40),
  logo_url       text,
  captain_id     uuid references public.profiles (id) on delete set null,
  captain_name   text,
  registered_at  timestamptz not null default now(),
  unique (tournament_id, name)
);
create index tournament_teams_tournament_idx on public.tournament_teams (tournament_id);
create index tournament_teams_captain_idx on public.tournament_teams (captain_id);

create table public.tournament_players (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.tournament_teams (id) on delete cascade,
  user_id        uuid references public.profiles (id) on delete set null,
  display_name   text not null check (char_length(display_name) between 1 and 60),
  game_name      text,
  tag_line       text,
  position       text,
  main_champion  text,
  is_substitute  boolean not null default false,
  sort_order     int not null default 0
);
create index tournament_players_team_idx on public.tournament_players (team_id);
create index tournament_players_user_idx on public.tournament_players (user_id);

-- Datos de contacto de jugadores: nunca públicos
create table public.tournament_player_contacts (
  player_id  uuid primary key references public.tournament_players (id) on delete cascade,
  phone      text check (char_length(phone) <= 20),
  email      text check (char_length(email) <= 254)
);

create table public.team_tournament_stats (
  team_key          text primary key,
  team_name         text not null,
  tournaments_won   int not null default 0 check (tournaments_won >= 0),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contenido del sitio
-- ---------------------------------------------------------------------------
create table public.news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 160),
  content      text not null default '',
  excerpt      text not null default '' check (char_length(excerpt) <= 400),
  category     text not null default 'General',
  image_url    text,
  author_id    uuid references public.profiles (id) on delete set null,
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index news_published_idx on public.news (published, created_at desc);
create index news_author_idx on public.news (author_id);
create trigger news_updated_at before update on public.news
  for each row execute function public.set_updated_at();

create table public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid references public.profiles (id) on delete set null,
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject       text check (char_length(subject) <= 200),
  message       text not null check (char_length(message) between 1 and 5000),
  contact_type  text not null default 'general' check (char_length(contact_type) <= 40),
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index contact_messages_sender_idx on public.contact_messages (sender_id);

create table public.site_config (
  key         text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger site_config_updated_at before update on public.site_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Alta automática de perfil al registrarse con Google o Discord
-- (Google y Discord no siempre envían todos los campos: hay valores por defecto)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  avatar text := nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), '');
begin
  insert into public.profiles (id, display_name, avatar_url, auth_provider)
  values (
    new.id,
    left(coalesce(
      nullif(meta ->> 'full_name', ''),
      nullif(meta ->> 'name', ''),
      nullif(meta #>> '{custom_claims,global_name}', ''),
      nullif(meta ->> 'user_name', ''),
      'Jugador'
    ), 40),
    case when avatar ~ '^https://' then avatar end,
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

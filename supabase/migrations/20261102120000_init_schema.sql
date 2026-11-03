-- WAYIRA E-SPORTS — esquema inicial en Supabase (migración desde Firestore)
-- Solo estructura. No contiene datos. Aplicar primero en el proyecto de DESARROLLO.
-- Roles: se conservan los dos roles actuales ('user' | 'admin'). Cualquier cambio de roles
-- se hará en una migración posterior, después de aprobar la propuesta de la Fase 4.

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
-- Perfiles (Firestore: users/{uid})
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  firebase_uid     text unique,                       -- uid original en Firebase (trazabilidad)
  email            text,
  display_name     text not null default 'Jugador',
  avatar_url       text,
  cover_url        text,
  bio              text check (char_length(bio) <= 500),
  role             text not null default 'user' check (role in ('user', 'admin')),
  auth_provider    text,                              -- google | discord | phone | email
  riot_game_name   text,
  riot_tag_line    text,
  riot_region      text,
  riot_puuid       text unique,
  riot_verified    boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_display_name_idx on public.profiles (lower(display_name));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Seguidores (Firestore: arrays users.followers / users.following)
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

-- Historial del chatbot POTATO (Firestore: users/{uid}/potatoChat/session)
create table public.potato_chat_sessions (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger potato_chat_updated_at before update on public.potato_chat_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Comunidad: publicaciones, comentarios, reacciones (Firestore: posts con arrays anidados)
-- ---------------------------------------------------------------------------
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  firebase_id  text unique,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  content      text not null default '' check (char_length(content) <= 5000),
  image_urls   text[] not null default '{}',
  video_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
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
  id           uuid primary key default gen_random_uuid(),
  firebase_id  text,
  post_id      uuid not null references public.posts (id) on delete cascade,
  parent_id    uuid references public.comments (id) on delete cascade,   -- respuestas anidadas
  author_id    uuid not null references public.profiles (id) on delete cascade,
  content      text not null check (char_length(content) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id);

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Mensajería privada (Firestore: conversations/{a_b} con array messages)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  firebase_id      text unique,
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

-- ---------------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  firebase_id  text unique,
  user_id      uuid not null references public.profiles (id) on delete cascade,  -- destinatario
  actor_id     uuid references public.profiles (id) on delete set null,          -- quien actúa
  type         text not null check (type in ('like', 'comment', 'comment_reply', 'follow', 'message')),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  message      text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- Torneos (Firestore: tournaments con teams[] y bracket[] embebidos)
-- El bracket se conserva como JSONB porque el motor de llaves trabaja sobre arrays completos.
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id                              uuid primary key default gen_random_uuid(),
  firebase_id                     text unique,
  name                            text not null,
  description                     text not null default '',
  game                            text not null default 'League of Legends',
  start_date                      timestamptz,
  end_date                        timestamptz,
  max_teams                       int not null default 8 check (max_teams between 2 and 256),
  status                          text not null default 'upcoming'
                                    check (status in ('upcoming', 'ongoing', 'finished', 'confirmed')),
  format                          text check (format in ('single', 'double')),
  configured_rounds               int,
  bracket                         jsonb not null default '[]'::jsonb,
  lower_bracket                   jsonb not null default '[]'::jsonb,
  confirmed                       boolean not null default false,
  confirmed_at                    timestamptz,
  prize_pool_usd                  numeric(10, 2),
  grand_final_best_of             int check (grand_final_best_of in (1, 3)),
  redemption_final_best_of        int check (redemption_final_best_of in (1, 3)),
  finished_at                     timestamptz,
  champion_team_id                uuid,
  champion_team_name              text,
  redemption_champion_team_id     uuid,
  redemption_champion_team_name   text,
  created_by                      uuid references public.profiles (id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index tournaments_status_idx on public.tournaments (status, start_date);
create trigger tournaments_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();

create table public.tournament_teams (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text,                                -- id del equipo dentro del documento de Firestore
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  name           text not null,
  logo_url       text,
  captain_id     uuid references public.profiles (id) on delete set null,
  captain_name   text,
  registered_at  timestamptz not null default now(),
  unique (tournament_id, name)
);
create index tournament_teams_tournament_idx on public.tournament_teams (tournament_id);

-- Jugadores: datos públicos del equipo (nombre de invocador, posición, campeón)
create table public.tournament_players (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.tournament_teams (id) on delete cascade,
  user_id        uuid references public.profiles (id) on delete set null,
  display_name   text not null,
  game_name      text,
  tag_line       text,
  position       text,
  main_champion  text,
  is_substitute  boolean not null default false,
  sort_order     int not null default 0
);
create index tournament_players_team_idx on public.tournament_players (team_id);

-- Datos de contacto de jugadores: separados para que NO sean públicos (hoy lo son)
create table public.tournament_player_contacts (
  player_id  uuid primary key references public.tournament_players (id) on delete cascade,
  phone      text,
  email      text
);

-- Títulos ganados por equipo (Firestore: teamTournamentStats)
create table public.team_tournament_stats (
  team_key          text primary key,     -- id de equipo original o nombre normalizado
  team_name         text not null,
  tournaments_won   int not null default 0 check (tournaments_won >= 0),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Noticias, contacto y configuración del sitio
-- ---------------------------------------------------------------------------
create table public.news (
  id           uuid primary key default gen_random_uuid(),
  firebase_id  text unique,
  title        text not null,
  content      text not null default '',
  excerpt      text not null default '',
  category     text not null default 'General',
  image_url    text,
  author_id    uuid references public.profiles (id) on delete set null,
  author_name  text,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index news_published_idx on public.news (published, created_at desc);
create trigger news_updated_at before update on public.news
  for each row execute function public.set_updated_at();

create table public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  firebase_id   text unique,
  name          text not null check (char_length(name) <= 120),
  email         text not null check (char_length(email) <= 254),
  subject       text,
  message       text not null check (char_length(message) <= 5000),
  contact_type  text not null default 'general',
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Proyectos activos, socialStats, etc. (Firestore: config/{docId})
create table public.site_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger site_config_updated_at before update on public.site_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Alta automática de perfil al registrarse con Google / Discord
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, display_name, avatar_url, auth_provider, firebase_uid)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(meta ->> 'full_name', ''),
      nullif(meta ->> 'name', ''),
      nullif(meta #>> '{custom_claims,global_name}', ''),
      nullif(meta ->> 'user_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Jugador'
    ),
    nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), ''),
    coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    nullif(meta ->> 'firebase_uid', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

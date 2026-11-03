-- WAYIRA E-SPORTS — seguridad base: RLS en todas las tablas, privilegios por columna y funciones protegidas.
--
-- Diseño: las políticas preguntan por PERMISOS, no por roles: public.has_permission('news.manage').
-- Mientras la propuesta de roles no esté aprobada, has_permission() devuelve SIEMPRE false:
-- nadie tiene permisos administrativos desde la app (solo el panel de Supabase).
-- La migración de roles, cuando se apruebe, solo reemplaza has_permission() y añade sus tablas;
-- estas políticas no cambian.
--
-- Reglas generales:
--  * Cada usuario modifica solo lo suyo. Lo administrativo exige un permiso comprobado en el servidor.
--  * Nada de correos ni teléfonos en tablas legibles por otros usuarios.
--  * Los visitantes sin sesión solo leen contenido público (torneos, noticias publicadas, configuración del sitio).
--  * Las notificaciones y los vínculos de conversación los crea el servidor (triggers / funciones), no el navegador.

-- ---------------------------------------------------------------------------
-- Permisos (provisional, sin roles)
-- ---------------------------------------------------------------------------
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;  -- se reemplaza al aprobar la propuesta de roles
$$;

-- Ninguna función queda ejecutable por defecto: se concede una a una
-- (el cierre de este archivo vuelve a revocar todo y concede solo la API pública)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Por defecto, ningún acceso a tablas: se concede tabla a tabla (y columna a columna donde importa)
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table public.profiles                    enable row level security;
alter table public.follows                     enable row level security;
alter table public.potato_chat_sessions        enable row level security;
alter table public.posts                       enable row level security;
alter table public.post_reactions              enable row level security;
alter table public.comments                    enable row level security;
alter table public.comment_reactions           enable row level security;
alter table public.conversations               enable row level security;
alter table public.messages                    enable row level security;
alter table public.notifications               enable row level security;
alter table public.tournaments                 enable row level security;
alter table public.tournament_teams            enable row level security;
alter table public.tournament_players          enable row level security;
alter table public.tournament_player_contacts  enable row level security;
alter table public.team_tournament_stats       enable row level security;
alter table public.news                        enable row level security;
alter table public.contact_messages            enable row level security;
alter table public.site_config                 enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: visibles para usuarios con sesión; cada uno edita sus campos de perfil.
-- riot_verified, auth_provider, id y fechas no son editables desde el navegador.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_url, cover_url, bio, riot_game_name, riot_tag_line, riot_region)
  on public.profiles to authenticated;

create policy "profiles: lectura con sesión" on public.profiles
  for select to authenticated using (true);
create policy "profiles: el dueño edita su perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Contador público para la portada (sin exponer perfiles)
create or replace function public.count_registered_users()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$ select count(*) from public.profiles; $$;
grant execute on function public.count_registered_users() to anon, authenticated;

-- Correo de un usuario: solo con permiso explícito (para soporte); el propio correo está en la sesión
create or replace function public.get_user_email(target uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('users.view_private') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return (select u.email from auth.users u where u.id = target);
end;
$$;
grant execute on function public.get_user_email(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.follows to authenticated;
create policy "follows: lectura con sesión" on public.follows
  for select to authenticated using (true);
create policy "follows: sigo yo" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "follows: dejo de seguir yo" on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- POTATO: historial privado
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.potato_chat_sessions to authenticated;
create policy "potato: lee el dueño" on public.potato_chat_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "potato: crea el dueño" on public.potato_chat_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "potato: actualiza el dueño" on public.potato_chat_sessions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "potato: borra el dueño" on public.potato_chat_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Publicaciones, comentarios y reacciones
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.posts to authenticated;
grant update (content, image_urls, video_url) on public.posts to authenticated;
create policy "posts: lectura con sesión" on public.posts
  for select to authenticated using (true);
create policy "posts: publico como yo" on public.posts
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "posts: edito lo mío" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "posts: borra autor o moderación" on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.has_permission('community.moderate'));

grant select, insert, delete on public.post_reactions to authenticated;
grant update (kind) on public.post_reactions to authenticated;
create policy "post_reactions: lectura con sesión" on public.post_reactions
  for select to authenticated using (true);
create policy "post_reactions: reacciono yo" on public.post_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "post_reactions: cambio la mía" on public.post_reactions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "post_reactions: quito la mía" on public.post_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.comments to authenticated;
create policy "comments: lectura con sesión" on public.comments
  for select to authenticated using (true);
create policy "comments: comento como yo" on public.comments
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "comments: borra autor, dueño del post o moderación" on public.comments
  for delete to authenticated using (
    author_id = (select auth.uid())
    or public.has_permission('community.moderate')
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );

grant select, insert, delete on public.comment_reactions to authenticated;
grant update (kind) on public.comment_reactions to authenticated;
create policy "comment_reactions: lectura con sesión" on public.comment_reactions
  for select to authenticated using (true);
create policy "comment_reactions: reacciono yo" on public.comment_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "comment_reactions: cambio la mía" on public.comment_reactions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "comment_reactions: quito la mía" on public.comment_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Mensajes privados: solo los dos participantes. Las conversaciones se abren por función.
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and (select auth.uid()) in (c.user1_id, c.user2_id)
  );
$$;
grant execute on function public.is_conversation_member(uuid) to authenticated;

grant select, delete on public.conversations to authenticated;
create policy "conversations: leen participantes" on public.conversations
  for select to authenticated using ((select auth.uid()) in (user1_id, user2_id));
create policy "conversations: borran participantes" on public.conversations
  for delete to authenticated using ((select auth.uid()) in (user1_id, user2_id));

create or replace function public.start_conversation(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a uuid;
  b uuid;
  conv uuid;
begin
  if me is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if other is null or other = me then raise exception 'Destinatario no válido' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  a := least(me, other); b := greatest(me, other);
  insert into public.conversations (user1_id, user2_id) values (a, b)
    on conflict (user1_id, user2_id) do nothing;
  select id into conv from public.conversations where user1_id = a and user2_id = b;
  return conv;
end;
$$;
grant execute on function public.start_conversation(uuid) to authenticated;

grant select, insert on public.messages to authenticated;
create policy "messages: leen participantes" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "messages: envío como yo a mis conversaciones" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and read_at is null and public.is_conversation_member(conversation_id));

create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages m
     set read_at = now()
   where m.conversation_id = conv
     and m.read_at is null
     and m.sender_id <> (select auth.uid())
     and public.is_conversation_member(conv);
$$;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notificaciones: solo el destinatario las ve, marca y borra. Las crean triggers.
-- ---------------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
create policy "notifications: leo las mías" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: marco las mías" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: borro las mías" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.notify(recipient uuid, actor uuid, kind text, p_post uuid, p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if recipient is null or recipient = actor then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
  values (recipient, actor, kind, p_post, p_comment);
end;
$$;

create or replace function public.on_follow_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.following_id, new.follower_id, 'follow', null, null);
  return new;
end; $$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.on_follow_notify();

create or replace function public.on_post_reaction_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'like' then
    perform public.notify((select p.author_id from public.posts p where p.id = new.post_id), new.user_id, 'like', new.post_id, null);
  end if;
  return new;
end; $$;
create trigger post_reactions_notify after insert on public.post_reactions
  for each row execute function public.on_post_reaction_notify();

create or replace function public.on_comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is null then
    perform public.notify((select p.author_id from public.posts p where p.id = new.post_id), new.author_id, 'comment', new.post_id, new.id);
  else
    perform public.notify((select c.author_id from public.comments c where c.id = new.parent_id), new.author_id, 'comment_reply', new.post_id, new.id);
  end if;
  return new;
end; $$;
create trigger comments_notify after insert on public.comments
  for each row execute function public.on_comment_notify();

create or replace function public.on_message_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.conversations%rowtype;
begin
  select * into c from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  perform public.notify(case when c.user1_id = new.sender_id then c.user2_id else c.user1_id end,
                        new.sender_id, 'message', null, null);
  return new;
end; $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_sent();

-- ---------------------------------------------------------------------------
-- Torneos: lectura pública; gestión con permiso 'tournaments.manage'
-- ---------------------------------------------------------------------------
grant select on public.tournaments, public.tournament_teams, public.tournament_players,
                public.team_tournament_stats to anon, authenticated;
grant insert, update, delete on public.tournaments, public.tournament_teams,
                public.tournament_players, public.team_tournament_stats to authenticated;
grant select, insert, update, delete on public.tournament_player_contacts to authenticated;

create policy "tournaments: lectura pública" on public.tournaments
  for select to anon, authenticated using (true);
create policy "tournaments: crea gestión" on public.tournaments
  for insert to authenticated with check (public.has_permission('tournaments.manage'));
create policy "tournaments: edita gestión" on public.tournaments
  for update to authenticated
  using (public.has_permission('tournaments.manage')) with check (public.has_permission('tournaments.manage'));
create policy "tournaments: borra gestión" on public.tournaments
  for delete to authenticated using (public.has_permission('tournaments.manage'));

create policy "teams: lectura pública" on public.tournament_teams
  for select to anon, authenticated using (true);
create policy "teams: crea gestión" on public.tournament_teams
  for insert to authenticated with check (public.has_permission('tournaments.manage'));
create policy "teams: edita gestión" on public.tournament_teams
  for update to authenticated
  using (public.has_permission('tournaments.manage')) with check (public.has_permission('tournaments.manage'));
create policy "teams: borra gestión o capitán" on public.tournament_teams
  for delete to authenticated
  using (public.has_permission('tournaments.manage') or captain_id = (select auth.uid()));

create policy "players: lectura pública" on public.tournament_players
  for select to anon, authenticated using (true);
create policy "players: crea gestión" on public.tournament_players
  for insert to authenticated with check (public.has_permission('tournaments.manage'));
create policy "players: edita gestión" on public.tournament_players
  for update to authenticated
  using (public.has_permission('tournaments.manage')) with check (public.has_permission('tournaments.manage'));
create policy "players: borra gestión" on public.tournament_players
  for delete to authenticated using (public.has_permission('tournaments.manage'));

create policy "contacts: capitán o permiso" on public.tournament_player_contacts
  for select to authenticated using (
    public.has_permission('tournaments.view_contacts')
    or exists (select 1 from public.tournament_players p join public.tournament_teams t on t.id = p.team_id
               where p.id = player_id and t.captain_id = (select auth.uid()))
  );
create policy "contacts: crea gestión" on public.tournament_player_contacts
  for insert to authenticated with check (public.has_permission('tournaments.manage'));
create policy "contacts: edita gestión" on public.tournament_player_contacts
  for update to authenticated
  using (public.has_permission('tournaments.manage')) with check (public.has_permission('tournaments.manage'));
create policy "contacts: borra gestión" on public.tournament_player_contacts
  for delete to authenticated using (public.has_permission('tournaments.manage'));

create policy "team_stats: lectura pública" on public.team_tournament_stats
  for select to anon, authenticated using (true);
create policy "team_stats: crea gestión" on public.team_tournament_stats
  for insert to authenticated with check (public.has_permission('tournaments.manage'));
create policy "team_stats: edita gestión" on public.team_tournament_stats
  for update to authenticated
  using (public.has_permission('tournaments.manage')) with check (public.has_permission('tournaments.manage'));
create policy "team_stats: borra gestión" on public.team_tournament_stats
  for delete to authenticated using (public.has_permission('tournaments.manage'));

-- Inscripción de un equipo por su capitán (cualquier usuario con sesión), validada en el servidor
create or replace function public.register_team(
  p_tournament uuid,
  p_name text,
  p_logo_url text,
  p_players jsonb   -- [{display_name, game_name, tag_line, position, main_champion, phone, email, is_substitute}]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_t public.tournaments%rowtype;
  v_team uuid;
  v_player uuid;
  v_item jsonb;
  v_order int := 0;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Torneo no encontrado' using errcode = 'P0002'; end if;
  if v_t.status not in ('upcoming', 'ongoing') or v_t.confirmed then
    raise exception 'Las inscripciones están cerradas' using errcode = '22023';
  end if;
  if (select count(*) from public.tournament_teams where tournament_id = p_tournament) >= v_t.max_teams then
    raise exception 'El torneo está lleno' using errcode = '22023';
  end if;
  if exists (select 1 from public.tournament_teams where tournament_id = p_tournament and captain_id = v_uid) then
    raise exception 'Ya tienes un equipo inscrito en este torneo' using errcode = '23505';
  end if;
  if p_logo_url is not null and p_logo_url !~ '^https://' then
    raise exception 'Logo no válido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) not between 1 and 10 then
    raise exception 'Lista de jugadores no válida' using errcode = '22023';
  end if;

  insert into public.tournament_teams (tournament_id, name, logo_url, captain_id, captain_name)
  values (p_tournament, trim(p_name), p_logo_url, v_uid,
          (select display_name from public.profiles where id = v_uid))
  returning id into v_team;

  for v_item in select * from jsonb_array_elements(p_players) loop
    insert into public.tournament_players (team_id, display_name, game_name, tag_line, position,
                                           main_champion, is_substitute, sort_order)
    values (v_team, left(coalesce(nullif(trim(v_item ->> 'display_name'), ''), 'Jugador'), 60),
            left(v_item ->> 'game_name', 32), left(v_item ->> 'tag_line', 8), left(v_item ->> 'position', 20),
            left(v_item ->> 'main_champion', 40), coalesce((v_item ->> 'is_substitute')::boolean, false), v_order)
    returning id into v_player;
    if coalesce(v_item ->> 'phone', v_item ->> 'email') is not null then
      insert into public.tournament_player_contacts (player_id, phone, email)
      values (v_player, left(v_item ->> 'phone', 20), left(v_item ->> 'email', 254));
    end if;
    v_order := v_order + 1;
  end loop;
  return v_team;
end;
$$;
grant execute on function public.register_team(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Noticias
-- ---------------------------------------------------------------------------
grant select on public.news to anon, authenticated;
grant insert, update, delete on public.news to authenticated;
create policy "news: publicadas para todos" on public.news
  for select to anon, authenticated using (published or public.has_permission('news.manage'));
create policy "news: crea gestión" on public.news
  for insert to authenticated with check (public.has_permission('news.manage'));
create policy "news: edita gestión" on public.news
  for update to authenticated
  using (public.has_permission('news.manage')) with check (public.has_permission('news.manage'));
create policy "news: borra gestión" on public.news
  for delete to authenticated using (public.has_permission('news.manage'));

-- ---------------------------------------------------------------------------
-- Contacto: cualquiera envía (a su nombre si tiene sesión); solo con permiso se lee
-- ---------------------------------------------------------------------------
grant insert (name, email, subject, message, contact_type, sender_id) on public.contact_messages to anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (read) on public.contact_messages to authenticated;
create policy "contact: visitante envía" on public.contact_messages
  for insert to anon with check (sender_id is null);
create policy "contact: usuario envía a su nombre" on public.contact_messages
  for insert to authenticated with check (sender_id is null or sender_id = (select auth.uid()));
create policy "contact: lee con permiso" on public.contact_messages
  for select to authenticated using (public.has_permission('contact.read'));
create policy "contact: marca con permiso" on public.contact_messages
  for update to authenticated
  using (public.has_permission('contact.read')) with check (public.has_permission('contact.read'));
create policy "contact: borra con permiso" on public.contact_messages
  for delete to authenticated using (public.has_permission('contact.read'));

-- ---------------------------------------------------------------------------
-- Configuración del sitio (proyectos activos, estadísticas sociales)
-- ---------------------------------------------------------------------------
grant select on public.site_config to anon, authenticated;
grant insert, update, delete on public.site_config to authenticated;
create policy "site_config: lectura pública" on public.site_config
  for select to anon, authenticated using (true);
create policy "site_config: crea gestión" on public.site_config
  for insert to authenticated with check (public.has_permission('site.manage'));
create policy "site_config: edita gestión" on public.site_config
  for update to authenticated
  using (public.has_permission('site.manage')) with check (public.has_permission('site.manage'));
create policy "site_config: borra gestión" on public.site_config
  for delete to authenticated using (public.has_permission('site.manage'));

-- ---------------------------------------------------------------------------
-- Cierre: ninguna función es ejecutable salvo la API pública listada aquí.
-- (Las funciones de trigger y notify() quedan solo para el servidor.)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_permission(text)               to anon, authenticated;
grant execute on function public.count_registered_users()           to anon, authenticated;
grant execute on function public.get_user_email(uuid)               to authenticated;
grant execute on function public.is_conversation_member(uuid)       to authenticated;
grant execute on function public.start_conversation(uuid)           to authenticated;
grant execute on function public.mark_conversation_read(uuid)       to authenticated;
grant execute on function public.register_team(uuid, text, text, jsonb) to authenticated;

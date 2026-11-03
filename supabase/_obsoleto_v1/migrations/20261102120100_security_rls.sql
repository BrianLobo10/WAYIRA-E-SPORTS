-- WAYIRA E-SPORTS — seguridad: privilegios por columna, RLS y funciones protegidas
-- Reproduce los permisos actuales de Firestore y cierra los fallos detectados en la auditoría
-- (escalada a admin, publicaciones editables por terceros, datos personales públicos).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

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
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Activar RLS en todas las tablas
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
-- profiles: lectura entre usuarios con sesión SIN correo ni uid de Firebase;
-- cada usuario edita solo sus campos de perfil. El rol NO es editable por el usuario.
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, cover_url, bio, role, riot_game_name, riot_tag_line,
              riot_region, riot_puuid, riot_verified, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, avatar_url, cover_url, bio, riot_game_name, riot_tag_line, riot_region,
              riot_puuid, riot_verified)
  on public.profiles to authenticated;

create policy "profiles: lectura con sesión" on public.profiles
  for select to authenticated using (true);
create policy "profiles: el dueño edita su perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- El propio usuario puede leer su correo mediante esta función (no por la tabla)
create or replace function public.my_profile_private()
returns table (email text, firebase_uid text, auth_provider text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.firebase_uid, p.auth_provider
  from public.profiles p where p.id = (select auth.uid());
$$;
revoke all on function public.my_profile_private() from public;
grant execute on function public.my_profile_private() to authenticated;

-- Cambio de rol: solo un admin, siempre por función (auditable)
create or replace function public.set_user_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'Rol no válido: %', new_role using errcode = '22023';
  end if;
  if target = (select auth.uid()) and new_role <> 'admin' then
    raise exception 'Un administrador no puede quitarse su propio rol' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;
revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

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
-- potato_chat_sessions: privado por usuario
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.potato_chat_sessions to authenticated;
create policy "potato: solo el dueño" on public.potato_chat_sessions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- posts y comentarios: lectura con sesión; cada uno edita lo suyo; reacciones propias
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
create policy "posts: borro lo mío o admin" on public.posts
  for delete to authenticated using (author_id = (select auth.uid()) or public.is_admin());

grant select, insert, update, delete on public.post_reactions to authenticated;
create policy "post_reactions: lectura con sesión" on public.post_reactions
  for select to authenticated using (true);
create policy "post_reactions: solo las mías" on public.post_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "post_reactions: cambio las mías" on public.post_reactions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "post_reactions: quito las mías" on public.post_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.comments to authenticated;
create policy "comments: lectura con sesión" on public.comments
  for select to authenticated using (true);
create policy "comments: comento como yo" on public.comments
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "comments: borra autor, dueño del post o admin" on public.comments
  for delete to authenticated using (
    author_id = (select auth.uid())
    or public.is_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.comment_reactions to authenticated;
create policy "comment_reactions: lectura con sesión" on public.comment_reactions
  for select to authenticated using (true);
create policy "comment_reactions: solo las mías" on public.comment_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "comment_reactions: cambio las mías" on public.comment_reactions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "comment_reactions: quito las mías" on public.comment_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Mensajes privados: solo los dos participantes
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.conversations to authenticated;
create policy "conversations: solo participantes leen" on public.conversations
  for select to authenticated using ((select auth.uid()) in (user1_id, user2_id));
create policy "conversations: creo si participo" on public.conversations
  for insert to authenticated with check ((select auth.uid()) in (user1_id, user2_id));
create policy "conversations: borro si participo" on public.conversations
  for delete to authenticated using ((select auth.uid()) in (user1_id, user2_id));

grant select, insert on public.messages to authenticated;
create policy "messages: solo participantes leen" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "messages: envío como yo a mis conversaciones" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

-- Marcar como leídos los mensajes recibidos (sin poder editar su contenido)
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
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Mantener last_message_at al enviar
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Notificaciones: el destinatario lee/marca/borra; quien actúa solo crea a su nombre
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
create policy "notifications: leo las mías" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: creo como actor" on public.notifications
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and user_id <> (select auth.uid()));
create policy "notifications: marco las mías" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: borro las mías" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Torneos: lectura pública; escritura del admin o del creador (igual que hoy).
-- Inscripción de equipos por función validada (hoy falla para usuarios normales).
-- ---------------------------------------------------------------------------
grant select on public.tournaments, public.tournament_teams, public.tournament_players,
                public.team_tournament_stats to anon, authenticated;
grant insert, update, delete on public.tournaments to authenticated;
grant insert, update, delete on public.tournament_teams, public.tournament_players to authenticated;
grant select, insert, update, delete on public.tournament_player_contacts to authenticated;
grant insert, update, delete on public.team_tournament_stats to authenticated;

create policy "tournaments: lectura pública" on public.tournaments
  for select to anon, authenticated using (true);
-- Igual que la regla actual de Firestore. Propuesta para la Fase 4: solo admin/organizador.
create policy "tournaments: crea admin o creador" on public.tournaments
  for insert to authenticated
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy "tournaments: edita admin o creador" on public.tournaments
  for update to authenticated
  using (public.is_admin() or created_by = (select auth.uid()))
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy "tournaments: borra admin o creador" on public.tournaments
  for delete to authenticated using (public.is_admin() or created_by = (select auth.uid()));

create or replace function public.can_manage_tournament(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.tournaments x where x.id = t and x.created_by = (select auth.uid())
  );
$$;
revoke all on function public.can_manage_tournament(uuid) from public;
grant execute on function public.can_manage_tournament(uuid) to authenticated;

create policy "teams: lectura pública" on public.tournament_teams
  for select to anon, authenticated using (true);
create policy "teams: gestiona admin/creador" on public.tournament_teams
  for all to authenticated
  using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "players: lectura pública" on public.tournament_players
  for select to anon, authenticated using (true);
create policy "players: gestiona admin/creador" on public.tournament_players
  for all to authenticated
  using (public.can_manage_tournament((select tt.tournament_id from public.tournament_teams tt where tt.id = team_id)))
  with check (public.can_manage_tournament((select tt.tournament_id from public.tournament_teams tt where tt.id = team_id)));

create policy "contacts: solo admin, creador o capitán" on public.tournament_player_contacts
  for select to authenticated using (
    exists (
      select 1
      from public.tournament_players p
      join public.tournament_teams t on t.id = p.team_id
      where p.id = player_id
        and (t.captain_id = (select auth.uid()) or public.can_manage_tournament(t.tournament_id))
    )
  );
create policy "contacts: gestiona admin/creador" on public.tournament_player_contacts
  for all to authenticated
  using (exists (select 1 from public.tournament_players p join public.tournament_teams t on t.id = p.team_id
                 where p.id = player_id and public.can_manage_tournament(t.tournament_id)))
  with check (exists (select 1 from public.tournament_players p join public.tournament_teams t on t.id = p.team_id
                      where p.id = player_id and public.can_manage_tournament(t.tournament_id)));

create policy "team_stats: lectura pública" on public.team_tournament_stats
  for select to anon, authenticated using (true);
create policy "team_stats: solo admin" on public.team_tournament_stats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Inscripción de un equipo por su capitán: valida estado, cupo y duplicados en una transacción
create or replace function public.register_team(
  p_tournament uuid,
  p_name text,
  p_logo_url text,
  p_players jsonb       -- [{display_name, game_name, tag_line, position, main_champion, phone, email, is_substitute}]
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
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then
    raise exception 'Torneo no encontrado' using errcode = 'P0002';
  end if;
  if v_t.status not in ('upcoming', 'ongoing') or v_t.confirmed then
    raise exception 'Las inscripciones están cerradas' using errcode = '22023';
  end if;
  if (select count(*) from public.tournament_teams where tournament_id = p_tournament) >= v_t.max_teams then
    raise exception 'El torneo está lleno' using errcode = '22023';
  end if;
  if exists (select 1 from public.tournament_teams where tournament_id = p_tournament and captain_id = v_uid) then
    raise exception 'Ya tienes un equipo inscrito en este torneo' using errcode = '23505';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) = 0 then
    raise exception 'Faltan los jugadores' using errcode = '22023';
  end if;

  insert into public.tournament_teams (tournament_id, name, logo_url, captain_id, captain_name)
  values (p_tournament, trim(p_name), p_logo_url, v_uid,
          (select display_name from public.profiles where id = v_uid))
  returning id into v_team;

  for v_item in select * from jsonb_array_elements(p_players) loop
    insert into public.tournament_players (team_id, display_name, game_name, tag_line, position,
                                           main_champion, is_substitute, sort_order)
    values (v_team,
            coalesce(nullif(trim(v_item ->> 'display_name'), ''), 'Jugador'),
            v_item ->> 'game_name', v_item ->> 'tag_line', v_item ->> 'position',
            v_item ->> 'main_champion', coalesce((v_item ->> 'is_substitute')::boolean, false), v_order)
    returning id into v_player;
    insert into public.tournament_player_contacts (player_id, phone, email)
    values (v_player, v_item ->> 'phone', v_item ->> 'email');
    v_order := v_order + 1;
  end loop;

  return v_team;
end;
$$;
revoke all on function public.register_team(uuid, text, text, jsonb) from public;
grant execute on function public.register_team(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Noticias: públicas las publicadas; borradores y escritura solo admin
-- ---------------------------------------------------------------------------
grant select on public.news to anon, authenticated;
grant insert, update, delete on public.news to authenticated;
create policy "news: publicadas para todos" on public.news
  for select to anon, authenticated using (published or public.is_admin());
create policy "news: escribe admin" on public.news
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Contacto: cualquiera envía; solo admin lee (hoy cualquier usuario con sesión puede leerlos)
-- ---------------------------------------------------------------------------
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
create policy "contact: cualquiera envía" on public.contact_messages
  for insert to anon, authenticated with check (read = false);
create policy "contact: admin gestiona" on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy "contact: admin marca" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "contact: admin borra" on public.contact_messages
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Configuración del sitio: lectura pública, escritura admin
-- ---------------------------------------------------------------------------
grant select on public.site_config to anon, authenticated;
grant insert, update, delete on public.site_config to authenticated;
create policy "site_config: lectura pública" on public.site_config
  for select to anon, authenticated using (true);
create policy "site_config: escribe admin" on public.site_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

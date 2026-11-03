-- WAYIRA E-SPORTS — sorteos ejecutados en el servidor (sin dinero real).
-- Aprobado por el dueño del proyecto el 2026-11-02.
--
--  * Quien tiene 'giveaways.manage' crea el sorteo (borrador), lo abre, lo cierra y lo ejecuta.
--  * Dos modos: 'users' (los usuarios con sesión se apuntan solos) o 'list' (el organizador carga nombres).
--  * El ganador lo elige draw_giveaway() en la base de datos con aleatoriedad criptográfica
--    (gen_random_uuid usa el generador seguro del sistema). El navegador solo anima la ruleta con el resultado.
--  * Un sorteo ejecutado es inmutable: no cambia su configuración, sus participantes ni sus ganadores.

create table public.giveaways (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 3 and 120),
  description      text not null default '' check (char_length(description) <= 2000),
  entry_mode       text not null default 'users' check (entry_mode in ('users', 'list')),
  status           text not null default 'draft' check (status in ('draft', 'open', 'closed', 'drawn', 'cancelled')),
  winners_count    int  not null default 1 check (winners_count between 1 and 50),
  opens_at         timestamptz,
  closes_at        timestamptz,
  entries_at_draw  int,
  drawn_at         timestamptz,
  drawn_by         uuid references public.profiles (id) on delete set null,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at),
  check ((status = 'drawn') = (drawn_at is not null))
);
create index giveaways_status_idx on public.giveaways (status, created_at desc);
create index giveaways_created_by_idx on public.giveaways (created_by);
create index giveaways_drawn_by_idx on public.giveaways (drawn_by);
create trigger giveaways_updated_at before update on public.giveaways
  for each row execute function public.set_updated_at();

create table public.giveaway_entries (
  id           uuid primary key default gen_random_uuid(),
  giveaway_id  uuid not null references public.giveaways (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete cascade,
  label        text check (char_length(label) between 1 and 60),
  created_at   timestamptz not null default now(),
  check ((user_id is null) <> (label is null)),
  unique (giveaway_id, user_id)
);
create unique index giveaway_entries_label_uniq on public.giveaway_entries (giveaway_id, lower(label)) where label is not null;
create index giveaway_entries_user_idx on public.giveaway_entries (user_id);

create table public.giveaway_winners (
  giveaway_id  uuid not null references public.giveaways (id) on delete cascade,
  entry_id     uuid not null unique references public.giveaway_entries (id) on delete cascade,
  position     int  not null check (position >= 1),
  primary key (giveaway_id, position)
);

-- Un sorteo ejecutado no se toca; el estado 'drawn' solo lo pone draw_giveaway()
create or replace function private.giveaway_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'drawn' then raise exception 'Un sorteo ejecutado no se puede borrar' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status = 'drawn' then
    raise exception 'Un sorteo ejecutado no se puede modificar' using errcode = '42501';
  end if;
  if new.status = 'drawn' and new.drawn_at is null then
    raise exception 'Solo draw_giveaway() puede ejecutar un sorteo' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger giveaways_guard before update or delete on public.giveaways
  for each row execute function private.giveaway_guard();

alter table public.giveaways        enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_winners enable row level security;

grant select on public.giveaways, public.giveaway_entries, public.giveaway_winners to anon, authenticated;
grant insert (title, description, entry_mode, winners_count, opens_at, closes_at, created_by) on public.giveaways to authenticated;
grant update (title, description, entry_mode, winners_count, opens_at, closes_at, status) on public.giveaways to authenticated;
grant delete on public.giveaways to authenticated;
grant insert (giveaway_id, user_id, label) on public.giveaway_entries to authenticated;
grant delete on public.giveaway_entries to authenticated;

create policy "giveaways: visibles salvo borradores" on public.giveaways
  for select to anon, authenticated using (status <> 'draft' or private.has_permission('giveaways.manage'));
create policy "giveaways: crea gestión" on public.giveaways
  for insert to authenticated
  with check (private.has_permission('giveaways.manage') and status = 'draft' and created_by = (select auth.uid()));
create policy "giveaways: edita gestión" on public.giveaways
  for update to authenticated
  using (private.has_permission('giveaways.manage')) with check (private.has_permission('giveaways.manage'));
create policy "giveaways: borra gestión" on public.giveaways
  for delete to authenticated using (private.has_permission('giveaways.manage'));

create policy "entries: visibles si el sorteo lo es" on public.giveaway_entries
  for select to anon, authenticated using (
    exists (select 1 from public.giveaways g where g.id = giveaway_id
            and (g.status <> 'draft' or private.has_permission('giveaways.manage'))));
create policy "entries: me apunto yo" on public.giveaway_entries
  for insert to authenticated with check (
    user_id = (select auth.uid()) and label is null
    and exists (select 1 from public.giveaways g where g.id = giveaway_id
                and g.entry_mode = 'users' and g.status = 'open'
                and (g.opens_at is null or g.opens_at <= now())
                and (g.closes_at is null or g.closes_at > now())));
create policy "entries: gestión carga nombres" on public.giveaway_entries
  for insert to authenticated with check (
    private.has_permission('giveaways.manage') and user_id is null and label is not null
    and exists (select 1 from public.giveaways g where g.id = giveaway_id
                and g.entry_mode = 'list' and g.status in ('draft', 'open')));
create policy "entries: me retiro o gestión quita" on public.giveaway_entries
  for delete to authenticated using (
    exists (select 1 from public.giveaways g where g.id = giveaway_id and g.status in ('draft', 'open'))
    and (user_id = (select auth.uid()) or private.has_permission('giveaways.manage')));

create policy "winners: visibles si el sorteo lo es" on public.giveaway_winners
  for select to anon, authenticated using (
    exists (select 1 from public.giveaways g where g.id = giveaway_id
            and (g.status <> 'draft' or private.has_permission('giveaways.manage'))));

-- Ejecuta el sorteo: elige ganadores en el servidor y lo deja inmutable
create or replace function public.draw_giveaway(p_giveaway uuid)
returns table (out_position int, out_entry_id uuid, out_user_id uuid, out_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.giveaways%rowtype;
  n_entries int;
begin
  if not private.has_permission('giveaways.manage') then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  select * into g from public.giveaways where id = p_giveaway for update;
  if not found then raise exception 'Sorteo no encontrado' using errcode = 'P0002'; end if;
  if g.status not in ('open', 'closed') then
    raise exception 'Solo se puede ejecutar un sorteo abierto o cerrado' using errcode = '22023';
  end if;
  select count(*) into n_entries from public.giveaway_entries where giveaway_id = p_giveaway;
  if n_entries = 0 then raise exception 'El sorteo no tiene participantes' using errcode = '22023'; end if;

  insert into public.giveaway_winners (giveaway_id, entry_id, position)
  select p_giveaway, e.id, row_number() over (order by gen_random_uuid())
    from (select id from public.giveaway_entries where giveaway_id = p_giveaway
          order by gen_random_uuid() limit least(g.winners_count, n_entries)) e;

  update public.giveaways
     set status = 'drawn', drawn_at = now(), drawn_by = (select auth.uid()), entries_at_draw = n_entries
   where id = p_giveaway;

  return query
    select w.position, w.entry_id, e.user_id, coalesce(e.label, p.display_name)
      from public.giveaway_winners w
      join public.giveaway_entries e on e.id = w.entry_id
      left join public.profiles p on p.id = e.user_id
     where w.giveaway_id = p_giveaway
     order by w.position;
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_permission(text)              to anon, authenticated;
grant execute on function private.is_conversation_member(uuid)      to authenticated;
grant execute on function public.count_registered_users()           to anon, authenticated;
grant execute on function public.get_user_email(uuid, text, uuid)   to authenticated;
grant execute on function public.start_conversation(uuid)           to authenticated;
grant execute on function public.mark_conversation_read(uuid)       to authenticated;
grant execute on function public.register_team(uuid, text, text, jsonb) to authenticated;
grant execute on function public.withdraw_team(uuid)                to authenticated;
grant execute on function public.check_in_team(uuid)                to authenticated;
grant execute on function public.close_check_in(uuid)               to authenticated;
grant execute on function public.draw_giveaway(uuid)                to authenticated;
grant execute on function public.my_permissions()                   to authenticated;
grant execute on function public.assign_role(uuid, text)            to authenticated;
grant execute on function public.revoke_role(uuid, text)            to authenticated;

alter publication supabase_realtime add table public.giveaways;
alter publication supabase_realtime add table public.giveaway_winners;

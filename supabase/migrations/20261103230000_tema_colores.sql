-- Colores de la web controlados por el Superadmin (/control/apariencia).
-- Se guardan en site_config con la clave 'theme'. Lectura pública (la web los necesita para pintarse);
-- escritura solo con el permiso site.theme, que tiene únicamente el Superadmin.

insert into public.role_permissions (role_key, permission) values ('superadmin', 'site.theme')
on conflict do nothing;

-- La clave 'theme' queda fuera de site.manage (Admin) y de site.content (Editor)
drop policy if exists "site_config: crea gestión" on public.site_config;
create policy "site_config: crea gestión" on public.site_config
  for insert to authenticated
  with check (
    (key <> 'theme' and private.has_permission('site.manage'))
    or (key = 'theme' and private.has_permission('site.theme'))
  );

drop policy if exists "site_config: edita gestión" on public.site_config;
create policy "site_config: edita gestión" on public.site_config
  for update to authenticated
  using (
    (key <> 'theme' and (private.has_permission('site.manage')
      or (private.has_permission('site.content') and key in ('social_stats', 'projects', 'home_highlights'))))
    or (key = 'theme' and private.has_permission('site.theme'))
  )
  with check (
    (key <> 'theme' and (private.has_permission('site.manage')
      or (private.has_permission('site.content') and key in ('social_stats', 'projects', 'home_highlights'))))
    or (key = 'theme' and private.has_permission('site.theme'))
  );

drop policy if exists "site_config: borra gestión" on public.site_config;
create policy "site_config: borra gestión" on public.site_config
  for delete to authenticated
  using (
    (key <> 'theme' and private.has_permission('site.manage'))
    or (key = 'theme' and private.has_permission('site.theme'))
  );

-- Validación: solo colores conocidos y en formato #RRGGBB (nada de CSS libre que pueda romper o inyectar estilos)
create or replace function private.validate_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary', 'headingFont', 'bodyFont'];
  k text;
begin
  if new.key <> 'theme' then
    return new;
  end if;
  if jsonb_typeof(new.value) <> 'object' then
    raise exception 'El tema debe ser un objeto de colores.' using errcode = '23514';
  end if;
  for k in select jsonb_object_keys(new.value) loop
    if not (k = any (allowed)) then
      raise exception 'Color desconocido en el tema: %', k using errcode = '23514';
    end if;
    if k in ('headingFont', 'bodyFont') then
      if jsonb_typeof(new.value -> k) <> 'string'
         or new.value ->> k not in ('Newsreader', 'Lora', 'Playfair Display', 'Montserrat', 'Georgia', 'Bebas Neue', 'Bitter', 'Cormorant Garamond', 'DM Serif Display', 'Libre Baskerville', 'Merriweather', 'Oswald', 'Poppins', 'Roboto Slab', 'Space Grotesk', 'Anton', 'Archivo Black', 'Cinzel', 'Pacifico', 'Permanent Marker', 'Unbounded', 'Inter', 'Manrope', 'Lato', 'Source Sans 3', 'DM Sans', 'Nunito Sans', 'Open Sans', 'PT Sans', 'Raleway', 'Roboto', 'Rubik', 'Ubuntu', 'Work Sans', 'Atkinson Hyperlegible', 'Fira Sans', 'IBM Plex Sans', 'Inconsolata', 'Josefin Sans', 'Kalam', 'Libre Franklin', 'Space Mono') then
        raise exception 'Fuente no permitida: %', k using errcode = '23514';
      end if;
      continue;
    end if;
    if jsonb_typeof(new.value -> k) <> 'string' or (new.value ->> k) !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'El color % debe tener el formato #RRGGBB.', k using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_theme() from public, anon, authenticated;
drop trigger if exists site_config_validate_theme on public.site_config;
create trigger site_config_validate_theme before insert or update on public.site_config
  for each row execute function private.validate_theme();

-- Auditoría de cambios de colores
create or replace function private.audit_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.key, old.key) = 'theme' and (select auth.uid()) is not null then
    perform private.audit(
      case when tg_op = 'DELETE' then 'theme_reset' else 'theme_saved' end,
      'site', 'theme',
      case when tg_op = 'DELETE' then 'Restauró los colores originales' else 'Cambió los colores de la web' end,
      jsonb_build_object('before', case when tg_op <> 'INSERT' then old.value end,
                         'after',  case when tg_op <> 'DELETE' then new.value end));
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_theme() from public, anon, authenticated;
drop trigger if exists site_config_audit_theme on public.site_config;
create trigger site_config_audit_theme after insert or update or delete on public.site_config
  for each row execute function private.audit_theme();

-- Corrige el acceso a la configuración visual y garantiza que site.theme
-- sea el único permiso necesario para leer/escribir el tema.

insert into public.role_permissions (role_key, permission)
values ('superadmin', 'site.theme')
on conflict do nothing;

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

insert into public.site_config (key, value)
values ('theme', '{
  "bg":"#121211",
  "surface":"#1A1A18",
  "accent":"#D7FF3F",
  "alert":"#FF5A36",
  "text":"#ECEAE3",
  "textSecondary":"#A3A19A",
  "headingFont":"Newsreader",
  "bodyFont":"Inter"
}'::jsonb)
on conflict (key) do nothing;

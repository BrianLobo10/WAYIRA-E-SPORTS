-- WAYIRA E-SPORTS — Storage (buckets + políticas) y Realtime
-- Lectura pública de imágenes: hoy las URLs de descarga de Firebase ya son públicas para quien las tenga.
-- Escritura: cada usuario solo en su carpeta (<uid>/...). Logos de equipos y noticias: admin.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,  5242880,  array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('covers',      'covers',      true,  8388608,  array['image/jpeg','image/png','image/webp','image/avif']),
  ('post-media',  'post-media',  true,  52428800, array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm']),
  ('team-logos',  'team-logos',  true,  2097152,  array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']),
  ('news-images', 'news-images', true,  8388608,  array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;

-- Subir / reemplazar / borrar en la carpeta propia
create policy "storage: subo en mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'covers', 'post-media')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: actualizo en mi carpeta" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-media')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: borro en mi carpeta" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-media')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Logos de equipos: el capitán sube en su carpeta; noticias: solo admin
create policy "storage: logos en mi carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: noticias solo admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'news-images' and public.is_admin())
  with check (bucket_id = 'news-images' and public.is_admin());

-- Realtime: mensajes, conversaciones, notificaciones y feed
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_reactions;
alter publication supabase_realtime add table public.comments;

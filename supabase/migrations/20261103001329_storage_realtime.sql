-- WAYIRA E-SPORTS — Storage (buckets + políticas) y Realtime
-- Lectura de imágenes: buckets públicos (URL directa). Listar archivos no está permitido.
-- Escritura: cada usuario solo en su carpeta (<uid>/...). Imágenes de noticias: permiso 'news.manage'.
-- SVG no se acepta en ningún bucket (puede llevar scripts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,  5242880,  array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('covers',      'covers',      true,  8388608,  array['image/jpeg','image/png','image/webp','image/avif']),
  ('post-media',  'post-media',  true,  52428800, array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm']),
  ('team-logos',  'team-logos',  true,  2097152,  array['image/jpeg','image/png','image/webp','image/avif']),
  ('news-images', 'news-images', true,  8388608,  array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;

-- Carpeta propia en avatares, portadas, multimedia de publicaciones y logos de equipo
create policy "storage: subo en mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'covers', 'post-media', 'team-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: veo mis archivos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-media', 'team-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: actualizo en mi carpeta" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-media', 'team-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('avatars', 'covers', 'post-media', 'team-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: borro en mi carpeta" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-media', 'team-logos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Moderación: puede retirar multimedia de publicaciones ajenas
create policy "storage: moderación borra multimedia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media' and public.has_permission('community.moderate'));

-- Imágenes de noticias: solo con permiso
create policy "storage: noticias con permiso (lectura)" on storage.objects
  for select to authenticated using (bucket_id = 'news-images' and public.has_permission('news.manage'));
create policy "storage: noticias con permiso (subida)" on storage.objects
  for insert to authenticated with check (bucket_id = 'news-images' and public.has_permission('news.manage'));
create policy "storage: noticias con permiso (cambio)" on storage.objects
  for update to authenticated
  using (bucket_id = 'news-images' and public.has_permission('news.manage'))
  with check (bucket_id = 'news-images' and public.has_permission('news.manage'));
create policy "storage: noticias con permiso (borrado)" on storage.objects
  for delete to authenticated using (bucket_id = 'news-images' and public.has_permission('news.manage'));

-- Realtime: solo tablas cuyo RLS ya filtra por usuario. Los cambios llegan
-- únicamente a quien puede leer la fila (Realtime aplica las políticas SELECT).
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_reactions;
alter publication supabase_realtime add table public.comments;

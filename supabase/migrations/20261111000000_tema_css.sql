-- WAYIRA E-SPORTS — Tema sin salto al cargar
-- Al guardar el estilo en el Super Admin se publica también un archivo theme.css en el bucket público «site».
-- index.html lo enlaza, así el navegador pinta la primera vez ya con los colores elegidos.
-- Solo quien tiene 'site.theme' (el Superadmin) puede escribir ese archivo (y solo ese archivo). Se puede ejecutar dos veces.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 65536, array['text/css'])
on conflict (id) do update set public = true, file_size_limit = 65536, allowed_mime_types = array['text/css'];

drop policy if exists "storage: tema (lectura gestión)" on storage.objects;
drop policy if exists "storage: tema (subida)" on storage.objects;
drop policy if exists "storage: tema (cambio)" on storage.objects;
drop policy if exists "storage: tema (borrado)" on storage.objects;

-- La web pública lo lee por la URL pública (no pasa por estas reglas). Esta lectura es la que necesita el upsert.
create policy "storage: tema (lectura gestión)" on storage.objects
  for select to authenticated
  using (bucket_id = 'site' and name = 'theme.css' and private.has_permission('site.theme'));
create policy "storage: tema (subida)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site' and name = 'theme.css' and private.has_permission('site.theme'));
create policy "storage: tema (cambio)" on storage.objects
  for update to authenticated
  using (bucket_id = 'site' and name = 'theme.css' and private.has_permission('site.theme'))
  with check (bucket_id = 'site' and name = 'theme.css' and private.has_permission('site.theme'));
create policy "storage: tema (borrado)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site' and name = 'theme.css' and private.has_permission('site.theme'));

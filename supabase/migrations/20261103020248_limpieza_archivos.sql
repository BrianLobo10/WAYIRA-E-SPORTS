-- WAYIRA E-SPORTS — detección de archivos huérfanos en Storage.
-- Aprobado por el dueño del proyecto el 2026-11-02.
--
-- Los archivos se borran con la API de Storage (borrar filas de storage.objects por SQL no borra el archivo).
-- Aquí solo se calcula QUÉ sobra; el borrado lo hace:
--   1) la web, al borrar un post o cambiar avatar/portada (inmediato), y
--   2) una tarea programada diaria con la clave de servidor (pendiente: Edge Function + cron).
-- Un archivo se considera huérfano si tiene más de 24 horas y ninguna fila lo referencia.

create or replace function private.orphan_storage_objects(min_age interval default interval '24 hours')
returns table (bucket_id text, name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with refs as (
    select unnest(p.image_urls) as url from public.posts p
    union all select p.video_url from public.posts p where p.video_url is not null
    union all select pr.avatar_url from public.profiles pr where pr.avatar_url is not null
    union all select pr.cover_url from public.profiles pr where pr.cover_url is not null
    union all select t.logo_url from public.tournament_teams t where t.logo_url is not null
    union all select n.image_url from public.news n where n.image_url is not null
  )
  select o.bucket_id, o.name, o.created_at
    from storage.objects o
   where o.bucket_id in ('avatars', 'covers', 'post-media', 'team-logos', 'news-images')
     and o.created_at < now() - min_age
     and not exists (
       select 1 from refs r
        where split_part(r.url, '?', 1) like '%/storage/v1/object/public/' || o.bucket_id || '/' || o.name
     );
$$;

-- Solo la tarea de servidor (service_role) la usa; nadie más puede ejecutarla
revoke execute on function private.orphan_storage_objects(interval) from public, anon, authenticated;
grant execute on function private.orphan_storage_objects(interval) to service_role;
grant usage on schema private to service_role;

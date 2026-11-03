-- WAYIRA E-SPORTS — Límite de envíos del formulario de contacto (antispam)
-- Cualquiera puede escribir sin cuenta; para evitar abusos:
--   * máximo 3 mensajes por correo cada hora
--   * máximo 30 mensajes en total cada 10 minutos (protege el buzón ante ataques)

create index if not exists contact_messages_email_idx on public.contact_messages (lower(email), created_at desc);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

create or replace function private.contact_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.contact_messages
       where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Ya enviaste varios mensajes con este correo. Intenta de nuevo en una hora.' using errcode = '54000';
  end if;
  if (select count(*) from public.contact_messages where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'El buzón está recibiendo muchos mensajes. Intenta de nuevo en unos minutos.' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.contact_rate_limit() from public, anon, authenticated;

drop trigger if exists contact_messages_rate_limit on public.contact_messages;
create trigger contact_messages_rate_limit before insert on public.contact_messages
  for each row execute function private.contact_rate_limit();

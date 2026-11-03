-- Pruebas del límite antispam del formulario de contacto
set client_min_messages = notice;
do $$
declare ok boolean;
begin
  -- 3 mensajes con el mismo correo pasan, el 4.º no
  set local role anon;
  insert into public.contact_messages (name, email, message) values ('A', 'spam@x.co', 'uno');
  insert into public.contact_messages (name, email, message) values ('A', 'SPAM@x.co', 'dos');
  insert into public.contact_messages (name, email, message) values ('A', 'spam@x.co', 'tres');
  begin
    insert into public.contact_messages (name, email, message) values ('A', 'spam@x.co', 'cuatro');
    ok := false;
  exception when others then ok := sqlstate = '54000';
  end;
  reset role;
  if ok then raise notice 'OK K1 cuarto mensaje del mismo correo bloqueado'; else raise notice 'FALLO K1'; end if;

  -- Otro correo sí puede escribir
  set local role anon;
  insert into public.contact_messages (name, email, message) values ('B', 'otro@x.co', 'hola');
  reset role;
  raise notice 'OK K2 otro correo puede escribir';

  -- Anónimo no puede leer el buzón
  set local role anon;
  begin
    perform 1 from public.contact_messages;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  if ok then raise notice 'OK K3 anónimo no lee el buzón'; else raise notice 'FALLO K3'; end if;
end $$;

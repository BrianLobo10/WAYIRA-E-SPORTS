-- Tipografías configurables del tema público.
create or replace function private.validate_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary', 'headingFont', 'bodyFont'];
  color_keys text[] := array['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary'];
  heading_fonts text[] := array['Newsreader', 'Lora', 'Playfair Display', 'Montserrat', 'Georgia', 'Bebas Neue', 'Bitter', 'Cormorant Garamond', 'DM Serif Display', 'Libre Baskerville', 'Merriweather', 'Oswald', 'Poppins', 'Roboto Slab', 'Space Grotesk', 'Anton', 'Archivo Black', 'Cinzel', 'Pacifico', 'Permanent Marker', 'Unbounded'];
  body_fonts text[] := array['Inter', 'Manrope', 'Lato', 'Source Sans 3', 'DM Sans', 'Nunito Sans', 'Open Sans', 'Poppins', 'PT Sans', 'Raleway', 'Roboto', 'Rubik', 'Ubuntu', 'Work Sans', 'Atkinson Hyperlegible', 'Cormorant Garamond', 'Fira Sans', 'IBM Plex Sans', 'Inconsolata', 'Josefin Sans', 'Kalam', 'Libre Franklin', 'Space Mono'];
  k text;
begin
  if new.key <> 'theme' then
    return new;
  end if;
  if jsonb_typeof(new.value) <> 'object' then
    raise exception 'El tema debe ser un objeto.' using errcode = '23514';
  end if;
  for k in select jsonb_object_keys(new.value) loop
    if not (k = any (allowed)) then
      raise exception 'Clave desconocida en el tema: %', k using errcode = '23514';
    end if;
    if k = any (color_keys) then
      if jsonb_typeof(new.value -> k) <> 'string' or (new.value ->> k) !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'El color % debe tener el formato #RRGGBB.', k using errcode = '23514';
      end if;
    elsif k = 'headingFont' then
      if jsonb_typeof(new.value -> k) <> 'string' or not ((new.value ->> k) = any (heading_fonts)) then
        raise exception 'Fuente de títulos no permitida.' using errcode = '23514';
      end if;
    elsif k = 'bodyFont' then
      if jsonb_typeof(new.value -> k) <> 'string' or not ((new.value ->> k) = any (body_fonts)) then
        raise exception 'Fuente de texto no permitida.' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

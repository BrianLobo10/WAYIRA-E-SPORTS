-- Catálogo ampliado de tipografías del tema (clásicas, modernas, impacto, gamer, retro, manuscritas, locas).
-- Debe coincidir con FONT_CATALOG en src/app/services/theme.service.ts.
create or replace function private.validate_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary', 'headingFont', 'bodyFont'];
  color_keys text[] := array['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary'];
  heading_fonts text[] := array['Newsreader', 'Lora', 'Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Libre Baskerville', 'Merriweather', 'Bitter', 'Roboto Slab', 'Cinzel', 'Georgia', 'Montserrat', 'Poppins', 'Space Grotesk', 'Unbounded', 'Syne', 'Bricolage Grotesque', 'Sora', 'Outfit', 'Lexend', 'Bebas Neue', 'Anton', 'Archivo Black', 'Oswald', 'Teko', 'Russo One', 'Black Ops One', 'Alfa Slab One', 'Orbitron', 'Audiowide', 'Michroma', 'Bungee', 'Righteous', 'Chakra Petch', 'Exo 2', 'Rajdhani', 'Saira Stencil One', 'Press Start 2P', 'VT323', 'Silkscreen', 'Monoton', 'Bungee Shade', 'Major Mono Display', 'Space Mono', 'Pacifico', 'Permanent Marker', 'Lobster', 'Caveat', 'Kalam', 'Sedgwick Ave Display', 'Creepster', 'Nosifer', 'Metal Mania', 'Rubik Glitch', 'Faster One', 'UnifrakturMaguntia', 'Bangers', 'Rubik Mono One'];
  body_fonts text[] := array['Lora', 'Cormorant Garamond', 'Poppins', 'Space Grotesk', 'Sora', 'Outfit', 'Lexend', 'Chakra Petch', 'Exo 2', 'Rajdhani', 'VT323', 'Space Mono', 'Inconsolata', 'Caveat', 'Kalam', 'Comic Neue', 'Inter', 'Manrope', 'Lato', 'Source Sans 3', 'DM Sans', 'Nunito Sans', 'Open Sans', 'PT Sans', 'Raleway', 'Roboto', 'Rubik', 'Ubuntu', 'Work Sans', 'Atkinson Hyperlegible', 'Fira Sans', 'IBM Plex Sans', 'Libre Franklin', 'Josefin Sans', 'Quicksand', 'Barlow'];
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
        raise exception 'Fuente de títulos no permitida: %', new.value ->> k using errcode = '23514';
      end if;
    elsif k = 'bodyFont' then
      if jsonb_typeof(new.value -> k) <> 'string' or not ((new.value ->> k) = any (body_fonts)) then
        raise exception 'Fuente de texto no permitida: %', new.value ->> k using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_theme() from public, anon, authenticated;

-- Una cuenta de Riot solo puede estar vinculada a un perfil de Wayira.
-- riot_puuid ya era único, pero el PUUID cambia si cambia la clave de Riot; el Riot ID (nombre#tag) no.
create unique index if not exists profiles_riot_id_unico
  on public.profiles (lower(riot_game_name), lower(riot_tag_line))
  where riot_game_name is not null and riot_tag_line is not null;

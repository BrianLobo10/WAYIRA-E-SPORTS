# Supabase — esquema de WAYIRA (arranque limpio)

Proyecto de desarrollo: `vghcjtdfwtbznowlovxa`. Las ocho migraciones están aplicadas allí, con estas mismas versiones.

| Migración | Contenido |
|---|---|
| `20261102234011_init_schema.sql` | Tablas, índices, triggers y alta automática de perfiles (Google/Discord) |
| `20261103001055_security_rls.sql` | RLS en todas las tablas, privilegios por columna, funciones protegidas |
| `20261103001329_storage_realtime.sql` | 5 buckets públicos con escritura por carpeta de usuario; Realtime |
| `20261103020044_roles_permisos.sql` | 6 roles, permisos, insignias públicas, auditoría, acceso restringido a correos, esquema `private` |
| `20261103020207_inscripciones_antifraude.sql` | Inscripción sin teléfono ni correo: aprobación, lista de espera, check-in, Riot ID único, límite diario |
| `20261103020238_sorteos.sql` | Sorteos ejecutados en el servidor con aleatoriedad segura e inmutables tras ejecutarse |
| `20261103020248_limpieza_archivos.sql` | Detección de archivos huérfanos en Storage (para la tarea de limpieza) |
| `20261103023538_limites_funciones.sql` | Contador de límites que usan las Edge Functions (solo con la clave de servidor) |
| `20261103054619_contacto_antispam.sql` | Límite del formulario de contacto: 3 mensajes por correo cada hora y 30 en total cada 10 minutos |

`proposals/20261103120000_roles.sql` queda solo como historial: ya se aplicó, revisado, como `20261103020044_roles_permisos.sql`.

## Edge Functions (reemplazan la función `api` de Firebase)

| Función | Rutas | Secretos (Supabase → Edge Functions → Secrets) |
|---|---|---|
| `riot` | `GET /riot/summoner/:region/:gameName/:tagLine`, `/riot/account/:region/:puuid`, `/riot/matches/:region/:puuid?count=` (máx. 20), `/riot/mastery/:region/:puuid?count=` (máx. 10), `/riot/health` | `RIOT_API_KEY` |
| `potato` | `POST /potato` (requiere sesión), `GET /potato/health` | `OPENAI_API_KEY` |
| `social` | `GET /social/live`, `/social/stats`, `/social/health` | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `DISCORD_INVITE_CODE` (opcionales) |

URL base: `https://vghcjtdfwtbznowlovxa.supabase.co/functions/v1/`. Código en `functions/`; `_shared/http.ts` tiene CORS,
caché y límites. Límites: Riot 30/min por visitante; POTATO 6/min y 60/día por usuario; social 60/min por visitante.

## Pruebas (Postgres local)

```bash
createdb wayira_test
psql -d wayira_test -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do psql -d wayira_test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d wayira_test -f tests/01_policies_test.sql            # 17: visitante y usuarios
psql -d wayira_test -f tests/02_roles_test.sql               # 11: roles, auto-elevación, correos
psql -d wayira_test -f tests/03_inscripciones_sorteos_test.sql  # 21: inscripciones, sorteos, límites, escalada
psql -d wayira_test -f tests/04_contacto_test.sql            # 3: límite antispam del contacto
```

Cada prueba imprime `OK ...`; cualquier fallo aborta con `FALLO ...`.

## Superadmin

Nadie puede asignarlo desde la web. Se asigna una sola vez, con SQL en el panel de Supabase, después de que
el dueño inicie sesión por primera vez:

```sql
insert into public.user_roles (user_id, role_key) values ('<id del usuario>', 'superadmin');
```

## Frontend

Solo la URL y la clave pública (`sb_publishable_...`). Nunca `service_role` en Angular.
Los perfiles no tienen correo; el propio está en la sesión (`supabase.auth.getUser()`).

## Pendiente de limpieza manual (no borrar sin confirmar)

En `migrations/` solo deben quedar las ocho migraciones de arriba. Los archivos
`20261102120000_init_schema.sql`, `20261102120100_security_rls.sql` y `20261102120200_storage_realtime.sql`
son la versión anterior (con Firebase e `is_admin`); su copia idéntica está en `_obsoleto_v1/`.

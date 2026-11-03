# Supabase — esquema de WAYIRA

- `migrations/20261102120000_init_schema.sql` — tablas, índices, triggers y alta automática de perfiles.
- `migrations/20261102120100_security_rls.sql` — privilegios por columna, RLS y funciones protegidas
  (`is_admin`, `set_user_role`, `register_team`, `mark_conversation_read`, `my_profile_private`).
- `migrations/20261102120200_storage_realtime.sql` — buckets, políticas de Storage y tablas en Realtime.
- `tests/` — solo para Postgres local: `00_supabase_stub.sql` simula lo mínimo de Supabase y
  `01_policies_test.sql` comprueba los permisos (11 casos).

Probar en local (Postgres 15+):

```bash
createdb wayira_test
psql -d wayira_test -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do psql -d wayira_test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d wayira_test -f tests/01_policies_test.sql   # debe imprimir solo "OK ..."
```

Aplicar en Supabase: primero en el proyecto de **desarrollo**, en orden, desde el SQL Editor o con
`supabase link --project-ref <ref>` + `supabase db push`. Nunca en producción sin aprobación.

Nota para el frontend: `profiles.email` no es legible por otros usuarios. Las consultas deben listar
columnas (`select('id, display_name, avatar_url, ...')`) en vez de `select('*')`; el correo propio
se obtiene de la sesión o con `rpc('my_profile_private')`.

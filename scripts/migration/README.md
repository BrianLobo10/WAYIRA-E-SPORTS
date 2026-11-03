# Migración Firebase → Supabase (scripts locales)

Estos scripts **no forman parte de la app** y no se ejecutan en ningún despliegue. Firebase nunca se modifica.

| Archivo | Qué hace | ¿Escribe algo externo? |
|---|---|---|
| `export-firestore.mjs` | Copia Firestore, usuarios de Auth e inventario de Storage a `migration-data/*.json` | No (solo lee Firebase) |
| `transform.mjs` | Convierte documentos de Firestore en filas de Postgres (pura, sin red) | No |
| `import-supabase.mjs` | Crea usuarios, copia imágenes y escribe filas en Supabase **de desarrollo** | Solo con `--apply` |
| `verify.mjs` | Compara conteos exportados vs. Supabase | No |
| `transform.test.mjs` | Pruebas de la transformación (`npm test`) | No |

## Pasos

1. `cd scripts/migration && npm install`
2. Copia `env.migration.example` como `.env.migration` (con punto al inicio) y rellénalo (ver comentarios). Ese archivo está en `.gitignore`.
3. Firebase Console → Configuración del proyecto → Cuentas de servicio → **Generar nueva clave privada**.
   Guarda el JSON **fuera del repositorio** y pon su ruta en `FIREBASE_SERVICE_ACCOUNT`.
4. `npm run export` → genera `migration-data/firebase-export-<fecha>.json` (respaldo).
5. Aplica las migraciones SQL de `supabase/migrations` al proyecto de desarrollo (SQL Editor o `supabase db push`).
6. Simulación: `node import-supabase.mjs migration-data/<archivo>.json --target=vghcjtdfwtbznowlovxa`
7. Revisa los avisos. Si todo está bien: repite con `--apply`.
8. `node verify.mjs migration-data/<archivo>.json --target=vghcjtdfwtbznowlovxa`

El import es repetible: usa ids deterministas y `upsert`, así que volver a ejecutarlo no duplica filas.

## Seguridad

- La clave `service_role` y la cuenta de servicio de Firebase son **secretas**: solo en `.env.migration` / fuera del repo.
- Nunca copies esas claves a `src/environments/*.ts`. Angular solo usa la URL y la clave **publishable/anon**.
- El script se niega a correr si `--target`, `MIGRATION_TARGET_REF`, `SUPABASE_URL` y `MIGRATION_TARGET_IS_DEV=true` no coinciden.

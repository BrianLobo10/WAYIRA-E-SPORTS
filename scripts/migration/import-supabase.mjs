// Importa una exportación de Firebase a un proyecto Supabase de DESARROLLO.
//
//   node import-supabase.mjs migration-data/firebase-export-XXXX.json --target=<ref>            (simulación)
//   node import-supabase.mjs migration-data/firebase-export-XXXX.json --target=<ref> --apply    (escribe)
//
// Salvaguardas:
//  - Por defecto NO escribe nada (dry run): muestra qué haría y los avisos de integridad.
//  - --target debe coincidir con MIGRATION_TARGET_REF y con la URL configurada.
//  - La clave service_role se lee de .env.migration (no versionado) y nunca se imprime.
//  - Nunca toca Firebase. Es repetible: usa ids deterministas y upsert.

import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';
import { transform, firebaseStorageUrls } from './transform.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const target = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const env = loadEnv();

if (!file) throw new Error('Indica el archivo de exportación');
if (!target || target !== env.MIGRATION_TARGET_REF) {
  throw new Error('--target debe coincidir con MIGRATION_TARGET_REF de .env.migration');
}
if (env.SUPABASE_URL !== `https://${target}.supabase.co`) {
  throw new Error(`SUPABASE_URL (${env.SUPABASE_URL}) no corresponde al proyecto ${target}`);
}
if (env.MIGRATION_TARGET_IS_DEV !== 'true') {
  throw new Error('MIGRATION_TARGET_IS_DEV=true es obligatorio: este script solo se ejecuta contra desarrollo');
}
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.migration');

const exp = JSON.parse(readFileSync(file, 'utf8'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(apply ? '[APLICAR]' : '[SIMULACIÓN]', ...a);

// 1) Usuarios de Auth -> auth.users de Supabase (el trigger crea el perfil)
async function findUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const uidMap = {};
const profileDocs = exp.firestore.users ?? {};
for (const u of exp.authUsers) {
  const doc = profileDocs[u.uid] ?? {};
  const meta = {
    full_name: doc.displayName ?? u.displayName ?? undefined,
    avatar_url: doc.photoURL ?? u.photoURL ?? undefined,
    firebase_uid: u.uid
  };
  if (!u.email && !u.phoneNumber) { console.warn(`auth ${u.uid}: sin correo ni teléfono, se omite`); continue; }
  if (!apply) { uidMap[u.uid] = `pendiente:${u.uid}`; log(`crear usuario ${u.email ?? u.phoneNumber} (${u.providers.join(',')})`); continue; }
  const existing = u.email ? await findUserByEmail(u.email) : null;
  if (existing) { uidMap[u.uid] = existing.id; continue; }
  const { data, error } = await sb.auth.admin.createUser(
    u.email
      ? { email: u.email, email_confirm: true, user_metadata: meta }
      : { phone: u.phoneNumber, phone_confirm: true, user_metadata: meta }
  );
  if (error) throw new Error(`No se pudo crear ${u.uid}: ${error.message}`);
  uidMap[u.uid] = data.user.id;
}
log(`usuarios mapeados: ${Object.keys(uidMap).length}/${exp.authUsers.length}`);

// 2) Transformación
const { rows, warnings } = transform(exp, uidMap);
for (const w of warnings) console.warn('AVISO', w);

// 3) Copia de archivos de Storage (Firebase -> buckets de Supabase) y reescritura de URLs
const urls = firebaseStorageUrls(rows);
const bucketFor = (path) =>
  path.startsWith('profiles/') ? 'avatars' : path.startsWith('covers/') ? 'covers'
  : path.startsWith('posts/') ? 'post-media' : path.includes('news') ? 'news-images' : 'team-logos';
const urlMap = {};
for (const url of urls) {
  const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
  const [, ownerFid, ...rest] = path.split('/');
  const owner = uidMap[ownerFid] ?? 'migrated';
  const bucket = bucketFor(path);
  const newPath = `${owner}/${rest.join('/') || path.split('/').pop()}`;
  if (!apply) { log(`copiar ${path} -> ${bucket}/${newPath}`); continue; }
  const res = await fetch(url);
  if (!res.ok) { console.warn(`AVISO no se pudo descargar ${path} (${res.status}); se conserva la URL de Firebase`); continue; }
  const body = Buffer.from(await res.arrayBuffer());
  const { error } = await sb.storage.from(bucket).upload(newPath, body, {
    contentType: res.headers.get('content-type') ?? undefined, upsert: true, cacheControl: '31536000'
  });
  if (error) { console.warn(`AVISO fallo al subir ${newPath}: ${error.message}`); continue; }
  urlMap[url] = sb.storage.from(bucket).getPublicUrl(newPath).data.publicUrl;
}
const remapped = JSON.parse(JSON.stringify(rows, (k, v) => (typeof v === 'string' && urlMap[v] ? urlMap[v] : v)));

// 4) Escritura en orden de dependencias (upsert idempotente)
const ORDER = [
  ['profiles', 'id'], ['follows', 'follower_id,following_id'], ['potato_chat_sessions', 'user_id'],
  ['posts', 'id'], ['post_reactions', 'post_id,user_id'], ['comments', 'id'], ['comment_reactions', 'comment_id,user_id'],
  ['conversations', 'id'], ['messages', 'id'], ['notifications', 'id'], ['tournaments', 'id'],
  ['tournament_teams', 'id'], ['tournament_players', 'id'], ['tournament_player_contacts', 'player_id'],
  ['team_tournament_stats', 'team_key'], ['news', 'id'], ['contact_messages', 'id'], ['site_config', 'key']
];
const report = { file, target, apply, at: new Date().toISOString(), counts: {}, warnings };
for (const [table, conflict] of ORDER) {
  const list = remapped[table];
  report.counts[table] = list.length;
  if (!list.length) continue;
  if (!apply) { log(`${table}: ${list.length} filas`); continue; }
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await sb.from(table).upsert(list.slice(i, i + 500), { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  log(`${table}: ${list.length} filas escritas`);
}
writeFileSync(file.replace(/\.json$/, `.import-${apply ? 'aplicado' : 'simulado'}.json`), JSON.stringify(report, null, 2));
log('Informe guardado junto a la exportación. Ejecuta verify.mjs para comparar conteos.');

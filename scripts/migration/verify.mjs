// Compara los conteos de la exportación de Firebase con lo que hay en Supabase (solo lectura).
//   node verify.mjs migration-data/firebase-export-XXXX.json --target=<ref>
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';
import { transform } from './transform.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const target = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const env = loadEnv();
if (!target || target !== env.MIGRATION_TARGET_REF) throw new Error('--target no coincide con MIGRATION_TARGET_REF');

const exp = JSON.parse(readFileSync(file, 'utf8'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const fakeMap = Object.fromEntries(exp.authUsers.map((u) => [u.uid, u.uid]));
const { rows } = transform(exp, fakeMap);
let ok = true;
for (const [table, list] of Object.entries(rows)) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) { console.error(`${table}: ${error.message}`); ok = false; continue; }
  const mark = count >= list.length ? 'OK ' : 'FALTA';
  if (count < list.length) ok = false;
  console.log(`${mark} ${table.padEnd(28)} esperado ${String(list.length).padStart(5)}  en Supabase ${String(count).padStart(5)}`);
}
const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
console.log(`${users.users.length >= exp.authUsers.length ? 'OK ' : 'FALTA'} auth.users esperado ${exp.authUsers.length} en Supabase ${users.users.length}`);
process.exit(ok ? 0 : 1);

// Exporta Firestore + usuarios de Auth + inventario de Storage a JSON local. SOLO LECTURA.
// Uso:  node export-firestore.mjs
// Requiere en .env.migration: FIREBASE_SERVICE_ACCOUNT=<ruta a la clave JSON fuera del repo>
// No escribe, borra ni modifica nada en Firebase.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './env.mjs';
import admin from 'firebase-admin';

const env = loadEnv();
const keyPath = env.FIREBASE_SERVICE_ACCOUNT;
if (!keyPath) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT en .env.migration');
const credentials = JSON.parse(readFileSync(keyPath, 'utf8'));
if (credentials.project_id !== 'wayira-e-sports') {
  throw new Error(`La clave es del proyecto "${credentials.project_id}", se esperaba "wayira-e-sports"`);
}

admin.initializeApp({ credential: admin.credential.cert(credentials), storageBucket: 'wayira-e-sports.firebasestorage.app' });
const db = admin.firestore();

const COLLECTIONS = ['users', 'posts', 'notifications', 'conversations', 'tournaments', 'teamTournamentStats',
  'news', 'contactMessages', 'config', 'messages'];

function plain(value) {
  if (value instanceof admin.firestore.Timestamp) return { _seconds: value.seconds, _nanoseconds: value.nanoseconds };
  if (value instanceof admin.firestore.DocumentReference) return { _ref: value.path };
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}

async function dumpCollection(ref) {
  const out = {};
  const snap = await ref.get();
  for (const doc of snap.docs) {
    const data = plain(doc.data());
    const subs = await doc.ref.listCollections();
    if (subs.length) {
      data.__sub = {};
      for (const sub of subs) data.__sub[sub.id] = await dumpCollection(sub);
    }
    out[doc.id] = data;
  }
  return out;
}

const firestore = {};
for (const name of COLLECTIONS) {
  firestore[name] = await dumpCollection(db.collection(name));
  console.log(`firestore/${name}: ${Object.keys(firestore[name]).length} documentos`);
}
const extra = (await db.listCollections()).map((c) => c.id).filter((c) => !COLLECTIONS.includes(c));
if (extra.length) console.warn('Colecciones no previstas (revisar):', extra.join(', '));

const authUsers = [];
let pageToken;
do {
  const page = await admin.auth().listUsers(1000, pageToken);
  for (const u of page.users) {
    authUsers.push({
      uid: u.uid, email: u.email ?? null, emailVerified: u.emailVerified, phoneNumber: u.phoneNumber ?? null,
      displayName: u.displayName ?? null, photoURL: u.photoURL ?? null, disabled: u.disabled,
      providers: u.providerData.map((p) => p.providerId), createdAt: u.metadata.creationTime,
      lastSignInAt: u.metadata.lastSignInTime
    });
  }
  pageToken = page.pageToken;
} while (pageToken);
console.log(`auth: ${authUsers.length} usuarios`);

const [files] = await admin.storage().bucket().getFiles();
const storage = files.map((f) => ({ name: f.name, size: Number(f.metadata.size), contentType: f.metadata.contentType }));
console.log(`storage: ${storage.length} archivos`);

const dir = join(process.cwd(), 'migration-data');
mkdirSync(dir, { recursive: true });
const file = join(dir, `firebase-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), project: 'wayira-e-sports', firestore, authUsers, storage }, null, 2));
console.log(`Exportación guardada en ${file}`);
process.exit(0);

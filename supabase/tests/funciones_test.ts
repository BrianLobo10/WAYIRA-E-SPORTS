// Uso: deno run --allow-net --allow-env --allow-read tests/funciones_test.ts <riot|potato|social> [conclave]
// Arnés de pruebas: simula Riot, OpenAI, Twitch, Discord y Supabase; arranca cada función y la consulta.
const realFetch = globalThis.fetch;
const calls: string[] = [];
const PUUID = 'p'.repeat(78);
const rl = new Map<string, number>();
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  calls.push(url);
  const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  const key = new Headers(init?.headers).get('X-Riot-Token');
  if (url.includes('riotgames.com')) {
    if (key !== 'RGAPI-prueba') return j({}, 403);
    if (url.includes('by-riot-id/Fantasma')) return j({}, 404);
    if (url.includes('by-riot-id/')) return j({ puuid: PUUID, gameName: 'Faker', tagLine: 'KR1' });
    if (url.includes('la1.api') && url.includes('summoners/by-puuid')) return j({}, 404);
    if (url.includes('summoners/by-puuid')) return j({ puuid: PUUID, summonerLevel: 300 });
    if (url.includes('entries/by-puuid')) return j([{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD' }]);
    if (url.includes('/ids?')) return j(Array.from({ length: Number(new URL(url).searchParams.get('count')) }, (_, i) => `LA1_${i}`));
    if (url.includes('/matches/LA1_')) return j({ metadata: { matchId: url.split('/').pop() } });
    if (url.includes('champion-masteries')) return j([{ championId: 1, championPoints: 100 }]);
    if (url.includes('accounts/by-puuid')) return j({ puuid: PUUID, gameName: 'Faker', tagLine: 'KR1', extra: 'x' });
  }
  if (url.includes('api.openai.com')) return j({ choices: [{ message: { content: 'Respuesta IA' } }] });
  if (url.endsWith('/auth/v1/user')) {
    const auth = new Headers(init?.headers).get('Authorization');
    return auth === 'Bearer token-valido' ? j({ id: 'u1' }) : j({ msg: 'invalid' }, 401);
  }
  if (url.includes('/rpc/consume_rate_limit')) {
    const b = JSON.parse(String(init?.body)); const n = (rl.get(b.p_bucket) ?? 0) + 1; rl.set(b.p_bucket, n); return j(n <= b.p_max);
  }
  if (url.includes('/rpc/count_registered_users')) return j(42);
  if (url.includes('/rest/v1/site_config?key=eq.social_stats')) return j([{ value: { instagram: 900, discord: 10 } }]);
  if (url.includes('/rest/v1/site_config?on_conflict')) return j(null, 201);
  if (url.includes('discord.com/api')) return j({ approximate_member_count: 321 });
  if (url.includes('decapi.me')) return new Response('offline');
  return j({ error: 'sin simular ' + url }, 599);
}) as typeof fetch;

Deno.env.set('SUPABASE_URL', 'https://simulado.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'srv');
Deno.env.set('SUPABASE_ANON_KEY', 'anon');
const fn = Deno.args[0];
if (Deno.args[1] === 'conclave') { Deno.env.set('RIOT_API_KEY', 'RGAPI-prueba'); Deno.env.set('OPENAI_API_KEY', 'sk-prueba'); }

const serve = Deno.serve;
let port = 0;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Deno.ServeHandler) => { const s = serve({ port: 0, hostname: '127.0.0.1', onListen: ({ port: p }) => { port = p; } }, h); return s; };
await import(`../functions/${fn}/index.ts`);
await new Promise((r) => setTimeout(r, 200));
const base = `http://127.0.0.1:${port}/functions/v1/${fn}`;
const results: string[] = [];
async function check(name: string, path: string, init: RequestInit, expectStatus: number, test?: (b: any) => boolean) {
  const r = await realFetch(base + path, init);
  const b = await r.json().catch(() => null);
  const ok = r.status === expectStatus && (!test || test(b));
  results.push(`${ok ? 'OK   ' : 'FALLO'} ${fn} ${name} → ${r.status} ${ok ? '' : JSON.stringify(b)}`);
}
const H = { headers: { Origin: 'http://localhost:4200' } };
if (fn === 'riot' && Deno.args[1] !== 'conclave') {
  await check('health sin clave', '/health', H, 200, (b) => b.apiKeyConfigured === false);
  await check('sin clave responde 503', '/summoner/la1/Faker/KR1', H, 503);
}
if (fn === 'riot' && Deno.args[1] === 'conclave') {
  await check('health con clave', '/health', H, 200, (b) => b.apiKeyConfigured === true);
  await check('región inválida', '/summoner/xx/Faker/KR1', H, 400);
  await check('summoner (prueba otra región si no está en LA1)', '/summoner/la1/Faker/KR1', H, 200, (b) => b.actualRegion === 'la2' && b.leagues.length === 1 && b.gameName === 'Faker');
  await check('jugador inexistente', '/summoner/la1/Fantasma/LAN', H, 404);
  await check('puuid inválido', '/account/la1/abc', H, 404);
  await check('account solo devuelve 3 campos', `/account/la1/${PUUID}`, H, 200, (b) => Object.keys(b).length === 3);
  await check('matches máximo 100', `/matches/la1/${PUUID}?count=500`, H, 200, (b) => b.length === 100);
  await check('mastery sin rankings inventados', `/mastery/la1/${PUUID}?count=50`, H, 200, (b) => b[0].worldRank === undefined);
  await check('POST no permitido', '/health', { method: 'POST', ...H }, 405);
  const pre = await realFetch(base + '/health', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4200' } });
  results.push(`${pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'http://localhost:4200' ? 'OK   ' : 'FALLO'} riot CORS para localhost:4200`);
  const evil = await realFetch(base + '/health', { headers: { Origin: 'https://sitio-falso.com' } });
  results.push(`${evil.headers.get('access-control-allow-origin') !== 'https://sitio-falso.com' ? 'OK   ' : 'FALLO'} riot CORS no autoriza otros sitios`);
  for (let i = 0; i < 90; i++) await realFetch(base + `/account/la1/${PUUID}`, H).then((r) => r.body?.cancel());
  await check('límite 90 por minuto', `/account/la1/${PUUID}`, H, 429);
  results.push(`${calls.some((u) => u.includes('RGAPI')) ? 'FALLO' : 'OK   '} riot la clave nunca va en la URL`);
}
if (fn === 'potato') {
  await check('health', '/health', H, 200);
  await check('sin sesión → 401', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"hola"}' }, 401);
  await check('token falso → 401', '', { method: 'POST', headers: { Authorization: 'Bearer token-falso' }, body: '{"message":"hola"}' }, 401);
  const auth = { Authorization: 'Bearer token-valido', 'Content-Type': 'application/json' };
  await check('mensaje vacío → 400', '', { method: 'POST', headers: auth, body: '{"message":"  "}' }, 400);
  await check('mensaje largo → 400', '', { method: 'POST', headers: auth, body: JSON.stringify({ message: 'x'.repeat(281) }) }, 400);
  await check(Deno.args[1] === 'conclave' ? 'responde con IA' : 'sin clave responde local', '', { method: 'POST', headers: auth, body: '{"message":"hola"}' }, 200,
    (b) => b.model === (Deno.args[1] === 'conclave' ? 'gpt-4o-mini' : 'local'));
  for (let i = 0; i < 5; i++) await realFetch(base, { method: 'POST', headers: auth, body: '{"message":"hola"}' }).then((r) => r.body?.cancel());
  await check('límite 6 por minuto', '', { method: 'POST', headers: auth, body: '{"message":"hola"}' }, 429);
}
if (fn === 'social') {
  await check('health', '/health', H, 200);
  await check('live', '/live', H, 200, (b) => b.live === false && b.channel === 'wayiraesports');
  await check('stats', '/stats', H, 200, (b) => b.discord === 321 && b.instagram === 900 && b.registeredUsers === 42 && b.twitch === null);
}
console.log(results.join('\n'));
Deno.exit(0);

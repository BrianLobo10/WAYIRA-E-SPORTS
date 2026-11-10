// Uso: deno run -A tests/riot_sync_test.ts   (necesita la base local de run_all.sh en el puerto 55432)
// Simula Riot y reenvía las llamadas /rest/v1/rpc/* a Postgres local como service_role.
const realFetch = globalThis.fetch;
const PUUID = 'q'.repeat(78);
const OTHER = 'o'.repeat(78);
const TOTAL = 30;
const calls: string[] = [];
let detailCalls = 0;
let throttle = false;

async function sql(fn: string, args: Record<string, unknown>): Promise<string> {
  const lit = (v: unknown): string => {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return `array[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(',')}]::text[]`;
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const params = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
  const q = fn === 'riot_history'
    ? `select coalesce(jsonb_agg(x), '[]') from public.riot_history(${params}) x`
    : `select to_jsonb(public.${fn}(${params}))`;
  const cmd = new Deno.Command('psql', { args: ['-h', '/tmp', '-p', '55432', '-U', 'postgres', '-d', 'wayira_test', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `set role service_role; ${q}`] });
  const out = await cmd.output();
  if (out.code !== 0) throw new Error(new TextDecoder().decode(out.stderr));
  return new TextDecoder().decode(out.stdout).trim().split('\n').pop() || 'null';
}

globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  calls.push(url);
  const j = (b: unknown, s = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/rpc/consume_rate_limit')) return j(true);
  if (url.includes('/rest/v1/rpc/')) {
    const fn = url.split('/rpc/')[1];
    try { return j(await sql(fn, JSON.parse(String(init?.body)))); } catch (e) { return j({ message: String(e) }, 400); }
  }
  if (url.includes('riotgames.com')) {
    const u = new URL(url);
    if (url.includes('/ids?')) {
      const start = Number(u.searchParams.get('start')); const count = Number(u.searchParams.get('count'));
      if (!u.searchParams.get('startTime')) return j({}, 400);
      return j(Array.from({ length: Math.max(0, Math.min(count, TOTAL - start)) }, (_, i) => `LA1_${90000 - start - i}`));
    }
    const id = url.split('/').pop()!;
    if (throttle) return j({}, 429);
    detailCalls++;
    if (id === 'LA1_89995') return j({}, 403); // partida privada (ARAM: Caos)
    const n = Number(id.split('_')[1]);
    return j({
      metadata: { matchId: id },
      info: {
        gameCreation: Date.now() - (90000 - n) * 3600_000, gameDuration: 1800, queueId: n % 2 ? 420 : 450, gameMode: n % 2 ? 'CLASSIC' : 'ARAM',
        teams: [{ teamId: 100, objectives: { champion: { kills: 30 } } }, { teamId: 200, objectives: { champion: { kills: 20 } } }],
        participants: [
          { puuid: PUUID, riotIdGameName: 'Brian', riotIdTagline: 'LAN', championName: 'Ahri', championId: 103, teamId: 100, win: true, kills: 10, deaths: 2, assists: 8, totalMinionsKilled: 150, neutralMinionsKilled: 10, goldEarned: 12000, visionScore: 20, item0: 1, extraField: 'x'.repeat(5000) },
          { puuid: OTHER, riotIdGameName: 'Otro', riotIdTagline: 'LAN', championName: 'Zed', championId: 238, teamId: 200, win: false, kills: 3, deaths: 7, assists: 2 },
        ],
      },
    });
  }
  return j({ error: 'sin simular ' + url }, 599);
}) as typeof fetch;

Deno.env.set('SUPABASE_URL', 'https://simulado.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'srv');
Deno.env.set('RIOT_API_KEY', 'RGAPI-prueba');
const serve = Deno.serve;
let port = 0;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Deno.ServeHandler) => serve({ port: 0, hostname: '127.0.0.1', onListen: ({ port: p }) => { port = p; } }, h);
await import('../functions/riot/index.ts');
await new Promise((r) => setTimeout(r, 200));
const base = `http://127.0.0.1:${port}/functions/v1/riot`;
const H = { headers: { Origin: 'http://localhost:4200' } };
const results: string[] = [];
const get = async (p: string) => { const r = await realFetch(base + p, H); return { status: r.status, body: await r.json() }; };
const ok = (cond: boolean, name: string, extra: unknown = '') => results.push(`${cond ? 'OK   ' : 'FALLO'} ${name} ${cond ? '' : JSON.stringify(extra)}`);

let r = await get(`/sync/la1/${PUUID}`);
ok(r.status === 200 && r.body.total === TOTAL && r.body.stored === 11 && r.body.pending === 18, '1.ª llamada: lista la temporada, 12 intentos (11 guardadas + 1 privada descartada)', r.body);
ok(calls.some((u) => u.includes('startTime=')), 'pide solo partidas de la temporada (startTime)');
r = await get(`/sync/la1/${PUUID}`);
ok(r.body.stored === 23 && r.body.pending === 6, '2.ª llamada: 12 nuevas', r.body);
throttle = true;
r = await get(`/sync/la1/${PUUID}`);
ok(r.status === 200 && r.body.limited === true && r.body.pending === 6, 'límite de Riot (429): no pierde nada y avisa', r.body);
throttle = false;
r = await get(`/sync/la1/${PUUID}`);
ok(r.body.pending === 0 && r.body.stored === 29, '4.ª llamada: termina (29 = 30 - 1 privada)', r.body);
const before = detailCalls;
r = await get(`/sync/la1/${OTHER}`);
ok(r.body.stored === 29 && detailCalls - before <= 1, 'otro jugador de las mismas partidas: reutiliza las 29 (solo reintenta la privada)', { ...r.body, newCalls: detailCalls - before });
r = await get(`/history/la1/${PUUID}`);
const first = r.body[0];
ok(Array.isArray(r.body) && r.body.length === 29 && first.id === 'LA1_90000' && first.participants[0].cs === 160 && first.teamKills['100'] === 30,
  'historial: 29 partidas, recientes primero, datos reducidos correctos', first);
ok(JSON.stringify(first).length < 3000 && !JSON.stringify(first).includes('extraField'), 'partida guardada reducida (sin campos sobrantes)', JSON.stringify(first).length);
r = await get('/sync/la1/corto');
ok(r.status === 404, 'puuid inválido rechazado', r);
ok(!calls.some((u) => u.includes('RGAPI')), 'la clave nunca va en la URL');
console.log(results.join('\n'));
Deno.exit(0);

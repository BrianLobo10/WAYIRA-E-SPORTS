// WAYIRA — datos de League of Legends desde la API de Riot (reemplaza /api/summoner, /api/account,
// /api/matches y /api/mastery de la función de Firebase).
//
// Rutas (GET):
//   /riot/health
//   /riot/summoner/:region/:gameName/:tagLine
//   /riot/account/:region/:puuid
//   /riot/matches/:region/:puuid?count=10        (máximo 20)
//   /riot/mastery/:region/:puuid?count=5         (máximo 10)
//
// Seguridad: la clave RIOT_API_KEY solo vive en los secretos de Supabase. Límite de 30 consultas
// por minuto por visitante y caché para no gastar la cuota de Riot.

import { allowRequest, cached, clientIp, json, preflight, routeParts } from '../_shared/http.ts';

const REGIONS: Record<string, string> = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia', oc1: 'sea',
};
const PUUID = /^[A-Za-z0-9_-]{40,100}$/;
const UNAVAILABLE = 'El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.';

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function riotKey(): string | null {
  let value = (Deno.env.get('RIOT_API_KEY') ?? '').trim();
  while (value.startsWith('RGAPI-RGAPI-')) value = value.slice(6);
  return value || null;
}

async function riot<T>(url: string, key: string, notFound = 'No encontrado'): Promise<T> {
  let res: Response | null = null;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, { headers: { 'X-Riot-Token': key } });
    lastStatus = res.status;
    if (res.ok) return await res.json() as T;
    if (![502, 503].includes(res.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  console.error('Riot API response', lastStatus, new URL(url).pathname);
  if (lastStatus === 404) throw new HttpError(404, notFound);
  if ([401, 403, 429, 503].includes(lastStatus)) throw new HttpError(503, UNAVAILABLE);
  throw new HttpError(502, UNAVAILABLE);
}

function cleanName(value: string): string {
  return value.replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
}

type Summoner = Record<string, unknown> & { puuid: string };

async function summonerByPuuid(platform: string, puuid: string, key: string) {
  const summoner = await riot<Summoner>(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, key, 'Jugador no encontrado');
  let leagues: unknown[] = [];
  try {
    leagues = await riot<unknown[]>(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, key);
  } catch { /* sin datos rankeados */ }
  return { ...summoner, leagues, actualRegion: platform };
}

async function summoner(region: string, gameName: string, tagLine: string, key: string) {
  const routing = REGIONS[region];
  const name = cleanName(gameName);
  const tag = cleanName(tagLine);
  if (!name || name.length > 30 || !tag || tag.length > 10) throw new HttpError(400, 'Nombre o tag no válido');

  return await cached(`summoner:${region}:${name.toLowerCase()}:${tag.toLowerCase()}`, 5 * 60_000, async () => {
    const account = await riot<{ puuid: string; gameName: string; tagLine: string }>(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      key, 'Jugador no encontrado');
    // Si la cuenta no está en la región pedida, se prueba en las otras de Latinoamérica
    const candidates = [region, ...['la1', 'la2', 'br1', 'na1'].filter((r) => r !== region)];
    for (const platform of candidates) {
      try {
        const data = await summonerByPuuid(platform, account.puuid, key);
        return { ...data, gameName: account.gameName, tagLine: account.tagLine };
      } catch (err) {
        if (!(err instanceof HttpError) || err.status !== 404) throw err;
      }
    }
    throw new HttpError(404, `El jugador no tiene cuenta de League of Legends en ${region.toUpperCase()}.`);
  });
}

async function account(region: string, puuid: string, key: string) {
  return await cached(`account:${puuid}`, 30_000, async () => {
    const data = await riot<{ puuid: string; gameName: string; tagLine: string }>(
      `https://${REGIONS[region]}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`, key, 'Cuenta no encontrada');
    return { puuid: data.puuid, gameName: data.gameName, tagLine: data.tagLine };
  });
}

// Todas las colas de partidas (ARAM 450, ARAM: Caos 2400, Arena 1700, normales, URF...) salvo que se filtre una
async function matches(region: string, puuid: string, count: number, key: string, queue?: number, start = 0) {
  const routing = REGIONS[region];
  return await cached(`matches:${region}:${puuid}:${start}:${count}:${queue ?? 'all'}`, 60_000, async () => {
    const queueFilter = queue ? `&queue=${queue}` : '';
    const ids = await riot<string[]>(
      `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}${queueFilter}`, key);
    const details: unknown[] = [];
    for (let i = 0; i < ids.length; i += 5) {
      const batch = await Promise.all(ids.slice(i, i + 5).map(async (id) => {
        try {
          return await cached(`match:${id}`, 60 * 60_000, () =>
            riot<unknown>(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`, key));
        } catch { return null; }
      }));
      details.push(...batch.filter(Boolean));
    }
    return details;
  });
}

async function mastery(region: string, puuid: string, count: number, key: string) {
  return await cached(`mastery:${region}:${puuid}:${count}`, 5 * 60_000, () =>
    riot<unknown[]>(
      `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`,
      key, 'Jugador no encontrado'));
}

function clamp(value: string | null, def: number, max: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'GET') return json(req, { error: 'Método no permitido' }, 405);

  const [action, region, a, b] = routeParts(req, 'riot');
  const key = riotKey();
  if (action === 'health' || !action) {
    return json(req, { status: 'ok', apiKeyConfigured: !!key, timestamp: new Date().toISOString() });
  }
  if (!key) return json(req, { error: UNAVAILABLE, statusCode: 503 }, 503);
  if (!region || !REGIONS[region.toLowerCase()]) return json(req, { error: 'Región no válida', statusCode: 400 }, 400);
  if (!(await allowRequest(`riot:${clientIp(req)}`, 30, 60))) {
    return json(req, { error: 'Demasiadas consultas. Espera un momento.', statusCode: 429 }, 429, { 'Retry-After': '60' });
  }

  const r = region.toLowerCase();
  const query = new URL(req.url).searchParams;
  try {
    switch (action) {
      case 'summoner':
        if (!a || !b) break;
        return json(req, await summoner(r, a, b, key));
      case 'account':
        if (!a || !PUUID.test(a)) break;
        return json(req, await account(r, a, key));
      case 'matches':
        if (!a || !PUUID.test(a)) break;
        {
          // queue: cualquier cola numérica de Riot (opcional). start: paginación para "cargar más".
          const queueParam = query.get('queue');
          const queue = queueParam && /^\d{1,4}$/.test(queueParam) ? Number(queueParam) : undefined;
          const startParam = parseInt(query.get('start') ?? '0', 10);
          const start = Number.isFinite(startParam) && startParam > 0 ? Math.min(startParam, 200) : 0;
          return json(req, await matches(r, a, clamp(query.get('count'), 10, 20), key, queue, start));
        }
      case 'mastery':
        if (!a || !PUUID.test(a)) break;
        return json(req, await mastery(r, a, clamp(query.get('count'), 5, 10), key));
    }
    return json(req, { error: 'Ruta no válida', statusCode: 404 }, 404);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Error al consultar a Riot. Intenta de nuevo más tarde.';
    if (status >= 500) console.error('riot', action, err);
    return json(req, { error: message, statusCode: status }, status);
  }
});

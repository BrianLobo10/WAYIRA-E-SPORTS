// WAYIRA — directo de Twitch y estadísticas sociales (reemplaza /api/twitch/live y /api/social-stats).
//
// GET /social/live    → { live, channel, updatedAt }                 (caché 60 s)
// GET /social/stats   → { discord, twitch, instagram, registeredUsers, twitchLive, updatedAt }  (caché 10 min)
// GET /social/health
//
// Datos públicos. Twitch es opcional: con TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET usa la API oficial;
// sin ellos usa un servicio público para saber si hay directo. Instagram se edita a mano en la portada
// (clave social_stats de site_config). Límite: 60 consultas por minuto por visitante.

import { allowRequest, cached, clientIp, json, preflight, routeParts } from '../_shared/http.ts';

const TWITCH_LOGIN = 'wayiraesports';
const DISCORD_INVITE = (Deno.env.get('DISCORD_INVITE_CODE') ?? 'WZHESnGACq').trim();

function db() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } } : null;
}

async function twitchToken(): Promise<{ clientId: string; token: string } | null> {
  const clientId = Deno.env.get('TWITCH_CLIENT_ID');
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return await cached('twitch:token', 50 * 60_000, async () => {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    if (!res.ok) return null;
    const { access_token } = await res.json();
    return access_token ? { clientId, token: access_token } : null;
  });
}

async function helix<T>(path: string): Promise<T | null> {
  const auth = await twitchToken();
  if (!auth) return null;
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: { 'Client-ID': auth.clientId, Authorization: `Bearer ${auth.token}` },
  });
  return res.ok ? await res.json() as T : null;
}

async function isLive(): Promise<boolean> {
  return await cached('twitch:live', 60_000, async () => {
    const official = await helix<{ data: unknown[] }>(`streams?user_login=${TWITCH_LOGIN}`);
    if (official) return official.data.length > 0;
    try {
      const res = await fetch(`https://decapi.me/twitch/uptime/${TWITCH_LOGIN}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      const text = (await res.text()).trim().toLowerCase();
      return !!text && !text.includes('offline') && !text.includes('[error]');
    } catch {
      return false;
    }
  });
}

async function twitchFollowers(): Promise<number | null> {
  const user = await helix<{ data: { id: string }[] }>(`users?login=${TWITCH_LOGIN}`);
  const id = user?.data?.[0]?.id;
  if (!id) return null;
  const followers = await helix<{ total: number }>(`channels/followers?broadcaster_id=${id}&first=1`);
  return followers?.total ?? null;
}

async function discordMembers(): Promise<number | null> {
  try {
    const res = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE}?with_counts=true`);
    if (!res.ok) return null;
    return (await res.json()).approximate_member_count ?? null;
  } catch {
    return null;
  }
}

async function stats() {
  return await cached('social:stats', 10 * 60_000, async () => {
    const conn = db();
    let stored: Record<string, number | null> = {};
    let registeredUsers: number | null = null;
    if (conn) {
      const [cfg, count] = await Promise.all([
        fetch(`${conn.url}/rest/v1/site_config?key=eq.social_stats&select=value`, { headers: conn.headers }),
        fetch(`${conn.url}/rest/v1/rpc/count_registered_users`, { method: 'POST', headers: conn.headers, body: '{}' }),
      ]);
      if (cfg.ok) stored = (await cfg.json())?.[0]?.value ?? {};
      if (count.ok) registeredUsers = await count.json();
    }
    const [discord, twitch, twitchLive] = await Promise.all([discordMembers(), twitchFollowers(), isLive()]);
    const payload = {
      discord: discord ?? stored.discord ?? null,
      twitch: twitch ?? stored.twitch ?? null,
      instagram: stored.instagram ?? null,
      registeredUsers,
      twitchLive,
      updatedAt: new Date().toISOString(),
    };
    // Guarda los últimos valores conocidos para que la portada tenga respaldo si un servicio falla
    if (conn && (discord != null || twitch != null)) {
      await fetch(`${conn.url}/rest/v1/site_config?on_conflict=key`, {
        method: 'POST',
        headers: { ...conn.headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'social_stats', value: { ...stored, discord: payload.discord, twitch: payload.twitch } }),
      }).catch(() => {});
    }
    return payload;
  });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'GET') return json(req, { error: 'Método no permitido' }, 405);

  const [action] = routeParts(req, 'social');
  if (action === 'health' || !action) {
    return json(req, { status: 'ok', twitchConfigured: !!Deno.env.get('TWITCH_CLIENT_ID'), timestamp: new Date().toISOString() });
  }
  if (!(await allowRequest(`social:${clientIp(req)}`, 60, 60))) {
    return json(req, { error: 'Demasiadas consultas. Espera un momento.' }, 429, { 'Retry-After': '60' });
  }
  try {
    if (action === 'live') {
      return json(req, { live: await isLive(), channel: TWITCH_LOGIN, updatedAt: new Date().toISOString() },
        200, { 'Cache-Control': 'public, max-age=30' });
    }
    if (action === 'stats') return json(req, await stats(), 200, { 'Cache-Control': 'public, max-age=120' });
    return json(req, { error: 'Ruta no válida' }, 404);
  } catch (err) {
    console.error('social', action, err);
    return json(req, { error: 'No se pudieron cargar los datos. Intenta más tarde.' }, 500);
  }
});

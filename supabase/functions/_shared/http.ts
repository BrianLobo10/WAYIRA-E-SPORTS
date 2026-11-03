// Utilidades compartidas por las funciones de WAYIRA (Supabase Edge Functions, Deno).

const ALLOWED_ORIGINS = new Set([
  'http://localhost:4200',
  'https://wayiraesports.com',
  'https://www.wayiraesports.com',
  'https://wayira-e-sports.web.app',
  'https://wayira-e-sports.firebaseapp.com',
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://wayiraesports.com',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req), ...extra },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsHeaders(req) }) : null;
}

/** Ruta relativa a la función: /functions/v1/riot/summoner/... -> ['summoner', ...] */
export function routeParts(req: Request, fnName: string): string[] {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const i = parts.indexOf(fnName);
  return i >= 0 ? parts.slice(i + 1) : parts;
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconocida';
}

// ---------------------------------------------------------------------------
// Caché en memoria (por instancia; corta y suficiente para no repetir llamadas)
// ---------------------------------------------------------------------------
const cache = new Map<string, { data: unknown; expires: number }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await load();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Límite de uso compartido entre instancias (tabla en la base de datos)
// ---------------------------------------------------------------------------
export async function allowRequest(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return true; // sin base de datos (pruebas locales): no limita
  try {
    const res = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) return true; // si el contador falla, no se bloquea a nadie
    return (await res.json()) === true;
  } catch {
    return true;
  }
}

/** Usuario de la sesión (token de Supabase Auth) o null si no hay sesión válida. */
export async function sessionUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anon || token === anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id } : null;
  } catch {
    return null;
  }
}

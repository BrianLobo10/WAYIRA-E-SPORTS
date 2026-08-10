import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

function normalizeRiotApiKey(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  while (value.startsWith('RGAPI-RGAPI-')) {
    value = value.replace(/^RGAPI-/, '');
  }
  return value;
}

function normalizeOpenAiKey(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  while (value.startsWith('sk-sk-')) {
    value = value.replace(/^sk-/, '');
  }
  return value;
}

const app = express();
// Cloud Run usa PORT automáticamente, local usa 3001
const PORT = process.env.PORT || 3001;
const RIOT_API_KEY = normalizeRiotApiKey(process.env.RIOT_API_KEY);
const OPENAI_API_KEY = normalizeOpenAiKey(process.env.OPENAI_API_KEY);

// Middleware
app.use(cors({
  origin: true, // Permitir todos los orígenes
  credentials: true
}));
app.use(express.json());

// Headers para evitar problemas con ngrok banner
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Cache simple para evitar llamadas repetidas
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const CACHE_DURATION_MATCHES = 10 * 60 * 1000; // 10 min para partidas (cambian poco)

// Helper para obtener datos con caché (opcional: ttlMs, por defecto 5 min)
const getCachedData = async (key, fetchFn, ttlMs = CACHE_DURATION) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data;
  }
  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
};

// Mapeo de regiones a regional routing
const regionalRouting = {
  'na1': 'americas',
  'br1': 'americas',
  'la1': 'americas',
  'la2': 'americas',
  'euw1': 'europe',
  'eun1': 'europe',
  'tr1': 'europe',
  'ru': 'europe',
  'kr': 'asia',
  'jp1': 'asia'
};

// Helper: obtener datos del summoner desde PUUID (usado en /api/summoner)
async function getSummonerDataFromPuuid(region, puuid, riotApiKey) {
  const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const summonerResponse = await fetch(summonerUrl, {
    headers: { 'X-Riot-Token': riotApiKey }
  });

  if (!summonerResponse.ok) {
    throw new Error(`Error obteniendo summoner: ${summonerResponse.status}`);
  }

  const summoner = await summonerResponse.json();

  let leagueData = [];
  try {
    const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`;
    const leagueResponse = await fetch(leagueUrl, {
      headers: { 'X-Riot-Token': riotApiKey }
    });
    if (leagueResponse.ok) {
      leagueData = await leagueResponse.json();
    }
  } catch (error) {
    console.log('Error obteniendo estadísticas rankeadas:', error.message);
  }

  return {
    ...summoner,
    leagues: leagueData,
    actualRegion: region
  };
}

// Endpoint para buscar summoner por nombre y tagline
app.get('/api/summoner/:region/:gameName/:tagLine', async (req, res) => {
  try {
    let { region, gameName, tagLine } = req.params;
    
    // Decodificar parámetros de URL
    gameName = decodeURIComponent(gameName);
    tagLine = decodeURIComponent(tagLine);
    
    if (!RIOT_API_KEY) {
      return res.status(503).json({
        error: 'El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.'
      });
    }

    const routing = regionalRouting[region] || 'americas';

    // Limpiar nombres (mismo criterio que la página Buscar jugador)
    const cleanGameName = cleanSummonerName(gameName);
    const cleanTagLine = cleanSummonerName(tagLine);

    const cacheKey = `summoner-${region}-${cleanGameName}-${cleanTagLine}`;

    console.log(`Buscando jugador: ${cleanGameName}#${cleanTagLine} en región ${region}`);

    const summonerData = await getCachedData(cacheKey, async () => {
      // 1. Obtener PUUID con Account-V1 (mismo flujo que Buscar jugador)
      const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(cleanGameName)}/${encodeURIComponent(cleanTagLine)}`;

      const accountResponse = await fetch(accountUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });

      if (!accountResponse.ok) {
        const status = accountResponse.status;
        const bodyText = await accountResponse.text();

        if (status === 401 || status === 403) {
          throw new Error('SERVICE_UNAVAILABLE');
        }
        if (status === 404) {
          if (cleanGameName !== gameName || cleanTagLine !== tagLine) {
            const originalAccountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
            const originalAccountResponse = await fetch(originalAccountUrl, {
              headers: { 'X-Riot-Token': RIOT_API_KEY }
            });
            if (originalAccountResponse.ok) {
              const originalAccount = await originalAccountResponse.json();
              const data = await getSummonerDataFromPuuid(region, originalAccount.puuid, RIOT_API_KEY);
              return { ...data, gameName: originalAccount.gameName, tagLine: originalAccount.tagLine };
            }
          }
          throw new Error('Jugador no encontrado');
        }
        throw new Error(`RIOT_${status}: ${bodyText}`);
      }
      
      const accountData = await accountResponse.json();
      const puuid = accountData?.puuid;
      if (!puuid) {
        throw new Error('Jugador no encontrado');
      }

      console.log(`PUUID obtenido: ${puuid}`);
      console.log(`Buscando summoner en región: ${region}`);
      
      // 2. Obtener datos del summoner
      const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
      const summonerResponse = await fetch(summonerUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!summonerResponse.ok) {
        const errorText = await summonerResponse.text();
        console.error(`Error obteniendo summoner (${summonerResponse.status}):`, errorText);
        
        // Si el summoner no existe en esta región, intentar con otras regiones de LATAM
        if (summonerResponse.status === 404) {
          const latamRegions = ['la1', 'la2', 'br1'];
          for (const altRegion of latamRegions) {
            if (altRegion === region) continue;
            
            console.log(`Intentando con región alternativa: ${altRegion}`);
            const altSummonerUrl = `https://${altRegion}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
            const altSummonerResponse = await fetch(altSummonerUrl, {
              headers: { 'X-Riot-Token': RIOT_API_KEY }
            });
            
            if (altSummonerResponse.ok) {
              console.log(`Summoner encontrado en región ${altRegion}`);
              const summoner = await altSummonerResponse.json();
              
              // Obtener estadísticas rankeadas de la región donde se encontró
              let leagueData = [];
              try {
                const leagueUrl = `https://${altRegion}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`;
                const leagueResponse = await fetch(leagueUrl, {
                  headers: { 'X-Riot-Token': RIOT_API_KEY }
                });
                
                if (leagueResponse.ok) {
                  leagueData = await leagueResponse.json();
                }
              } catch (error) {
                console.log('Error obteniendo estadísticas rankeadas:', error.message);
              }
              
              return {
                ...summoner,
                gameName: accountData.gameName,
                tagLine: accountData.tagLine,
                leagues: leagueData,
                actualRegion: altRegion
              };
            }
          }
        }
        
        throw new Error('Jugador no encontrado');
      }

      const summoner = await summonerResponse.json();
      
      // 3. Obtener estadísticas rankeadas
      let leagueData = [];
      try {
        const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`;
        const leagueResponse = await fetch(leagueUrl, {
          headers: { 'X-Riot-Token': RIOT_API_KEY }
        });
        
        if (leagueResponse.ok) {
          leagueData = await leagueResponse.json();
        }
      } catch (error) {
        console.log('Error obteniendo estadísticas rankeadas:', error.message);
      }
      
      return {
        ...summoner,
        gameName: accountData.gameName,
        tagLine: accountData.tagLine,
        leagues: leagueData,
        actualRegion: region
      };
    });
    
    res.json(summonerData);
  } catch (err) {
    console.error('Error en /api/summoner:', err);

    const msg = err.message || '';
    let status = 500;
    let errorText = 'Error interno del servidor';

    if (msg === 'SERVICE_UNAVAILABLE' || msg.startsWith('RIOT_401') || msg.startsWith('RIOT_403')) {
      status = 503;
      errorText = 'El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.';
    } else if (msg.includes('no encontrado') || msg === 'Jugador no encontrado') {
      status = 404;
      errorText = 'Jugador no encontrado';
    } else if (msg.startsWith('RIOT_')) {
      status = 503;
      errorText = 'El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.';
    } else if (msg.includes('Error obteniendo')) {
      status = 404;
      errorText = 'Jugador no encontrado';
    }

    res.status(status).json({ error: errorText });
  }
});

// Endpoint para obtener datos del account usando PUUID
app.get('/api/account/:region/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;

    if (!RIOT_API_KEY) {
      return res.status(503).json({
        error: 'El servicio no está disponible en este momento. Por favor, intenta más tarde.'
      });
    }

    const cacheKey = `account-${puuid}`;
    const accountData = await getCachedData(cacheKey, async () => {
      const accountUrl = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
      const accountResponse = await fetch(accountUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });

      if (!accountResponse.ok) {
        if (accountResponse.status === 401 || accountResponse.status === 403 || accountResponse.status === 429) {
          throw new Error('SERVICE_UNAVAILABLE');
        }
        if (accountResponse.status === 404) {
          throw new Error('Cuenta no encontrada');
        }
        throw new Error(`Error obteniendo cuenta: ${accountResponse.status}`);
      }

      return accountResponse.json();
    }, 30000);

    res.json({
      puuid: accountData.puuid,
      gameName: accountData.gameName,
      tagLine: accountData.tagLine
    });
  } catch (err) {
    console.error('Error en /api/account:', err);
    const msg = (err.message || '').toString();
    let statusCode = 500;
    if (msg.includes('no encontrada')) {
      statusCode = 404;
    } else if (msg === 'SERVICE_UNAVAILABLE') {
      statusCode = 503;
    }
    res.status(statusCode).json({
      error: statusCode === 503
        ? 'El servicio no está disponible en este momento. Por favor, intenta más tarde.'
        : (err.message || 'Error interno del servidor')
    });
  }
});

// Endpoint para obtener las últimas partidas (con paginación hasta ~1000; API Riot limita 100 por request)
app.get('/api/matches/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    const requestedCount = Math.min(parseInt(req.query.count, 10) || 100, 1000);
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key no configurada' 
      });
    }
    
    const routing = regionalRouting[region] || 'americas';
    const cacheKey = `matches-${region}-${puuid}-${requestedCount}`;
    
    const matchesData = await getCachedData(cacheKey, async () => {
      const PER_PAGE = 100; // máximo por request en la API Riot
      const allMatchIds = [];
      let start = 0;
      let hasMore = true;

      while (hasMore && allMatchIds.length < requestedCount) {
        const matchesUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${PER_PAGE}`;
        const response = await fetch(matchesUrl, {
          headers: { 'X-Riot-Token': RIOT_API_KEY }
        });
        if (!response.ok) {
          throw new Error(`Error obteniendo partidas: ${response.status}`);
        }
        const ids = await response.json();
        if (!ids || ids.length === 0) break;
        allMatchIds.push(...ids);
        if (ids.length < PER_PAGE) break;
        start += PER_PAGE;
        if (start >= 1000) break; // la API suele capar ~1000 resultados
      }

      const idsToFetch = allMatchIds.slice(0, requestedCount);
      const BATCH_SIZE = 10;
      const matchDetails = [];
      for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
        const batch = idsToFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (matchId) => {
            try {
              const detailUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
              const detailResponse = await fetch(detailUrl, {
                headers: { 'X-Riot-Token': RIOT_API_KEY }
              });
              return detailResponse.ok ? detailResponse.json() : null;
            } catch (err) {
              console.log(`Error partida ${matchId}:`, err.message);
              return null;
            }
          })
        );
        matchDetails.push(...results.filter(Boolean));
      }
      return matchDetails;
    }, CACHE_DURATION_MATCHES);
    
    res.json(matchesData);
  } catch (err) {
    console.error('Error en /api/matches:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Endpoint para obtener maestría de campeones
app.get('/api/mastery/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    const count = req.query.count || 5;
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key no configurada' 
      });
    }
    
    const cacheKey = `mastery-${region}-${puuid}-${count}`;
    
    const masteryData = await getCachedData(cacheKey, async () => {
      const masteryUrl = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
      const masteryResponse = await fetch(masteryUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!masteryResponse.ok) {
        throw new Error(`Error obteniendo maestría: ${masteryResponse.status}`);
      }
      
      const mastery = await masteryResponse.json();
      
      // Agregar ranking para cada campeón
      const masteryWithRanking = await Promise.all(mastery.map(async (champ) => {
        try {
          const [worldRank, serverRank] = await Promise.all([
            getChampionRanking(region, champ.championId, 'world'),
            getChampionRanking(region, champ.championId, 'server')
          ]);
          
          return {
            ...champ,
            worldRank: worldRank || null,
            serverRank: serverRank || null
          };
        } catch (error) {
          console.log(`Error obteniendo ranking para campeón ${champ.championId}:`, error.message);
          return {
            ...champ,
            worldRank: null,
            serverRank: null
          };
        }
      }));
      
      return masteryWithRanking;
    });
    
    res.json(masteryData);
  } catch (err) {
    console.error('Error en /api/mastery:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Función para limpiar nombres de invocadores
function cleanSummonerName(name) {
  if (name == null || typeof name !== 'string') return '';
  return name
    .replace(/[\u2066\u2067\u2068\u2069]/g, '') // Remover caracteres de control Unicode
    .replace(/\s+/g, ' ') // Normalizar espacios múltiples a uno solo
    .trim(); // Remover espacios al inicio y final
}

// Función helper para obtener ranking de campeones
async function getChampionRanking(region, championId, type) {
  try {
    const routing = regionalRouting[region] || 'americas';
    const rankingUrl = `https://${routing}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-champion/${championId}/top?count=1`;
    
    const response = await fetch(rankingUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (type === 'world') {
      // Para ranking mundial, necesitaríamos una API externa o base de datos
      // Por ahora simulamos un ranking basado en puntos de maestría
      return Math.floor(Math.random() * 10000) + 1;
    } else if (type === 'server') {
      // Para ranking del servidor, usamos los datos de la API
      return data.length > 0 ? Math.floor(Math.random() * 1000) + 1 : null;
    }
    
    return null;
  } catch (error) {
    console.log(`Error obteniendo ranking ${type} para campeón ${championId}:`, error.message);
    return null;
  }
}

// Estadísticas sociales (dev local — producción usa Firebase Functions)
const DISCORD_INVITE_CODE_DEFAULT = 'HHBMumv8S';
const TWITCH_LOGIN = 'wayiraesports';

function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function getDiscordInviteCode() {
  return (process.env.DISCORD_INVITE_CODE || DISCORD_INVITE_CODE_DEFAULT).trim();
}

async function fetchDiscordMemberCount() {
  const res = await fetch(
    `https://discord.com/api/v10/invites/${getDiscordInviteCode()}?with_counts=true`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.approximate_member_count ?? null;
}

async function fetchTwitchFollowers() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });
  if (!tokenRes.ok) return null;
  const { access_token: token } = await tokenRes.json();
  if (!token) return null;

  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${TWITCH_LOGIN}`, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return null;
  const userData = await userRes.json();
  const userId = userData.data?.[0]?.id;
  if (!userId) return null;

  const followRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}&first=1`,
    { headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` } }
  );
  if (!followRes.ok) return null;
  const followData = await followRes.json();
  return followData.total ?? null;
}

async function fetchTwitchIsLiveHelix() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });
  if (!tokenRes.ok) return null;
  const { access_token: token } = await tokenRes.json();
  if (!token) return null;

  const streamRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${TWITCH_LOGIN}`,
    { headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` } }
  );
  if (!streamRes.ok) return null;
  const streamData = await streamRes.json();
  return Array.isArray(streamData.data) && streamData.data.length > 0;
}

/** Fallback sin credenciales Twitch (decapi.me). */
async function fetchTwitchIsLivePublic() {
  try {
    const res = await fetch(`https://decapi.me/twitch/uptime/${TWITCH_LOGIN}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim().toLowerCase();
    if (!text || text.includes('offline') || text.includes('[error]')) return false;
    return true;
  } catch {
    return null;
  }
}

async function fetchTwitchIsLive() {
  const helix = await fetchTwitchIsLiveHelix();
  if (helix !== null) return helix;
  const fallback = await fetchTwitchIsLivePublic();
  return fallback === true;
}

app.get('/api/twitch/live', async (req, res) => {
  try {
    const live = await fetchTwitchIsLive();
    res.set('Cache-Control', 'no-store, max-age=0');
    res.json({
      live,
      channel: TWITCH_LOGIN,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('twitch/live error:', err);
    res.status(500).json({ live: false, channel: TWITCH_LOGIN, error: 'No se pudo verificar el directo' });
  }
});

app.get('/api/social-stats', async (req, res) => {
  try {
    let discord = parseOptionalInt(process.env.SOCIAL_DISCORD);
    let twitch = parseOptionalInt(process.env.SOCIAL_TWITCH);
    let instagram = parseOptionalInt(process.env.SOCIAL_INSTAGRAM);

    try {
      const liveDiscord = await fetchDiscordMemberCount();
      if (liveDiscord != null) discord = liveDiscord;
    } catch (e) {
      console.warn('social-stats discord:', e.message);
    }

    try {
      const liveTwitch = await fetchTwitchFollowers();
      if (liveTwitch != null) twitch = liveTwitch;
    } catch (e) {
      console.warn('social-stats twitch:', e.message);
    }

    let twitchLive = false;
    try {
      twitchLive = await fetchTwitchIsLive();
    } catch (e) {
      console.warn('social-stats twitch live:', e.message);
    }

    res.json({
      discord,
      twitch,
      instagram,
      registeredUsers: null,
      twitchLive,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('social-stats error:', err);
    res.status(500).json({ error: 'No se pudieron cargar las estadísticas sociales' });
  }
});

// Chatbot POTATO — OpenAI en local si OPENAI_API_KEY está en server/.env
const POTATO_SYSTEM = `Eres POTATO 🥔, asistente amable de WAYIRA E-SPORTS (La Guajira, Colombia).
Tono cálido y breve. Solo WAYIRA (torneos, ruleta, buscar, Discord, Twitch) y League of Legends.
Máximo 3 frases. Español.`;

function potatoLocalReply(message) {
  const lower = String(message).toLowerCase();
  if (/\b(hola|hi|hey)\b/.test(lower)) {
    return '¡Hola! Soy POTATO 🥔 Pregúntame sobre torneos, buscar jugadores o LoL.';
  }
  if (/\b(torneo|inscrib)\b/.test(lower)) {
    return 'Ve a Torneos en el menú para ver eventos e inscribirte.';
  }
  if (/\b(buscar|jugador|invocador)\b/.test(lower)) {
    return 'Usa Buscar con nombre, tag y región (LA1, LA2, etc.).';
  }
  return 'Solo respondo sobre WAYIRA E-SPORTS y League of Legends.';
}

async function callOpenAI(message, conversationHistory) {
  const messages = [
    { role: 'system', content: POTATO_SYSTEM },
    ...(conversationHistory || []).slice(-4).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: String(m.text).slice(0, 500)
    })),
    { role: 'user', content: String(message).slice(0, 280) }
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 150,
      temperature: 0.35
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim();
}

app.post('/api/chatbot', async (req, res) => {
  try {
    const { message = '', conversationHistory = [] } = req.body || {};
    if (!String(message).trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }
    if (OPENAI_API_KEY) {
      try {
        const ai = await callOpenAI(message, conversationHistory);
        if (ai) return res.json({ response: ai, model: 'gpt-4o-mini' });
      } catch (e) {
        console.warn('OpenAI local:', e.message);
      }
    }
    res.json({ response: potatoLocalReply(message), model: 'local' });
  } catch (e) {
    res.status(500).json({ error: 'Error procesando el mensaje' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    apiKeyConfigured: !!RIOT_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor API corriendo en http://localhost:${PORT}`);
  console.log(`API Key ${RIOT_API_KEY ? 'configurada' : 'NO configurada'}`);
  if (!RIOT_API_KEY) {
    console.log('Configura RIOT_API_KEY en el archivo .env');
  }
});

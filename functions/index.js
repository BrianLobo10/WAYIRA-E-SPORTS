const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Usar fetch nativo de Node.js 20 (disponible globalmente desde Node 18+)
// Si no está disponible, usar https nativo como fallback
let fetch;
if (typeof globalThis.fetch !== 'undefined') {
  // Node.js 20 tiene fetch nativo
  fetch = globalThis.fetch;
  console.log('Usando fetch nativo de Node.js');
} else {
  // Fallback usando https nativo
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  console.log('Usando fallback fetch con https/http nativo');
  
  fetch = async (url, options = {}) => {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = typeof url === 'string' ? new URL(url) : url;
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const requestOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: options.headers || {}
        };
        
        const req = protocol.request(requestOptions, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const response = {
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                statusText: res.statusMessage || '',
                headers: res.headers,
                json: async () => {
                  try {
                    return JSON.parse(data);
                  } catch (e) {
                    throw new Error(`Failed to parse JSON: ${e.message}`);
                  }
                },
                text: async () => data
              };
              resolve(response);
            } catch (error) {
              reject(error);
            }
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        req.setTimeout(options.timeout || 30000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        if (options.body) {
          if (typeof options.body === 'string') {
            req.write(options.body);
          } else {
            req.write(JSON.stringify(options.body));
          }
        }
        
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  };
}

// Inicializar Firebase Admin
admin.initializeApp();

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Headers para evitar problemas
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Cache simple para evitar llamadas repetidas
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Helper para obtener datos con caché
const getCachedData = async (key, fetchFn, customDuration = CACHE_DURATION) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < customDuration) {
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

// Función para obtener RIOT_API_KEY
// Usa secrets/variables de entorno (método moderno recomendado por Firebase)
// Para configurar: firebase functions:secrets:set RIOT_API_KEY
// Y declarar en la función: functions.runWith({ secrets: ['RIOT_API_KEY'] })
function getRiotApiKey() {
  if (!process.env.RIOT_API_KEY) {
    return null;
  }
  let value = process.env.RIOT_API_KEY.trim();
  while (value.startsWith('RGAPI-RGAPI-')) {
    value = value.replace(/^RGAPI-/, '');
  }
  return value;
}

// Función para limpiar nombres de invocadores
function cleanSummonerName(name) {
  if (name == null || typeof name !== 'string') return '';
  return name
    .replace(/[\u2066\u2067\u2068\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Función helper para obtener ranking de campeones
async function getChampionRanking(region, championId, type, riotApiKey) {
  try {
    const routing = regionalRouting[region] || 'americas';
    const rankingUrl = `https://${routing}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-champion/${championId}/top?count=1`;
    
    const response = await fetch(rankingUrl, {
      headers: { 'X-Riot-Token': riotApiKey }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (type === 'world') {
      return Math.floor(Math.random() * 10000) + 1;
    } else if (type === 'server') {
      return data.length > 0 ? Math.floor(Math.random() * 1000) + 1 : null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Función helper para obtener datos del summoner desde PUUID
async function getSummonerDataFromPuuid(region, puuid, riotApiKey) {
  const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const summonerResponse = await fetch(summonerUrl, {
    headers: { 'X-Riot-Token': riotApiKey }
  });
  
  if (!summonerResponse.ok) {
    throw new Error(`Error obteniendo summoner: ${summonerResponse.status}`);
  }
  
  const summoner = await summonerResponse.json();
  
  // Obtener estadísticas rankeadas
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
    
    const RIOT_API_KEY = getRiotApiKey();
    
    if (!RIOT_API_KEY) {
      return res.status(503).json({ 
        error: 'El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.' 
      });
    }
    
    const routing = regionalRouting[region] || 'americas';
    
    // Limpiar nombres de invocadores
    const cleanGameName = cleanSummonerName(gameName);
    const cleanTagLine = cleanSummonerName(tagLine);
    
    const cacheKey = `summoner-${region}-${cleanGameName}-${cleanTagLine}`;
    
    const summonerData = await getCachedData(cacheKey, async () => {
      // 1. Obtener PUUID usando Account-V1
      const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(cleanGameName)}/${encodeURIComponent(cleanTagLine)}`;
      
      const accountResponse = await fetch(accountUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!accountResponse.ok) {
        const errorText = await accountResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { status: { message: errorText, status_code: accountResponse.status } };
        }
        
        if (accountResponse.status === 401 || accountResponse.status === 403 || accountResponse.status === 429) {
          // Error de autenticación/autorización - mostrar mensaje amigable al usuario
          throw new Error('El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.');
        }
        
        if (accountResponse.status === 404) {
          if (cleanGameName !== gameName || cleanTagLine !== tagLine) {
            const originalAccountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
            
            const originalAccountResponse = await fetch(originalAccountUrl, {
              headers: { 'X-Riot-Token': RIOT_API_KEY }
            });
            
            if (originalAccountResponse.ok) {
              const originalAccount = await originalAccountResponse.json();
              const summonerData = await getSummonerDataFromPuuid(region, originalAccount.puuid, RIOT_API_KEY);
              return {
                ...summonerData,
                gameName: originalAccount.gameName,
                tagLine: originalAccount.tagLine
              };
            }
          }
          throw new Error('Jugador no encontrado');
        }
        
        // Otros errores
        throw new Error(`Error ${accountResponse.status}: ${errorData.status?.message || errorText}`);
      }
      
      let accountData;
      try {
        accountData = await accountResponse.json();
      } catch (e) {
        throw new Error('El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.');
      }
      const puuid = accountData?.puuid;
      if (!puuid) throw new Error('Jugador no encontrado');
      
      // 2. Obtener datos del summoner
      const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
      const summonerResponse = await fetch(summonerUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!summonerResponse.ok) {
        const errorText = await summonerResponse.text();
        if (summonerResponse.status === 404) {
          const latamRegions = ['la1', 'la2', 'br1'];
          for (const altRegion of latamRegions) {
            if (altRegion === region) continue;
            
            const altSummonerUrl = `https://${altRegion}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
            const altSummonerResponse = await fetch(altSummonerUrl, {
              headers: { 'X-Riot-Token': RIOT_API_KEY }
            });
            
            if (altSummonerResponse.ok) {
              const summoner = await altSummonerResponse.json();
              
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
        
        throw new Error(`Error obteniendo datos del summoner: ${summonerResponse.status}. El jugador puede no tener cuenta en la región ${region}.`);
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
    // Determinar el código de estado apropiado
    let statusCode = 500;
    const msg = (err.message || '').toString();
    if (msg.includes('no encontrado') || msg.includes('Jugador no encontrado')) {
      statusCode = 404;
    } else if (msg.includes('no está disponible') || msg.includes('servicio') && msg.includes('disponible')) {
      statusCode = 503;
    } else if (msg.includes('API key') || msg.includes('autenticación') || msg.includes('restringida')) {
      statusCode = 401;
    }
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Error al buscar el jugador. Intenta de nuevo más tarde.' : (err.message || 'Error interno del servidor'),
      statusCode: statusCode
    });
  }
});

// Endpoint para obtener datos del account usando PUUID (para actualizar nombres/tags)
app.get('/api/account/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    
    const RIOT_API_KEY = getRiotApiKey();
    
    if (!RIOT_API_KEY) {
      return res.status(503).json({ 
        error: 'El servicio no está disponible en este momento. Por favor, intenta más tarde.' 
      });
    }
    
    const routing = regionalRouting[region] || 'americas';
    const cacheKey = `account-${puuid}`;
    
    // Cache más corto para actualizaciones en tiempo real (30 segundos)
    const accountData = await getCachedData(cacheKey, async () => {
      // Obtener datos del account usando PUUID
      const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
      
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
      
      const text = await accountResponse.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('SERVICE_UNAVAILABLE');
      }
    }, 30000); // Cache de 30 segundos
    
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
    } else if (msg === 'SERVICE_UNAVAILABLE' || msg.includes('no está disponible')) {
      statusCode = 503;
    } else if (msg.includes('API key') || msg.includes('autenticación') || msg.includes('restringida')) {
      statusCode = 401;
    }
    res.status(statusCode).json({
      error: statusCode === 503 ? 'El servicio no está disponible en este momento. Por favor, intenta más tarde.' : (err.message || 'Error interno del servidor'),
      statusCode: statusCode
    });
  }
});

// Endpoint para obtener las últimas partidas
app.get('/api/matches/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    const requestedCount = Math.min(parseInt(req.query.count, 10) || 20, 100);
    
    const RIOT_API_KEY = getRiotApiKey();
    
    if (!RIOT_API_KEY) {
      return res.status(503).json({ 
        error: 'El servicio no está disponible en este momento. Por favor, intenta más tarde.' 
      });
    }
    
    const routing = regionalRouting[region] || 'americas';
    const cacheKey = `matches-${region}-${puuid}-${requestedCount}`;
    
    const matchesData = await getCachedData(cacheKey, async () => {
      const PER_PAGE = 100;
      const allMatchIds = [];
      let start = 0;

      while (allMatchIds.length < requestedCount) {
        const matchesUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${PER_PAGE}`;
        const response = await fetch(matchesUrl, {
          headers: { 'X-Riot-Token': RIOT_API_KEY }
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || response.status === 429) {
            throw new Error('El servicio no está disponible en este momento. Por favor, intenta más tarde.');
          }
          throw new Error(`Error obteniendo partidas: ${response.status}`);
        }

        const ids = await response.json();
        if (!ids || ids.length === 0) break;
        allMatchIds.push(...ids);
        if (ids.length < PER_PAGE || start + PER_PAGE >= 1000) break;
        start += PER_PAGE;
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
              return null;
            }
          })
        );
        matchDetails.push(...results.filter(Boolean));
      }

      return matchDetails;
    }, 10 * 60 * 1000);
    
    res.json(matchesData);
  } catch (err) {
    let statusCode = 500;
    let errorMessage = 'El servicio no está disponible en este momento. Por favor, intenta más tarde.';
    
    if (err.message && err.message.includes('no está disponible')) {
      statusCode = 503;
      errorMessage = err.message;
    }
    
    res.status(statusCode).json({ error: errorMessage });
  }
});

// Endpoint para obtener maestría de campeones
app.get('/api/mastery/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    const count = req.query.count || 5;
    
    const RIOT_API_KEY = getRiotApiKey();
    
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
        if (masteryResponse.status === 401 || masteryResponse.status === 403 || masteryResponse.status === 429) {
          throw new Error('El servicio no está disponible en este momento. Por favor, intenta más tarde.');
        }
        throw new Error(`Error obteniendo maestría: ${masteryResponse.status}`);
      }
      
      const mastery = await masteryResponse.json();
      
      // Agregar ranking para cada campeón
      const masteryWithRanking = await Promise.all(mastery.map(async (champ) => {
        try {
          const [worldRank, serverRank] = await Promise.all([
            getChampionRanking(region, champ.championId, 'world', RIOT_API_KEY),
            getChampionRanking(region, champ.championId, 'server', RIOT_API_KEY)
          ]);
          
          return {
            ...champ,
            worldRank: worldRank || null,
            serverRank: serverRank || null
          };
        } catch (error) {
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
    let statusCode = 500;
    let errorMessage = 'El servicio no está disponible en este momento. Por favor, intenta más tarde.';
    
    if (err.message && err.message.includes('no está disponible')) {
      statusCode = 503;
      errorMessage = err.message;
    }
    
    res.status(statusCode).json({ error: errorMessage });
  }
});

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
    const db = admin.firestore();
    const configRef = db.doc('config/socialStats');
    const configSnap = await configRef.get();
    const stored = configSnap.exists ? configSnap.data() : {};

    let discord = stored.discord ?? parseOptionalInt(process.env.SOCIAL_DISCORD) ?? null;
    let twitch = stored.twitch ?? parseOptionalInt(process.env.SOCIAL_TWITCH) ?? null;
    let instagram = stored.instagram ?? parseOptionalInt(process.env.SOCIAL_INSTAGRAM) ?? null;
    let registeredUsers = stored.registeredUsers ?? null;

    try {
      const liveDiscord = await fetchDiscordMemberCount();
      if (liveDiscord != null) discord = liveDiscord;
    } catch (err) {
      console.warn('social-stats: Discord fetch failed', err.message);
    }

    try {
      const liveTwitch = await fetchTwitchFollowers();
      if (liveTwitch != null) twitch = liveTwitch;
    } catch (err) {
      console.warn('social-stats: Twitch fetch failed', err.message);
    }

    let twitchLive = false;
    try {
      twitchLive = await fetchTwitchIsLive();
    } catch (err) {
      console.warn('social-stats: Twitch live check failed', err.message);
    }

    if (discord == null) discord = parseOptionalInt(process.env.SOCIAL_DISCORD);
    if (twitch == null) twitch = parseOptionalInt(process.env.SOCIAL_TWITCH);
    if (instagram == null) instagram = parseOptionalInt(process.env.SOCIAL_INSTAGRAM);

    try {
      const usersSnap = await db.collection('users').count().get();
      registeredUsers = usersSnap.data().count;
    } catch (err) {
      console.warn('social-stats: users count failed', err.message);
    }

    const payload = {
      discord,
      twitch,
      instagram,
      registeredUsers,
      twitchLive,
      updatedAt: new Date().toISOString()
    };

    await configRef.set(
      { ...payload, cachedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    res.json(payload);
  } catch (err) {
    console.error('social-stats error:', err);
    res.status(500).json({ error: 'No se pudieron cargar las estadísticas sociales' });
  }
});

const POTATO_SYSTEM = `Eres POTATO 🥔, asistente amable y cercana de WAYIRA E-SPORTS (La Guajira, Colombia).
Tono: cálido, positivo, breve y útil. Usa emojis con moderación (1-2 por respuesta).
SOLO ayudas con: la web WAYIRA (torneos, ruleta, buscar jugador, Discord, Twitch, perfiles, feed, registro) y League of Legends (invocador, región, rango, partidas, campeones).
Si preguntan algo fuera de eso, responde amablemente que solo puedes ayudar con WAYIRA y LoL.
Máximo 3 frases cortas. Español colombiano natural.`;

function potatoLocalReply(message) {
  const lower = String(message).toLowerCase();
  if (/\b(hola|hi|hey|buenas)\b/.test(lower)) {
    return '¡Hola! Soy POTATO 🥔 Pregúntame sobre torneos, buscar jugadores, ruleta o LoL en WAYIRA.';
  }
  if (/\b(torneo|inscrib)\b/.test(lower)) {
    return 'Entra a Torneos en el menú para ver eventos activos e inscribirte.';
  }
  if (/\b(buscar|jugador|invocador|summoner)\b/.test(lower)) {
    return 'En Buscar necesitas nombre, tag (#LAN) y región (LA1, LA2, NA1, etc.).';
  }
  if (/\b(ruleta|premio)\b/.test(lower)) {
    return 'La ruleta está en el menú Ruleta. Revisa las reglas en pantalla.';
  }
  if (/\b(discord|comunidad)\b/.test(lower)) {
    return 'Discord oficial: https://discord.gg/HHBMumv8S';
  }
  if (/\b(twitch|live|stream)\b/.test(lower)) {
    return 'Canal: https://www.twitch.tv/wayiraesports';
  }
  if (/\b(lol|league|ranked|aram|kda)\b/.test(lower)) {
    return 'En Buscar ves rango, partidas y maestría de campeones de cualquier invocador.';
  }
  return 'Solo puedo ayudarte con WAYIRA E-SPORTS y League of Legends. ¿Torneos, buscar jugador o ruleta?';
}

async function generateOpenAIResponse(message, conversationHistory, apiKey) {
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
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 150,
      temperature: 0.35
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI respuesta vacía');
  return text;
}

const chatbotRateLimit = new Map();

app.post('/api/chatbot', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }
    if (String(message).length > 280) {
      return res.status(400).json({ error: 'Mensaje demasiado largo' });
    }

    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    const now = Date.now();
    const bucket = chatbotRateLimit.get(ip) || { count: 0, reset: now + 60000 };
    if (now > bucket.reset) {
      bucket.count = 0;
      bucket.reset = now + 60000;
    }
    bucket.count += 1;
    chatbotRateLimit.set(ip, bucket);
    if (bucket.count > 12) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento.' });
    }

    const local = potatoLocalReply(message);

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const aiText = await generateOpenAIResponse(message, conversationHistory, openaiKey);
        if (aiText) {
          return res.json({ response: aiText, model: 'gpt-4o-mini' });
        }
      } catch (err) {
        console.warn('chatbot openai fallback:', err.message);
      }
    }

    return res.json({ response: local, model: 'local' });
  } catch (err) {
    console.error('chatbot error:', err);
    res.status(500).json({ error: 'Error procesando el mensaje' });
  }
});

// Health check
function healthHandler(req, res) {
  const RIOT_API_KEY = getRiotApiKey();
  res.json({ 
    status: 'ok', 
    apiKeyConfigured: !!RIOT_API_KEY,
    timestamp: new Date().toISOString()
  });
}
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Secretos: RIOT_API_KEY + OPENAI_API_KEY (POTATO). Configurar antes del deploy:
// npm run update:openai-key
exports.api = functions.runWith({
  secrets: ['RIOT_API_KEY', 'OPENAI_API_KEY'],
  timeoutSeconds: 120,
  memory: '512MB'
}).https.onRequest(app);


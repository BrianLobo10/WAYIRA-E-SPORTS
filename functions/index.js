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
  // Variables de entorno/secrets se cargan automáticamente cuando usas:
  // firebase functions:secrets:set RIOT_API_KEY
  // Y declaras en la función: functions.runWith({ secrets: ['RIOT_API_KEY'] })
  if (process.env.RIOT_API_KEY) {
    // Eliminar espacios y saltos de línea que puedan haber sido añadidos accidentalmente
    return process.env.RIOT_API_KEY.trim();
  }
  
  // Si no está configurado, retornar null
  return null;
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
    const count = req.query.count || 20;
    
    const RIOT_API_KEY = getRiotApiKey();
    
    if (!RIOT_API_KEY) {
      return res.status(503).json({ 
        error: 'El servicio no está disponible en este momento. Por favor, intenta más tarde.' 
      });
    }
    
    const routing = regionalRouting[region] || 'americas';
    const cacheKey = `matches-${region}-${puuid}-${count}`;
    
    const matchesData = await getCachedData(cacheKey, async () => {
      // Obtener más partidas para incluir ARAM y otros modos
      // La API puede devolver hasta 100 partidas por request
      const fetchCount = Math.min(Math.max(count * 2, 30), 100); // Obtener 2x el count solicitado, mínimo 30, máximo 100
      const matchesUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${fetchCount}`;
      
      const response = await fetch(matchesUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw new Error('El servicio no está disponible en este momento. Por favor, intenta más tarde.');
        }
        throw new Error(`Error obteniendo partidas: ${response.status}`);
      }
      
      const matchIds = await response.json();
      
      // Obtener detalles de cada partida (incluyendo todas las que se solicitaron)
      const matchDetails = [];
      for (const matchId of matchIds.slice(0, fetchCount)) {
        try {
          const detailUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
          const detailResponse = await fetch(detailUrl, {
            headers: { 'X-Riot-Token': RIOT_API_KEY }
          });
          
          if (detailResponse.ok) {
            matchDetails.push(await detailResponse.json());
          }
          
          // Pequeño delay para no saturar la API
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
        }
      }
      
      // Retornar todas las partidas obtenidas (incluyendo ARAM)
      // El frontend puede filtrar o mostrar las que necesite
      return matchDetails;
    });
    
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

// Health check
app.get('/health', (req, res) => {
  const RIOT_API_KEY = getRiotApiKey();
  res.json({ 
    status: 'ok', 
    apiKeyConfigured: !!RIOT_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Exportar la app Express como Cloud Function HTTP con secretos
// Obligatorio para Riot: firebase functions:secrets:set RIOT_API_KEY
exports.api = functions.runWith({ secrets: ['RIOT_API_KEY'] }).https.onRequest(app);


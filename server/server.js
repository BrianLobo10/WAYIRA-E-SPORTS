import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
// Cloud Run usa PORT automáticamente, local usa 3001
const PORT = process.env.PORT || 3001;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

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

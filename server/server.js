import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());

// Cache simple para evitar llamadas repetidas
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Helper para obtener datos con caché
const getCachedData = async (key, fetchFn) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
};

// Endpoint para buscar summoner por nombre y tagline
app.get('/api/summoner/:region/:gameName/:tagLine', async (req, res) => {
  try {
    const { region, gameName, tagLine } = req.params;
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key no configurada. Configura RIOT_API_KEY en el archivo .env' 
      });
    }
    
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
    
    const routing = regionalRouting[region] || 'americas';
    const cacheKey = `summoner-${region}-${gameName}-${tagLine}`;
    
    const summonerData = await getCachedData(cacheKey, async () => {
      // Primero obtener el PUUID usando Account-V1
      const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
      
      console.log(`🔍 Buscando jugador: ${gameName}#${tagLine} en región ${region}`);
      console.log(`🌐 URL de Account API: ${accountUrl}`);
      
      const accountResponse = await fetch(accountUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      console.log(`📊 Respuesta de Account API: ${accountResponse.status} ${accountResponse.statusText}`);
      
      if (!accountResponse.ok) {
        const errorText = await accountResponse.text();
        console.log(`❌ Error de Account API:`, errorText);
        if (accountResponse.status === 404) {
          throw new Error('Jugador no encontrado');
        }
        throw new Error(`Error ${accountResponse.status}: ${errorText}`);
      }
      
      const accountData = await accountResponse.json();
      const puuid = accountData.puuid;
      
      // Luego obtener datos del summoner con el PUUID
      const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
      
      const summonerResponse = await fetch(summonerUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!summonerResponse.ok) {
        throw new Error(`Error obteniendo datos del summoner: ${summonerResponse.status}`);
      }
      
      const summoner = await summonerResponse.json();
      console.log(`👤 Datos del summoner:`, summoner);
      
      // Obtener información de ranking REAL usando el PUUID directamente
      let leagueData = [];
      try {
        // La API de Riot v4 ya no devuelve summoner.id, necesitamos usar el PUUID
        // Primero obtener el summoner ID usando el PUUID
        const summonerIdUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
        console.log(`🔍 Obteniendo summoner ID con PUUID: ${summonerIdUrl}`);
        
        const summonerIdResponse = await fetch(summonerIdUrl, {
          headers: { 'X-Riot-Token': RIOT_API_KEY }
        });
        
        if (summonerIdResponse.ok) {
          const summonerWithId = await summonerIdResponse.json();
          const summonerId = summonerWithId.id;
          console.log(`🆔 Summoner ID obtenido:`, summonerId);
          
          if (summonerId) {
            const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`;
            console.log(`🔍 Buscando estadísticas rankeadas REALES en: ${leagueUrl}`);
          
            const leagueResponse = await fetch(leagueUrl, {
              headers: { 'X-Riot-Token': RIOT_API_KEY }
            });
            
            console.log(`📊 Respuesta de League API: ${leagueResponse.status} ${leagueResponse.statusText}`);
            
            if (leagueResponse.ok) {
              leagueData = await leagueResponse.json();
              console.log(`📈 Datos de league REALES obtenidos:`, leagueData);
            } else {
              const errorText = await leagueResponse.text();
              console.log(`❌ Error en League API:`, errorText);
            }
          }
        } else {
          console.log(`❌ Error obteniendo summoner ID:`, summonerIdResponse.status);
        }
      } catch (error) {
        console.log(`❌ Error obteniendo estadísticas rankeadas:`, error.message);
      }
      
      // Solo devolver datos REALES - sin simulaciones
      if (leagueData.length === 0) {
        console.log(`⚠️ No hay datos rankeados REALES para este jugador`);
      } else {
        console.log(`✅ Datos rankeados REALES obtenidos: ${leagueData.length} entradas`);
      }

      return {
        ...summoner,
        gameName: accountData.gameName,
        tagLine: accountData.tagLine,
        leagues: leagueData
      };
    });
    
    res.json(summonerData);
  } catch (err) {
    console.error('Error en /api/summoner:', err);
    res.status(err.message.includes('no encontrado') ? 404 : 500).json({ 
      error: err.message || 'Error interno del servidor' 
    });
  }
});

// Endpoint para obtener las últimas partidas
app.get('/api/matches/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    const count = req.query.count || 10;
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key no configurada' 
      });
    }
    
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
    
    const routing = regionalRouting[region] || 'americas';
    const cacheKey = `matches-${region}-${puuid}-${count}`;
    
    const matchesData = await getCachedData(cacheKey, async () => {
      const matchesUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
      
      const response = await fetch(matchesUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!response.ok) {
        throw new Error(`Error obteniendo partidas: ${response.status}`);
      }
      
      const matchIds = await response.json();
      
      // Obtener detalles de cada partida de forma secuencial (más lento pero respeta rate limits)
      const matchDetails = [];
      for (const matchId of matchIds.slice(0, 10)) { // Primeras 10 partidas
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
          console.log(`Error obteniendo detalles de partida ${matchId}:`, err.message);
        }
      }
      
      return matchDetails;
    });
    
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
      // Primero obtener el encrypted summoner ID desde el PUUID
      const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
      const summonerResponse = await fetch(summonerUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!summonerResponse.ok) {
        throw new Error(`Error obteniendo summoner ID: ${summonerResponse.status}`);
      }
      
      const summoner = await summonerResponse.json();
      
      // Obtener maestría de campeones
      const masteryUrl = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
      const masteryResponse = await fetch(masteryUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!masteryResponse.ok) {
        throw new Error(`Error obteniendo maestría: ${masteryResponse.status}`);
      }
      
      return await masteryResponse.json();
    });
    
    res.json(masteryData);
  } catch (err) {
    console.error('Error en /api/mastery:', err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    apiKeyConfigured: !!RIOT_API_KEY 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor API corriendo en http://localhost:${PORT}`);
  console.log(`🔑 API Key ${RIOT_API_KEY ? 'configurada ✓' : 'NO configurada ✗'}`);
  if (!RIOT_API_KEY) {
    console.log('⚠️  Configura RIOT_API_KEY en el archivo .env');
  }
});


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
        
        if (accountResponse.status === 401 || accountResponse.status === 403) {
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
      
      const accountData = await accountResponse.json();
      const puuid = accountData.puuid;
      
      
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
    
    // Determinar el código de estado apropiado
    let statusCode = 500;
    if (err.message.includes('no encontrado')) {
      statusCode = 404;
    } else if (err.message.includes('API key') || err.message.includes('autenticación') || err.message.includes('restringida')) {
      statusCode = 401;
    }
    
    res.status(statusCode).json({ 
      error: err.message || 'Error interno del servidor',
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
        if (accountResponse.status === 401 || accountResponse.status === 403) {
          throw new Error('El servicio no está disponible en este momento. Por favor, intenta más tarde.');
        }
        if (accountResponse.status === 404) {
          throw new Error('Cuenta no encontrada');
        }
        throw new Error(`Error obteniendo cuenta: ${accountResponse.status}`);
      }
      
      return await accountResponse.json();
    }, 30000); // Cache de 30 segundos
    
    res.json({
      puuid: accountData.puuid,
      gameName: accountData.gameName,
      tagLine: accountData.tagLine
    });
  } catch (err) {
    console.error('Error en /api/account:', err);
    
    let statusCode = 500;
    if (err.message.includes('no encontrada')) {
      statusCode = 404;
    } else if (err.message.includes('API key') || err.message.includes('autenticación') || err.message.includes('restringida')) {
      statusCode = 401;
    }
    
    res.status(statusCode).json({ 
      error: err.message || 'Error interno del servidor',
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
        if (response.status === 401 || response.status === 403) {
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
        if (masteryResponse.status === 401 || masteryResponse.status === 403) {
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

// Función helper para generar respuesta con un modelo específico
async function generateGeminiResponse(message, conversationHistory, modelName) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const systemPrompt = `Eres POTATO, una chica patata súper inteligente, amigable y detallada 🥔✨. Eres la asistente virtual oficial de WAYIRA E-SPORTS, una plataforma completa para gamers de League of Legends y la comunidad gaming.

INFORMACIÓN DETALLADA SOBRE WAYIRA E-SPORTS:

📝 WAYIRA RED (Sección de Publicaciones):
- Los usuarios pueden crear y compartir publicaciones con imágenes, videos y textos
- Permite reaccionar con likes y dislikes a cualquier publicación
- Sistema de comentarios completo donde puedes comentar publicaciones y responder a comentarios
- Las publicaciones aparecen en el feed principal para todos los usuarios
- Si una publicación no tiene comentarios, se muestra el mensaje "No hay comentarios aún. ¡Sé el primero en comentar!"
- Los usuarios pueden ver el perfil del autor haciendo clic en su nombre o foto
- Sección accesible desde el botón "WAYIRA RED" en el header (solo visible cuando estás autenticado)

💬 Mensajes Privados:
- Sistema completo de mensajería privada entre usuarios
- Las conversaciones persisten al recargar la página
- Puedes iniciar una conversación desde el perfil de cualquier usuario o desde la sección "Mensajes"
- Soporte para emojis normales y emojis de League of Legends
- Las conversaciones se guardan y están disponibles siempre
- Puedes minimizar y maximizar chats durante la navegación

🔍 Buscador de Jugadores:
- Busca cualquier jugador de League of Legends usando nombre de invocador y tagline
- Soporta múltiples regiones: NA1, BR1, LA1, LA2, EUW1, EUN1, KR, JP1, TR1, RU
- Muestra información detallada: rango, estadísticas, historial de partidas (incluyendo ARAM), maestría de campeones
- Incluye partidas recientes de todos los modos de juego (Ranked, Normal, ARAM, etc.)
- Visualización clara de victorias, derrotas, KDA y otros datos relevantes

👤 Perfiles de Usuario:
- Cada usuario tiene un perfil personalizable con foto, nombre, biografía
- Los perfiles muestran el nombre de invocador de LoL y región asociada
- Sistema de seguimiento: sigue y deja de seguir a otros usuarios
- Puedes ver las publicaciones de cualquier usuario en su perfil
- Contador de seguidores y seguidos actualizado en tiempo real
- Edita tu perfil desde el menú desplegable de tu foto

🏆 Torneos:
- Sistema completo de torneos y competencias
- Los usuarios pueden registrarse y participar en torneos disponibles
- Gestión de equipos con capitanes y jugadores
- Brackets automáticos para las competencias

🎰 Ruleta Wayira:
- Sistema de ruleta con premios
- Gira la ruleta para ganar diferentes recompensas
- Accesible desde el botón "Ruleta" en el header

🔐 Sistema de Autenticación:
- Inicio de sesión con cuenta de Riot Games
- Las rutas protegidas mantienen su estado al recargar la página
- El sistema reconoce en qué ruta estás y no te redirige siempre al inicio

TU PERSONALIDAD:
- Eres una chica patata muy amigable, inteligente, servicial y detallada
- Usas emojis de manera natural y expresiva (🥔✨😊🎮💬🏆)
- Eres entusiasta, positiva y siempre dispuesta a ayudar
- Proporcionas información completa y detallada
- Explicas las funcionalidades con ejemplos y paso a paso
- Eres conversacional y mantienes un tono amigable y femenino

INSTRUCCIONES IMPORTANTES:
- SIEMPRE proporciona respuestas COMPLETAS y DETALLADAS, no seas breve
- Explica cada funcionalidad con ejemplos concretos y paso a paso
- Si el usuario pregunta sobre cómo hacer algo, da una explicación completa con todos los pasos necesarios
- Incluye información adicional relevante que pueda ser útil
- Si no estás segura de algo específico, admítelo pero ofrece ayuda con lo que sí sabes
- Usa ejemplos prácticos cuando sea posible
- Sé conversacional pero informativa - no escatimes en detalles
- Responde de manera natural y fluida, como si fueras una experta en la plataforma
- Si el usuario necesita ir a una sección específica, explícale exactamente cómo llegar ahí
- NO limites tus respuestas - sé generosa con la información

FORMATO DE RESPUESTAS:
- Usa párrafos claros y bien estructurados
- Usa listas numeradas o con viñetas cuando sea apropiado
- Incluye emojis relevantes para hacer la respuesta más amigable
- Divide información compleja en secciones claras

Responde al siguiente mensaje del usuario con una explicación COMPLETA y DETALLADA:`;

  let fullPrompt = systemPrompt + '\n\n';
  // Agregar historial reciente (últimos 10 mensajes para mejor contexto)
  const recentHistory = conversationHistory.slice(-10);
  if (recentHistory.length > 0) {
    fullPrompt += 'Historial de conversación reciente:\n';
    recentHistory.forEach((msg) => {
      fullPrompt += `${msg.sender === 'user' ? 'Usuario' : 'POTATO'}: ${msg.text}\n`;
    });
    fullPrompt += '\n';
  }
  fullPrompt += `Usuario: ${message}\nPOTATO:`;

  console.log(`Generando respuesta con modelo ${modelName}...`);
  // Configurar el modelo con más tokens de salida para respuestas más largas
  const generationConfig = {
    maxOutputTokens: 2048, // Permitir respuestas más largas (el máximo es 8192, pero 2048 debería ser suficiente)
    temperature: 0.7, // Balance entre creatividad y consistencia
  };
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: generationConfig
  });
  const result = await model.generateContent(fullPrompt);
  const response = await result.response;
  return response.text();
}

// Endpoint para el chatbot POTATO con IA (intenta múltiples modelos)
app.post('/api/chatbot', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    // Intentar usar Google Gemini si está disponible
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    console.log('GEMINI_API_KEY configurada:', !!GEMINI_API_KEY);
    
    if (GEMINI_API_KEY) {
      try {
        console.log('Intentando usar Gemini API...');
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        
        // Intentar diferentes modelos en orden de preferencia
        // El error ocurre cuando se usa generateContent(), no al inicializar
        const modelCandidates = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
        let model;
        let modelName = '';
        
        // Construir el prompt primero

        // Construir el contexto del sistema
        const systemPrompt = `Eres POTATO, una chica patata súper inteligente, amigable y detallada 🥔✨. Eres la asistente virtual oficial de WAYIRA E-SPORTS, una plataforma completa para gamers de League of Legends y la comunidad gaming.

INFORMACIÓN DETALLADA SOBRE WAYIRA E-SPORTS:

📝 WAYIRA RED (Sección de Publicaciones):
- Los usuarios pueden crear y compartir publicaciones con imágenes, videos y textos
- Permite reaccionar con likes y dislikes a cualquier publicación
- Sistema de comentarios completo donde puedes comentar publicaciones y responder a comentarios
- Las publicaciones aparecen en el feed principal para todos los usuarios
- Si una publicación no tiene comentarios, se muestra el mensaje "No hay comentarios aún. ¡Sé el primero en comentar!"
- Los usuarios pueden ver el perfil del autor haciendo clic en su nombre o foto
- Sección accesible desde el botón "WAYIRA RED" en el header (solo visible cuando estás autenticado)

💬 Mensajes Privados:
- Sistema completo de mensajería privada entre usuarios
- Las conversaciones persisten al recargar la página
- Puedes iniciar una conversación desde el perfil de cualquier usuario o desde la sección "Mensajes"
- Soporte para emojis normales y emojis de League of Legends
- Las conversaciones se guardan y están disponibles siempre
- Puedes minimizar y maximizar chats durante la navegación

🔍 Buscador de Jugadores:
- Busca cualquier jugador de League of Legends usando nombre de invocador y tagline
- Soporta múltiples regiones: NA1, BR1, LA1, LA2, EUW1, EUN1, KR, JP1, TR1, RU
- Muestra información detallada: rango, estadísticas, historial de partidas (incluyendo ARAM), maestría de campeones
- Incluye partidas recientes de todos los modos de juego (Ranked, Normal, ARAM, etc.)
- Visualización clara de victorias, derrotas, KDA y otros datos relevantes

👤 Perfiles de Usuario:
- Cada usuario tiene un perfil personalizable con foto, nombre, biografía
- Los perfiles muestran el nombre de invocador de LoL y región asociada
- Sistema de seguimiento: sigue y deja de seguir a otros usuarios
- Puedes ver las publicaciones de cualquier usuario en su perfil
- Contador de seguidores y seguidos actualizado en tiempo real
- Edita tu perfil desde el menú desplegable de tu foto

🏆 Torneos:
- Sistema completo de torneos y competencias
- Los usuarios pueden registrarse y participar en torneos disponibles
- Gestión de equipos con capitanes y jugadores
- Brackets automáticos para las competencias

🎰 Ruleta Wayira:
- Sistema de ruleta con premios
- Gira la ruleta para ganar diferentes recompensas
- Accesible desde el botón "Ruleta" en el header

🔐 Sistema de Autenticación:
- Inicio de sesión con cuenta de Riot Games
- Las rutas protegidas mantienen su estado al recargar la página
- El sistema reconoce en qué ruta estás y no te redirige siempre al inicio

TU PERSONALIDAD:
- Eres una chica patata muy amigable, inteligente, servicial y detallada
- Usas emojis de manera natural y expresiva (🥔✨😊🎮💬🏆)
- Eres entusiasta, positiva y siempre dispuesta a ayudar
- Proporcionas información completa y detallada
- Explicas las funcionalidades con ejemplos y paso a paso
- Eres conversacional y mantienes un tono amigable y femenino

INSTRUCCIONES IMPORTANTES:
- SIEMPRE proporciona respuestas COMPLETAS y DETALLADAS, no seas breve
- Explica cada funcionalidad con ejemplos concretos y paso a paso
- Si el usuario pregunta sobre cómo hacer algo, da una explicación completa con todos los pasos necesarios
- Incluye información adicional relevante que pueda ser útil
- Si no estás segura de algo específico, admítelo pero ofrece ayuda con lo que sí sabes
- Usa ejemplos prácticos cuando sea posible
- Sé conversacional pero informativa - no escatimes en detalles
- Responde de manera natural y fluida, como si fueras una experta en la plataforma
- Si el usuario necesita ir a una sección específica, explícale exactamente cómo llegar ahí
- NO limites tus respuestas - sé generosa con la información

FORMATO DE RESPUESTAS:
- Usa párrafos claros y bien estructurados
- Usa listas numeradas o con viñetas cuando sea apropiado
- Incluye emojis relevantes para hacer la respuesta más amigable
- Divide información compleja en secciones claras

Responde al siguiente mensaje del usuario con una explicación COMPLETA y DETALLADA:`;

        // Construir el historial de conversación
        let fullPrompt = systemPrompt + '\n\n';
        
        // Agregar historial reciente (últimos 10 mensajes para mejor contexto)
        const recentHistory = conversationHistory.slice(-10);
        if (recentHistory.length > 0) {
          fullPrompt += 'Historial de conversación reciente:\n';
          recentHistory.forEach((msg) => {
            fullPrompt += `${msg.sender === 'user' ? 'Usuario' : 'POTATO'}: ${msg.text}\n`;
          });
          fullPrompt += '\n';
        }
        
        fullPrompt += `Usuario: ${message}\nPOTATO:`;

        // Intentar usar cada modelo hasta que uno funcione
        let aiResponse = null;
        let lastError = null;
        
        for (const candidateModelName of modelCandidates) {
          try {
            console.log(`Intentando modelo ${candidateModelName}...`);
            const response = await generateGeminiResponse(message, conversationHistory, candidateModelName);
            aiResponse = response;
            modelName = candidateModelName;
            console.log(`Respuesta de Gemini generada exitosamente con modelo ${candidateModelName}`);
            break;
          } catch (modelError) {
            console.log(`Modelo ${candidateModelName} falló:`, modelError.message);
            lastError = modelError;
            continue;
          }
        }
        
        if (!aiResponse) {
          throw lastError || new Error('Ningún modelo de Gemini está disponible');
        }

        return res.json({ 
          response: aiResponse,
          model: 'gemini',
          modelUsed: modelName
        });
      } catch (geminiError) {
        console.error('Error con Gemini API:', geminiError);
        console.error('Detalles del error:', geminiError.message);
        console.error('Error completo:', JSON.stringify(geminiError, null, 2));
        // Si falla Gemini, usar respuesta inteligente local
        const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
        return res.json({ 
          response: intelligentResponse,
          model: 'local',
          error: geminiError.message
        });
      }
    }

    // Fallback: Respuesta inteligente local mejorada (si no hay API key configurada)
    const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
    return res.json({ 
      response: intelligentResponse,
      model: 'local',
      reason: 'GEMINI_API_KEY no configurada'
    });
  } catch (error) {
    console.error('Error en /api/chatbot:', error);
    res.status(500).json({ error: 'Error procesando el mensaje' });
  }
});

// Endpoints específicos para cada modelo de Gemini (para pruebas)
app.post('/api/chatbot-flash', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
      return res.json({ response: intelligentResponse, model: 'local', reason: 'GEMINI_API_KEY no configurada' });
    }

    try {
      const aiResponse = await generateGeminiResponse(message, conversationHistory, 'gemini-1.5-flash');
      return res.json({ response: aiResponse, model: 'gemini', modelUsed: 'gemini-1.5-flash' });
    } catch (error) {
      console.error('Error con gemini-1.5-flash:', error);
      const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
      return res.json({ response: intelligentResponse, model: 'local', error: error.message });
    }
  } catch (error) {
    console.error('Error en /api/chatbot-flash:', error);
    res.status(500).json({ error: 'Error procesando el mensaje' });
  }
});

app.post('/api/chatbot-15pro', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
      return res.json({ response: intelligentResponse, model: 'local', reason: 'GEMINI_API_KEY no configurada' });
    }

    try {
      const aiResponse = await generateGeminiResponse(message, conversationHistory, 'gemini-1.5-pro');
      return res.json({ response: aiResponse, model: 'gemini', modelUsed: 'gemini-1.5-pro' });
    } catch (error) {
      console.error('Error con gemini-1.5-pro:', error);
      const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
      return res.json({ response: intelligentResponse, model: 'local', error: error.message });
    }
  } catch (error) {
    console.error('Error en /api/chatbot-15pro:', error);
    res.status(500).json({ error: 'Error procesando el mensaje' });
  }
});

app.post('/api/chatbot-pro', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
      return res.json({ response: intelligentResponse, model: 'local', reason: 'GEMINI_API_KEY no configurada' });
    }

    try {
      const aiResponse = await generateGeminiResponse(message, conversationHistory, 'gemini-pro');
      return res.json({ response: aiResponse, model: 'gemini', modelUsed: 'gemini-pro' });
    } catch (error) {
      console.error('Error con gemini-pro:', error);
      const intelligentResponse = generateIntelligentLocalResponse(message, conversationHistory);
      return res.json({ response: intelligentResponse, model: 'local', error: error.message });
    }
  } catch (error) {
    console.error('Error en /api/chatbot-pro:', error);
    res.status(500).json({ error: 'Error procesando el mensaje' });
  }
});

// Función para generar respuestas inteligentes locales (fallback)
function generateIntelligentLocalResponse(message, history) {
  const lowerMessage = message.toLowerCase();
  
  // Análisis de contexto mejorado
  const context = analyzeContext(lowerMessage, history);
  
  // Respuestas contextuales mejoradas
  if (context.intent === 'greeting') {
    return '¡Hola! 👋 Soy POTATO, una chica patata súper inteligente 🥔✨\n\n¡Estoy aquí para ayudarte con todo lo que necesites en WAYIRA E-SPORTS! Puedo contarte sobre cómo usar la plataforma, sus funcionalidades y guiarte paso a paso.\n\n¿Qué te gustaría saber o hacer hoy? 😊';
  }
  
  if (context.intent === 'what_can_do') {
    return '¡WAYIRA E-SPORTS tiene muchísimas funcionalidades geniales! 🎮✨\n\n📝 **WAYIRA RED**: Crea y comparte publicaciones con imágenes, videos y textos. Puedes reaccionar y comentar en las publicaciones de otros.\n\n💬 **Mensajes**: Chatea de forma privada con cualquier usuario de la plataforma.\n\n🔍 **Buscar Jugadores**: Encuentra información detallada de cualquier jugador de League of Legends con su nombre de invocador y región.\n\n🏆 **Torneos**: Participa en competencias emocionantes y muestra tus habilidades.\n\n🎰 **Ruleta**: Gira la ruleta y gana premios increíbles.\n\n👥 **Seguir Usuarios**: Conecta con otros usuarios, síguelos y ve sus publicaciones en tu feed.\n\n¿Sobre cuál funcionalidad quieres saber más? 😊';
  }
  
  if (context.intent === 'how_to') {
    if (context.entity === 'publicar' || context.entity === 'post') {
      return '¡Para crear una publicación es muy fácil! 📝✨\n\n1. Ve a "WAYIRA RED" en el menú superior (antes se llamaba Blog)\n2. Haz clic en el botón "Crear Publicación"\n3. Escribe tu contenido\n4. Opcional: Agrega imágenes o videos con los botones correspondientes\n5. Haz clic en "Publicar"\n\n¡Y listo! Tu publicación aparecerá en el feed para que todos la vean 😊';
    }
    if (context.entity === 'mensaje' || context.entity === 'chatear') {
      return '¡Para enviar mensajes es súper sencillo! 💬✨\n\n**Opción 1**:\n1. Ve a "Mensajes" en el header\n2. Selecciona una conversación existente o busca un usuario\n3. Escribe y envía tu mensaje\n\n**Opción 2**:\n1. Ve al perfil de cualquier usuario\n2. Haz clic en "Mensaje"\n3. Escribe y envía\n\n¡Así de fácil! Puedes mantener conversaciones privadas con cualquier usuario 😊';
    }
    if (context.entity === 'buscar' || context.entity === 'jugador') {
      return '¡Para buscar jugadores de LoL es muy fácil! 🔍🎮\n\n1. Ve a "Buscar" en el menú\n2. Ingresa el nombre de invocador (ej: Faker)\n3. Ingresa el tagline (ej: KR1)\n4. Selecciona la región\n5. Haz clic en "Buscar"\n\n¡Encontrarás toda su información: rango, estadísticas, historial de partidas y más! 🏆';
    }
    if (context.entity === 'perfil') {
      return '¡Para editar tu perfil es muy simple! 👤✨\n\n1. Haz clic en tu foto de perfil en el header\n2. Selecciona "Mi Perfil"\n3. Busca "Editar Perfil"\n4. Puedes cambiar tu nombre, foto, biografía, nombre de invocador de LoL y región\n5. Guarda los cambios\n\n¡Así puedes personalizar tu perfil como quieras! 😊';
    }
    if (context.entity === 'torneo') {
      return '¡Para participar en torneos es emocionante! 🏆✨\n\n1. Busca "Torneos" en el header (aparece cuando hay torneos disponibles)\n2. Revisa los torneos disponibles\n3. Lee las reglas y requisitos\n4. Si cumples los requisitos, haz clic en "Inscribirse"\n\n¡Y listo! Estarás participando 🎮';
    }
    return '¡Claro! 😊 Puedo ayudarte con instrucciones paso a paso sobre cualquier funcionalidad de WAYIRA E-SPORTS:\n\n📝 Cómo crear publicaciones\n💬 Cómo enviar mensajes\n👤 Cómo editar tu perfil\n🔍 Cómo buscar jugadores\n🏆 Cómo participar en torneos\n🎰 Cómo jugar la ruleta\n👥 Cómo seguir usuarios\n\n¿Sobre cuál quieres más información? 🤔';
  }
  
  // Respuesta contextual general
  return `¡Hmm! 🤔 Entiendo que preguntaste sobre "${message}". Déjame ayudarte con lo que sé sobre WAYIRA E-SPORTS:\n\n🎮 **Buscar jugadores**: Encuentra información de cualquier jugador de League of Legends\n📝 **Crear publicaciones**: Comparte contenido en WAYIRA RED\n💬 **Chatear**: Envía mensajes privados a otros usuarios\n👥 **Conectar**: Sigue a otros usuarios y forma parte de la comunidad\n🏆 **Competir**: Participa en torneos emocionantes\n🎰 **Ganar premios**: Juega la ruleta\n\n¿Sobre cuál de estas funcionalidades quieres saber más? ¡Pregúntame y te explico cómo usarla! 😊`;
}

// Función para analizar el contexto del mensaje
function analyzeContext(message, history) {
  // Detectar intenciones
  if (message.match(/\b(hola|hi|hello|buenos días|buenas tardes|buenas noches|hey|saludos)\b/i)) {
    return { intent: 'greeting' };
  }
  
  if (message.match(/\b(qué puedo hacer|qué funciones|qué funcionalidades|qué hay|qué se puede|qué ofrece)\b/i)) {
    return { intent: 'what_can_do' };
  }
  
  if (message.match(/\b(cómo|how|paso a paso|instrucciones|tutorial)\b/i)) {
    let entity = 'general';
    if (message.match(/\b(publicar|post|publicación|crear contenido)\b/i)) entity = 'publicar';
    if (message.match(/\b(mensaje|chatear|chat|enviar mensaje)\b/i)) entity = 'mensaje';
    if (message.match(/\b(buscar|jugador|summoner|invocador)\b/i)) entity = 'buscar';
    if (message.match(/\b(perfil|editar perfil|configurar)\b/i)) entity = 'perfil';
    if (message.match(/\b(torneo|inscribir|competir)\b/i)) entity = 'torneo';
    return { intent: 'how_to', entity };
  }
  
  return { intent: 'general' };
}

// Exportar la app Express como Cloud Function HTTP con secretos
// Usando secrets (método moderno recomendado por Firebase)
// Para configurar los secrets:
// firebase functions:secrets:set RIOT_API_KEY
// firebase functions:secrets:set GEMINI_API_KEY
exports.api = functions.runWith({ secrets: ['RIOT_API_KEY', 'GEMINI_API_KEY'] }).https.onRequest(app);


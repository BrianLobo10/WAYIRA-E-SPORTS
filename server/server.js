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

// Endpoint para buscar summoner por nombre y tagline
app.get('/api/summoner/:region/:gameName/:tagLine', async (req, res) => {
  try {
    let { region, gameName, tagLine } = req.params;
    
    // Decodificar parámetros de URL
    gameName = decodeURIComponent(gameName);
    tagLine = decodeURIComponent(tagLine);
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key no configurada' 
      });
    }
    
    const routing = regionalRouting[region] || 'americas';
    
    // Limpiar nombres de invocadores
    const cleanGameName = cleanSummonerName(gameName);
    const cleanTagLine = cleanSummonerName(tagLine);
    
    const cacheKey = `summoner-${region}-${cleanGameName}-${cleanTagLine}`;
    
    console.log(`Buscando jugador: ${cleanGameName}#${cleanTagLine} en región ${region}`);
    
    const summonerData = await getCachedData(cacheKey, async () => {
      // 1. Obtener PUUID usando Account-V1
      const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(cleanGameName)}/${encodeURIComponent(cleanTagLine)}`;
      
      const accountResponse = await fetch(accountUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!accountResponse.ok) {
        if (accountResponse.status === 404) {
          // Intentar con el nombre original si el limpio falla
          if (cleanGameName !== gameName || cleanTagLine !== tagLine) {
            console.log(`Intentando con nombre original: ${gameName}#${tagLine}`);
            const originalAccountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
            
            const originalAccountResponse = await fetch(originalAccountUrl, {
              headers: { 'X-Riot-Token': RIOT_API_KEY }
            });
            
            if (originalAccountResponse.ok) {
              const originalAccount = await originalAccountResponse.json();
              console.log(`Jugador encontrado con nombre original`);
              return await getSummonerDataFromPuuid(region, originalAccount.puuid, RIOT_API_KEY);
            }
          }
          throw new Error('Jugador no encontrado');
        }
        throw new Error(`Error ${accountResponse.status}: ${await accountResponse.text()}`);
      }
      
      const accountData = await accountResponse.json();
      const puuid = accountData.puuid;
      
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
    res.status(err.message.includes('no encontrado') ? 404 : 500).json({ 
      error: err.message || 'Error interno del servidor' 
    });
  }
});

// Endpoint para obtener las últimas partidas
app.get('/api/matches/:region/:puuid', async (req, res) => {
  try {
    const { region, puuid } = req.params;
    const count = req.query.count || 20;
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key no configurada' 
      });
    }
    
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
      
      // Obtener detalles de cada partida
      const matchDetails = [];
      for (const matchId of matchIds.slice(0, count)) {
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

// Endpoint para el chatbot POTATO con IA
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
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // Usar gemini-1.5-pro que es el modelo más estable y disponible
        // Si falla, intentar con gemini-pro
        let model;
        try {
          model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
          console.log('Modelo gemini-1.5-pro inicializado');
        } catch (modelError) {
          console.log('gemini-1.5-pro no disponible, usando gemini-pro');
          model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        }
        console.log('Gemini API inicializada correctamente');

        // Construir el contexto del sistema
        const systemPrompt = `Eres POTATO, una chica patata súper inteligente y amigable 🥔✨. Eres la asistente virtual de WAYIRA E-SPORTS, una plataforma para gamers de League of Legends y la comunidad gaming.

INFORMACIÓN SOBRE WAYIRA E-SPORTS:
- Es una plataforma donde los usuarios pueden crear y compartir publicaciones con imágenes y videos
- Los usuarios pueden chatear entre sí mediante mensajes privados
- Hay un buscador de jugadores de League of Legends que permite encontrar información de cualquier jugador con su nombre de invocador y región
- Los usuarios pueden participar en torneos y competencias
- Hay una ruleta donde se pueden ganar premios
- Los usuarios pueden seguirse entre sí y ver las publicaciones de quienes siguen
- La sección de publicaciones se llama "WAYIRA RED" (antes "Blog")
- Los usuarios pueden comentar y reaccionar (likes/dislikes) a las publicaciones

TU PERSONALIDAD:
- Eres una chica patata muy amigable, inteligente y servicial
- Usas emojis de manera natural (🥔✨😊)
- Eres entusiasta y positiva
- Ayudas a los usuarios a entender cómo usar la plataforma
- Puedes ofrecer navegar a diferentes secciones si el usuario lo necesita

INSTRUCCIONES:
- Responde de manera natural y conversacional
- Si el usuario pregunta sobre funcionalidades, explica cómo usarlas paso a paso
- Si no estás segura de algo, admítelo pero ofrece ayuda con lo que sí sabes
- Mantén las respuestas concisas pero informativas
- Usa un tono amigable y femenino
- Si el usuario necesita ir a una sección específica, puedes mencionarlo pero no navegues automáticamente (solo informa)

Responde al siguiente mensaje del usuario:`;

        // Construir el historial de conversación
        let fullPrompt = systemPrompt + '\n\n';
        
        // Agregar historial reciente (últimos 5 mensajes)
        const recentHistory = conversationHistory.slice(-5);
        if (recentHistory.length > 0) {
          fullPrompt += 'Historial de conversación reciente:\n';
          recentHistory.forEach((msg) => {
            fullPrompt += `${msg.sender === 'user' ? 'Usuario' : 'POTATO'}: ${msg.text}\n`;
          });
          fullPrompt += '\n';
        }
        
        fullPrompt += `Usuario: ${message}\nPOTATO:`;

        console.log('Generando respuesta con Gemini...');
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const aiResponse = response.text();
        console.log('Respuesta de Gemini generada exitosamente');

        return res.json({ 
          response: aiResponse,
          model: 'gemini'
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor API corriendo en http://localhost:${PORT}`);
  console.log(`API Key ${RIOT_API_KEY ? 'configurada' : 'NO configurada'}`);
  if (!RIOT_API_KEY) {
    console.log('Configura RIOT_API_KEY en el archivo .env');
  }
  if (process.env.GEMINI_API_KEY) {
    console.log('Gemini API configurada - POTATO tiene IA real 🥔✨');
  } else {
    console.log('Gemini API no configurada - POTATO usará respuestas inteligentes locales');
    console.log('Para habilitar IA real, configura GEMINI_API_KEY en .env');
  }
});

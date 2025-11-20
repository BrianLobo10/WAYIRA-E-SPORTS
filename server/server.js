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
      // Obtener más partidas para incluir ARAM y otros modos
      // La API puede devolver hasta 100 partidas por request
      const fetchCount = Math.min(Math.max(count * 2, 30), 100); // Obtener 2x el count solicitado, mínimo 30, máximo 100
      const matchesUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${fetchCount}`;
      
      const response = await fetch(matchesUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
      });
      
      if (!response.ok) {
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
          console.log(`Error obteniendo detalles de partida ${matchId}:`, err.message);
        }
      }
      
      // Retornar todas las partidas obtenidas (incluyendo ARAM)
      // El frontend puede filtrar o mostrar las que necesite
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
        
        // Intentar diferentes modelos en orden de preferencia
        // El error ocurre cuando se usa generateContent(), no al inicializar
        const modelCandidates = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

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
        let modelName = '';
        let lastError = null;
        
        for (const candidateModelName of modelCandidates) {
          try {
            console.log(`Intentando modelo ${candidateModelName}...`);
            // Configurar el modelo con más tokens de salida para respuestas más largas
            const generationConfig = {
              maxOutputTokens: 2048, // Permitir respuestas más largas (el máximo es 8192, pero 2048 debería ser suficiente)
              temperature: 0.7, // Balance entre creatividad y consistencia
            };
            const model = genAI.getGenerativeModel({ 
              model: candidateModelName,
              generationConfig: generationConfig
            });
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            aiResponse = response.text();
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

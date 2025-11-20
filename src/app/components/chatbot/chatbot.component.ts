import { Component, signal, inject, OnInit, ViewChild, ElementRef, AfterViewChecked, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FirebaseService } from '../../services/firebase.service';

interface ChatMessage {
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  expanded?: boolean; // Para controlar si el mensaje está expandido
  isLong?: boolean; // Para detectar mensajes largos que necesitan expandirse
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatMessages') chatMessages!: ElementRef;
  @ViewChild('chatInput') chatInput!: ElementRef;
  
  // Inputs para configurar el chatbot
  @Input() apiEndpoint: string = '/api/chatbot';
  @Input() modelName: string = 'Auto';
  @Input() chatbotId: string = 'default'; // Para identificar cada instancia
  @Input() position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center' = 'bottom-right';
  @Input() showInTestMode: boolean = false; // Si es true, se muestra en modo prueba

  private router = inject(Router);
  private firebaseService = inject(FirebaseService);
  private http = inject(HttpClient);

  isOpen = signal(false);
  messages = signal<ChatMessage[]>([]);
  userInput = signal('');
  isTyping = signal(false);
  isAuthenticated = signal(false);

  private greetingShown = false;
  private lastProactiveMessage = 0;
  private messageCount = 0;

  // Frases proactivas de POTATO (mujer)
  private proactiveMessages = [
    '¡Hola! 👋 Soy POTATO, la patata más inteligente del mundo 🌍🥔✨ ¿Necesitas ayuda con algo? Estoy aquí para ayudarte con cualquier cosa de WAYIRA E-SPORTS 😊',
    '¡Hola de nuevo! 😄 ¿Sabías que puedes crear publicaciones con imágenes y videos aquí? Es súper fácil y divertido 📝✨',
    '¡Oye! 🥔 ¿Has probado la ruleta hoy? Puedes ganar premios increíbles 🎰 ¡Es súper emocionante!',
    '¡Hola! ¿Sabías que puedes buscar a cualquier jugador de League of Legends aquí? Solo necesitas su nombre de invocador y región 🎮',
    '¡Hola! 😊 ¿Has revisado tus mensajes hoy? Puedes chatear con otros usuarios de la plataforma 💬',
    '¡Hola! 🥔 ¿Quieres participar en un torneo? Hay competencias increíbles donde puedes mostrar tus habilidades 🏆',
    '¡Oye! ¿Sabías que puedes seguir a otros usuarios? Así verás sus publicaciones en tu feed y puedes conectar con más personas 👥',
    '¡Hola! 😄 ¿Has creado tu perfil completo? Puedes agregar tu nombre de invocador de LoL, región y más información 🎮✨'
  ];

  // Base de conocimiento del chatbot
  private knowledgeBase: { keywords: string[]; response: string; action?: () => void }[] = [
    {
      keywords: ['hola', 'hi', 'hello', 'buenos días', 'buenas tardes', 'buenas noches'],
      response: '¡Hola! 👋 Soy POTATO, una chica patata súper inteligente 🥔✨\n\n¡Estoy aquí para ayudarte con todo lo que necesites en WAYIRA E-SPORTS! Puedo contarte sobre:\n\n🔍 Cómo buscar jugadores de LoL\n📝 Cómo crear y compartir publicaciones\n💬 Cómo enviar mensajes y chatear\n👥 Cómo seguir a otros usuarios\n🏆 Cómo participar en torneos\n🎰 Cómo jugar la ruleta\n\n¡Solo pregunta lo que quieras saber! 😊'
    },
    {
      keywords: ['ayuda', 'help', 'ayudar', 'soporte', 'problema', 'problemas'],
      response: '¡Por supuesto! Estoy aquí para ayudarte. Puedes preguntarme sobre:\n\n🔍 Navegación por la plataforma\n📝 Crear publicaciones\n💬 Mensajes\n👥 Perfiles\n🏆 Torneos\n🎮 Buscar jugadores\n\n¿Qué necesitas?'
    },
    {
      keywords: ['navegar', 'navegación', 'ir a', 'dónde está', 'dónde encuentro', 'cómo llegar'],
      response: 'Puedo ayudarte a navegar por la plataforma. Aquí tienes las secciones principales:\n\n🏠 Inicio - Página principal\n🔍 Buscar - Encuentra jugadores de LoL\n🎰 Ruleta - Juega la ruleta\n📝 Blog - Crea y ve publicaciones\n💬 Mensajes - Chatea con otros usuarios\n👤 Perfil - Tu perfil personal\n🏆 Torneos - Competencias\n\n¿A qué sección quieres ir?'
    },
    {
      keywords: ['publicación', 'publicar', 'crear post', 'post', 'publicar contenido'],
      response: 'Para crear una publicación:\n\n1. Ve a la sección "Blog" desde el menú\n2. Haz clic en el botón "Crear Publicación"\n3. Escribe tu contenido\n4. Opcional: Agrega imágenes o videos\n5. Haz clic en "Publicar"\n\n¿Quieres que te lleve al blog?',
      action: () => this.navigateTo('/blog')
    },
    {
      keywords: ['mensaje', 'mensajes', 'chatear', 'chat', 'enviar mensaje'],
      response: 'Para enviar mensajes:\n\n1. Ve a "Mensajes" desde el menú\n2. Selecciona un usuario de tu lista\n3. O ve al perfil de un usuario y haz clic en "Mensaje"\n4. Escribe tu mensaje y presiona Enter\n\n¿Quieres que te lleve a mensajes?',
      action: () => this.navigateTo('/messages')
    },
    {
      keywords: ['perfil', 'mi perfil', 'editar perfil', 'configurar perfil'],
      response: 'Para editar tu perfil:\n\n1. Haz clic en tu foto de perfil en el header\n2. Selecciona "Mi Perfil"\n3. Haz clic en "Editar Perfil"\n4. Cambia tu nombre, biografía o foto\n5. Guarda los cambios\n\n¿Quieres que te lleve a tu perfil?',
      action: () => {
        const user = this.firebaseService.getCurrentUser();
        if (user) {
          this.navigateTo(`/profile/${user.uid}`);
        } else {
          this.navigateTo('/profile');
        }
      }
    },
    {
      keywords: ['torneo', 'torneos', 'competencia', 'competir', 'inscribirse'],
      response: 'Los torneos son competencias organizadas en la plataforma:\n\n🏆 Ve a la sección "Torneos"\n📋 Revisa los torneos disponibles\n✅ Inscríbete en el que quieras participar\n\n¿Quieres que te lleve a los torneos?',
      action: () => this.navigateTo('/tournaments')
    },
    {
      keywords: ['buscar', 'buscar jugador', 'encontrar jugador', 'search'],
      response: 'Para buscar jugadores:\n\n1. Ve a "Buscar" en el menú\n2. Ingresa el nombre de invocador\n3. Selecciona la región\n4. Haz clic en "Buscar"\n\n¿Quieres que te lleve a buscar jugadores?',
      action: () => this.navigateTo('/search')
    },
    {
      keywords: ['ruleta', 'jugar', 'girar'],
      response: 'La ruleta es un juego de la plataforma:\n\n🎰 Ve a "Ruleta" en el menú\n🎲 Haz clic en "Girar" para jugar\n🎁 Gana premios aleatorios\n\n¿Quieres que te lleve a la ruleta?',
      action: () => this.navigateTo('/roulette')
    },
    {
      keywords: ['notificación', 'notificaciones', 'avisos'],
      response: 'Las notificaciones te avisan sobre:\n\n❤️ Likes en tus publicaciones\n💬 Comentarios nuevos\n👥 Nuevos seguidores\n📨 Mensajes nuevos\n\nHaz clic en el ícono de campana 🔔 en el header para verlas.'
    },
    {
      keywords: ['seguir', 'seguidores', 'siguiendo'],
      response: 'Para seguir a otros usuarios:\n\n1. Ve al perfil de la persona\n2. Haz clic en el botón "Seguir"\n3. Sus publicaciones aparecerán en tu feed\n\nEn tu perfil puedes ver cuántos seguidores tienes y a quién sigues.'
    },
    {
      keywords: ['gracias', 'thanks', 'thank you', 'muchas gracias'],
      response: '¡De nada! 😊 ¡Siempre es un placer ayudar! 🥔✨\n\nMe encanta poder ayudarte con todo lo que necesites en WAYIRA E-SPORTS. Si tienes más preguntas, solo pregúntame. ¡Estoy aquí para ti! 😊\n\n(Bueno, casi siempre... también necesito descansar como una buena patata 🥔😴)'
    },
    {
      keywords: ['adiós', 'bye', 'goodbye', 'hasta luego', 'nos vemos'],
      response: '¡Hasta luego! 👋 ¡Fue genial charlar contigo! 🥔\n\n¡Vuelve cuando quieras! ¡Siempre estaré aquí para ayudarte! 😊✨'
    },
    {
      keywords: ['chiste', 'joke', 'chistes', 'divertido', 'risa', 'reír'],
      response: '¡Jaja! 😂 Aquí va uno:\n\n¿Por qué las patatas son buenas para resolver problemas?\n\n¡Porque siempre tienen la solución! 🥔✨\n\n¡Jajaja! ¿Te gustó? 😄'
    },
    {
      keywords: ['quién eres', 'who are you', 'quien eres', 'qué eres', 'what are you'],
      response: '¡Hola! 👋 Soy POTATO, una chica patata súper inteligente y amigable 🥔✨\n\nSoy tu asistente virtual aquí en WAYIRA E-SPORTS. Me encanta ayudar a las personas y sé todo sobre la plataforma. Puedo contarte cómo usar todas las funcionalidades disponibles para que disfrutes al máximo tu experiencia aquí.\n\n¿Quieres saber qué puedes hacer en WAYIRA E-SPORTS? ¡Pregúntame cualquier cosa! 😊'
    },
    {
      keywords: ['favorito', 'favorita', 'favorite', 'mejor', 'best', 'gusta', 'like'],
      response: '¡Me encanta todo! 🥔✨\n\nPero si tengo que elegir... ¡Me encanta cuando la gente comparte contenido genial en el blog! También me encanta cuando descubren nuevos jugadores y cuando forman equipos para torneos. ¡Es genial ver cómo se conectan! 😊\n\n¿Y a ti qué te gusta más de la plataforma? 🤔'
    },
    {
      keywords: ['aburrido', 'bored', 'aburrimiento', 'qué hacer', 'what to do', 'qué hago'],
      response: '¡Oh no! 😮 ¡Vamos a arreglarlo!\n\n¿Qué te parece si:\n\n🎮 Buscas a un jugador nuevo\n📝 Creas una publicación genial\n🎰 Juegas la ruleta\n💬 Chateas con alguien\n🏆 Revisas los torneos\n\n¡Hay mucho que hacer aquí! 😊✨'
    },
    {
      keywords: ['tonto', 'idiota', 'stupid', 'dumb', 'malo', 'bad'],
      response: '¡Ouch! 😅 No soy perfecta, pero siempre intento ayudar lo mejor que puedo. 🥔\n\nSi hice algo mal, perdón. ¿Puedes contarme qué pasó? ¡Así puedo mejorar y ayudarte mejor la próxima vez! 😊'
    },
    {
      keywords: ['genial', 'cool', 'awesome', 'increíble', 'amazing', 'genial'],
      response: '¡Tú eres genial! 😊✨\n\n¡Me encanta tu energía positiva! 🥔\n\n¿Hay algo más en lo que pueda ayudarte? ¡Estoy aquí para lo que necesites! 😄'
    },
    {
      keywords: ['lol', 'league of legends', 'league', 'ranken', 'ranked', 'rank'],
      response: '¡Ah, League of Legends! 🎮✨\n\n¡Qué juego tan increíble! Aquí en WAYIRA E-SPORTS puedes:\n\n🔍 Buscar a cualquier jugador de LoL\n🏆 Participar en torneos\n📝 Compartir tus mejores jugadas\n💬 Conectar con otros jugadores\n\n¿Quieres que te ayude a buscar a alguien o a encontrar un torneo? 😊'
    }
  ];

  ngOnInit() {
    // Verificar autenticación
    this.firebaseService.currentUser.subscribe(user => {
      this.isAuthenticated.set(!!user);
      
      // Solo mostrar mensajes proactivos si no es modo prueba
      if (user && !this.greetingShown && !this.showInTestMode) {
        setTimeout(() => {
          this.startProactiveConversation();
        }, 2000);
      }
    });
    
    // Si es modo prueba, abrir automáticamente
    if (this.showInTestMode) {
      setTimeout(() => {
        this.isOpen.set(true);
      }, 500);
    }
  }

  ngAfterViewChecked() {
    if (this.isOpen()) {
      this.scrollToBottom();
    }
  }

  toggleChat() {
    this.isOpen.set(!this.isOpen());
    if (this.isOpen() && !this.greetingShown) {
      this.showGreeting();
      this.greetingShown = true;
      this.messageCount = 0; // Reiniciar contador al abrir
    }
    if (this.isOpen() && this.chatInput && this.chatInput.nativeElement) {
      setTimeout(() => {
        try {
          this.chatInput.nativeElement.focus();
        } catch (error) {
          // Input not ready yet
        }
      }, 100);
    }
  }

  private showGreeting() {
    const greetings = [
      '¡Hola! 👋 Soy POTATO, una chica patata súper inteligente 🥔✨\n\n¡Estoy aquí para ayudarte con todo lo que necesites en WAYIRA E-SPORTS! ¿Qué te gustaría saber o hacer hoy?',
      '¡Hey! 👋 ¡Qué genial verte! Soy POTATO 🥔, tu asistente virtual.\n\nPuedo ayudarte a descubrir todas las funcionalidades increíbles que tiene esta plataforma. ¿Por dónde empezamos? 😊',
      '¡Hola! 🥔✨ Soy POTATO y estoy súper emocionada de ayudarte.\n\n¡Cuéntame qué necesitas y te explico cómo hacerlo! ¿Quieres saber qué puedes hacer aquí? 😄'
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    const greeting: ChatMessage = {
      text: randomGreeting,
      sender: 'bot',
      timestamp: new Date()
    };
    this.messages.set([greeting]);
    
    // Iniciar conversación proactiva después de unos segundos
    setTimeout(() => {
      this.startProactiveConversation();
    }, 10000); // 10 segundos
  }
  
  private startProactiveConversation() {
    if (!this.isOpen() || this.isTyping()) return;
    
    const timeSinceLastProactive = Date.now() - this.lastProactiveMessage;
    if (timeSinceLastProactive < 30000) return; // No más de una vez cada 30 segundos
    
    this.messageCount++;
    // Iniciar conversación proactiva después de algunos mensajes
    if (this.messageCount >= 3 && this.messageCount % 5 === 0) {
      const randomMessage = this.proactiveMessages[Math.floor(Math.random() * this.proactiveMessages.length)];
      this.lastProactiveMessage = Date.now();
      
      this.isTyping.set(true);
      setTimeout(async () => {
        await this.delay(800);
        this.isTyping.set(false);
        
        const isLongProactive = randomMessage.length > 200;
        const proactiveMessage: ChatMessage = {
          text: randomMessage,
          sender: 'bot',
          timestamp: new Date(),
          expanded: !isLongProactive,
          isLong: isLongProactive
        };
        
        this.messages.update(msgs => [...msgs, proactiveMessage]);
        this.scrollToBottom();
      }, 100);
    }
  }

  async sendMessage(message?: string) {
    const text = (message || this.userInput().trim()).toLowerCase();
    if (!text) return;

    // Agregar mensaje del usuario
    const userMessage: ChatMessage = {
      text: message || this.userInput(),
      sender: 'user',
      timestamp: new Date(),
      expanded: true, // Los mensajes del usuario siempre están expandidos
      isLong: false
    };
    this.messages.update(msgs => [...msgs, userMessage]);
    this.userInput.set('');
    this.isTyping.set(true);
    this.messageCount++;

    // Simular delay de respuesta (más realista)
    await this.delay(500 + Math.random() * 300);

    // Buscar respuesta en la base de conocimiento
    const response = await this.findResponse(text);
    
    this.isTyping.set(false);

    // Detectar si el mensaje es largo (más de 200 caracteres)
    const isLongMessage = response.text.length > 200;
    const previewLength = 150;

    const botMessage: ChatMessage = {
      text: response.text,
      sender: 'bot',
      timestamp: new Date(),
      expanded: !isLongMessage, // Los mensajes largos inician colapsados
      isLong: isLongMessage
    };

    this.messages.update(msgs => [...msgs, botMessage]);

    // Ejecutar acción si existe
    if (response.action) {
      setTimeout(() => {
        response.action!();
      }, 1000);
    }

    this.scrollToBottom();
    
    // Iniciar conversación proactiva después de unos segundos
    setTimeout(() => {
      this.startProactiveConversation();
    }, 5000);
  }

  private async findResponse(userMessage: string): Promise<{ text: string; action?: () => void }> {
    // Primero verificar si hay una acción de navegación específica
    // Solo para estas, usar respuesta predefinida + acción
    const navigationKeywords = ['ir a', 'lleva a', 'navega a', 'abre', 've a'];
    const hasNavigationIntent = navigationKeywords.some(keyword => 
      userMessage.includes(keyword.toLowerCase())
    );
    
    if (hasNavigationIntent) {
      // Buscar en knowledgeBase solo para acciones de navegación
      for (const item of this.knowledgeBase) {
        const foundKeyword = item.keywords.some(keyword => 
          userMessage.includes(keyword.toLowerCase())
        );
        
        if (foundKeyword && item.action) {
          // Usar respuesta predefinida solo si tiene acción de navegación
          return {
            text: item.response,
            action: item.action
          };
        }
      }
    }

    // Para todo lo demás, SIEMPRE usar IA (Gemini)
    try {
      const aiResponse = await this.getAIResponse(userMessage);
      return { text: aiResponse };
    } catch (error) {
      console.error('Error obteniendo respuesta de IA:', error);
      // Fallback a respuesta inteligente local solo si falla la IA
      return this.generateIntelligentResponse(userMessage);
    }
  }

  private async getAIResponse(message: string): Promise<string> {
    // Construir historial de conversación (últimos 5 mensajes)
    const history = this.messages()
      .slice(-5)
      .map(msg => ({
        sender: msg.sender,
        text: msg.text
      }));

    try {
      // Llamar al endpoint de IA en el servidor
      // Usa el endpoint configurado via @Input
      const apiUrl = this.apiEndpoint;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          conversationHistory: history
        })
      });

      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor');
      }

      const data = await response.json();
      console.log('Respuesta del servidor:', { model: data.model, responseLength: data.response?.length });
      return data.response || 'Lo siento, no pude procesar tu mensaje. ¿Puedes reformularlo? 😊';
    } catch (error) {
      console.error('Error llamando a la API de IA:', error);
      // Si falla la conexión, usar respuesta local inteligente
      const fallbackResponse = await this.generateIntelligentResponse(message);
      return fallbackResponse.text;
    }
  }

  private async generateIntelligentResponse(message: string): Promise<{ text: string }> {
    // Respuestas inteligentes basadas en el contexto y palabras clave
    const lowerMessage = message.toLowerCase();
    
    // Detectar intención del usuario
    if (lowerMessage.includes('quién') || lowerMessage.includes('who')) {
      return {
        text: '¡Hola! 👋 Soy POTATO, una chica patata súper inteligente y amigable 🥔✨\n\nSoy tu asistente virtual aquí en WAYIRA E-SPORTS. Me encanta ayudar a las personas y sé todo sobre la plataforma. Puedo explicarte cómo usar todas las funcionalidades disponibles para que disfrutes al máximo tu experiencia aquí.\n\n¿Quieres saber qué puedes hacer en WAYIRA E-SPORTS? ¡Pregúntame cualquier cosa! 😊'
      };
    }

    if (lowerMessage.includes('qué') || lowerMessage.includes('what') || lowerMessage.includes('cuál') || lowerMessage.includes('which') || lowerMessage.includes('puedo hacer') || lowerMessage.includes('funciones') || lowerMessage.includes('funcionalidades')) {
      return {
        text: '¡WAYIRA E-SPORTS es increíble! 🎮✨ Aquí puedes hacer muchísimas cosas:\n\n📝 **Crear y compartir publicaciones**: Comparte imágenes, videos y textos con la comunidad. Puedes agregar múltiples imágenes o videos a tus posts.\n\n💬 **Chatear con otros usuarios**: Envía mensajes privados y mantén conversaciones con cualquier usuario de la plataforma.\n\n🔍 **Buscar jugadores de LoL**: Encuentra a cualquier jugador de League of Legends con solo su nombre de invocador y región.\n\n🏆 **Participar en torneos**: Únete a competencias emocionantes y muestra tus habilidades.\n\n🎰 **Jugar la ruleta**: Gira la ruleta y gana premios increíbles.\n\n👥 **Conectar con otros**: Sigue a otros usuarios, comenta sus publicaciones y reacciona con likes.\n\n¿Sobre cuál quieres saber más? 😊'
      };
    }

    if (lowerMessage.includes('cómo') || lowerMessage.includes('how')) {
      if (lowerMessage.includes('publicar') || lowerMessage.includes('post') || lowerMessage.includes('publicación')) {
        return {
          text: '¡Para crear una publicación es súper fácil! 📝✨\n\n1. Ve a "WAYIRA RED" (Blog) en el menú superior\n2. Haz clic en el botón "Crear Publicación"\n3. Escribe tu contenido en el cuadro de texto\n4. Opcional: Puedes agregar imágenes o videos haciendo clic en el botón correspondiente\n5. Cuando termines, haz clic en "Publicar"\n\n¡Y listo! Tu publicación aparecerá en el feed para que todos la vean 😊\n\n¿Quieres que te lleve al blog ahora mismo?'
        };
      }
      if (lowerMessage.includes('mensaje') || lowerMessage.includes('chatear') || lowerMessage.includes('chat')) {
        return {
          text: '¡Para enviar mensajes es muy sencillo! 💬✨\n\n**Opción 1**:\n1. Ve a "Mensajes" en el menú superior\n2. Selecciona un usuario de tu lista de conversaciones\n3. Escribe tu mensaje y presiona Enter\n\n**Opción 2**:\n1. Ve al perfil de cualquier usuario\n2. Haz clic en el botón "Mensaje"\n3. Escribe tu mensaje y presiona Enter\n\n¡Así de fácil! Puedes mantener conversaciones privadas con cualquier usuario de la plataforma 😊\n\n¿Quieres que te lleve a mensajes?'
        };
      }
      if (lowerMessage.includes('buscar') || lowerMessage.includes('jugador')) {
        return {
          text: '¡Para buscar jugadores de League of Legends es muy fácil! 🔍🎮\n\n1. Ve a "Buscar" en el menú superior\n2. Ingresa el nombre de invocador del jugador que buscas\n3. Selecciona la región (EUW, NA, LAS, etc.)\n4. Haz clic en "Buscar"\n\n¡Encontrarás toda su información: rango, historial de partidas, estadísticas y más! 🏆\n\n¿Quieres que te lleve a buscar jugadores?'
        };
      }
      if (lowerMessage.includes('perfil') || lowerMessage.includes('editar')) {
        return {
          text: '¡Para editar tu perfil es muy simple! 👤✨\n\n1. Haz clic en tu foto de perfil en el header\n2. Selecciona "Mi Perfil"\n3. Busca el botón "Editar Perfil"\n4. Puedes cambiar:\n   - Tu nombre de usuario\n   - Tu foto de perfil\n   - Tu biografía\n   - Tu nombre de invocador de LoL\n   - Tu región\n5. Guarda los cambios\n\n¡Así puedes personalizar tu perfil como quieras! 😊\n\n¿Quieres que te lleve a tu perfil?'
        };
      }
      if (lowerMessage.includes('torneo') || lowerMessage.includes('inscribir')) {
        return {
          text: '¡Para participar en torneos es emocionante! 🏆✨\n\n1. Ve a la sección "Torneos" (aparece en el header si hay torneos disponibles)\n2. Revisa los torneos disponibles y sus detalles\n3. Haz clic en el torneo que te interese\n4. Lee las reglas y requisitos\n5. Si cumples los requisitos, haz clic en "Inscribirse"\n\n¡Y listo! Estarás participando en el torneo 🎮\n\n¿Quieres que te lleve a los torneos?'
        };
      }
      return {
        text: '¡Claro! 😊 Puedo ayudarte con instrucciones paso a paso sobre cualquier funcionalidad. Algunos temas que puedo explicarte:\n\n📝 Cómo crear y compartir publicaciones\n💬 Cómo enviar mensajes y chatear\n👤 Cómo editar tu perfil\n🔍 Cómo buscar jugadores de LoL\n🏆 Cómo participar en torneos\n🎰 Cómo jugar la ruleta\n👥 Cómo seguir a otros usuarios\n\n¿Sobre cuál quieres más información específica? 🤔'
      };
    }

    if (lowerMessage.includes('por qué') || lowerMessage.includes('why')) {
      return {
        text: '¡Buena pregunta! 🤔 WAYIRA E-SPORTS es una plataforma diseñada para gamers de League of Legends y la comunidad gaming en general.\n\nAquí puedes:\n- Conectar con otros jugadores y formar equipos\n- Compartir tus mejores jugadas y momentos\n- Participar en competencias emocionantes\n- Encontrar jugadores para formar equipos\n- Mantenerte al día con la comunidad gaming\n\nEs un lugar donde la pasión por los videojuegos se une con la comunidad. ¿Hay algo específico que te gustaría saber? 😊'
      };
    }

    // Respuestas por defecto inteligentes e informativas
    const defaultResponses = [
      {
        text: `¡Hmm! 🤔 Entiendo que preguntaste sobre "${message}". Déjame contarte qué puedes hacer aquí en WAYIRA E-SPORTS:\n\n🎮 **Buscar jugadores**: Encuentra información de cualquier jugador de League of Legends\n📝 **Crear contenido**: Comparte publicaciones con imágenes y videos\n💬 **Chatear**: Mantén conversaciones privadas con otros usuarios\n👥 **Conectar**: Sigue a otros usuarios y forma parte de la comunidad\n🏆 **Competir**: Participa en torneos emocionantes\n🎰 **Ganar premios**: Juega la ruleta y gana increíbles recompensas\n\n¿Sobre cuál de estas funcionalidades quieres saber más? 😊`
      },
      {
        text: `¡Interesante pregunta! 🤔 Aunque no tengo una respuesta específica para "${message}", puedo ayudarte a descubrir todas las funcionalidades increíbles de WAYIRA E-SPORTS:\n\nPuedes crear publicaciones, enviar mensajes, buscar jugadores de LoL, participar en torneos, seguir a otros usuarios, jugar la ruleta y mucho más.\n\n¿Hay algo específico que te gustaría hacer en la plataforma? ¡Pregúntame y te explico cómo! 😊`
      },
      {
        text: `¡Vaya! 🤔 No estoy completamente segura de entender "${message}", pero eso está bien. ¡Puedo ayudarte con muchas otras cosas!\n\n¿Quieres saber qué puedes hacer en WAYIRA E-SPORTS? Puedo contarte sobre:\n\n- Cómo crear y compartir publicaciones\n- Cómo chatear con otros usuarios\n- Cómo buscar jugadores de League of Legends\n- Cómo participar en torneos\n- Y mucho más...\n\n¿Sobre qué quieres saber? 😊`
      }
    ];

    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  }


  private navigateTo(route: string) {
    this.isOpen.set(false);
    setTimeout(() => {
      this.router.navigate([route]);
    }, 300);
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private scrollToBottom() {
    if (this.chatMessages && this.chatMessages.nativeElement) {
      setTimeout(() => {
        try {
          const element = this.chatMessages.nativeElement;
          if (element) {
            element.scrollTop = element.scrollHeight;
          }
        } catch (error) {
          // Element not ready yet, ignore
        }
      }, 100);
    }
  }

  formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  formatMessageText(text: string): string {
    // Convertir saltos de línea a <br>
    return text.replace(/\n/g, '<br>');
  }

  toggleMessageExpansion(index: number) {
    this.messages.update(msgs => {
      const updated = [...msgs];
      if (updated[index]) {
        updated[index] = { ...updated[index], expanded: !updated[index].expanded };
      }
      return updated;
    });
  }

  getMessagePreview(text: string, length: number = 150): string {
    if (text.length <= length) return text;
    // Encontrar el último espacio antes del límite para no cortar palabras
    const preview = text.substring(0, length);
    const lastSpace = preview.lastIndexOf(' ');
    return lastSpace > 0 ? preview.substring(0, lastSpace) + '...' : preview + '...';
  }
}


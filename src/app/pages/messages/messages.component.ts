import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseService, Message, UserProfile } from '../../services/firebase.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css']
})
export class MessagesComponent implements OnInit {
  private firebaseService = inject(FirebaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  conversations = signal<Array<{ userId: string; profile: UserProfile | null; lastMessage: Message | null; unread: number }>>([]);
  selectedConversation = signal<string | null>(null);
  messages = signal<Message[]>([]);
  currentUser = signal<UserProfile | null>(null);
  newMessage = signal('');
  minimizedChats = signal<Set<string>>(new Set());
  showEmojiPicker = signal(false);
  emojiTab = signal<'normal' | 'riot'>('normal');
  showConversationMenu = signal<Map<string, boolean>>(new Map());

  // Emojis normales
  normalEmojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
    '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖',
    '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
    '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
    '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦',
    '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴',
    '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿',
    '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖',
    '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘',
    '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚',
    '🖐', '✋', '🖖', '👏', '🙌', '🤲', '🤝', '🙏', '✍️', '💪',
    '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁',
    '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸', '❤️', '🧡',
    '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
    '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️',
    '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈',
    '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒',
    '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚',
    '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴',
    '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌',
    '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯',
    '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️',
    '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️',
    '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀',
    '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄',
    '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣',
    'ℹ️', '🔤', '🔡', '🔠', '🔢', '🔟', '▶️', '⏸', '⏯', '⏹',
    '⏺', '⏭', '⏮', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽',
    '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️',
    '↪', '↩', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵',
    '🎶', '➕', '➖', '➗', '✖️', '♾', '💲', '💱', '™️', '©️',
    '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️',
    '☑️', '🔘', '⚪', '⚫', '🔴', '🔵', '🟠', '🟡', '🟢', '🟣',
    '⚫', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳',
    '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨',
    '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊',
    '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯', '♠️', '♣️', '♥️',
    '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕',
    '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟',
    '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'
  ];

  // Emojis de Riot Games / League of Legends
  riotEmojis = [
    // Armas y combate
    '⚔️', '🗡️', '🛡️', '🏹', '🔪', '🪓', '⚡', '🔥', '💧', '❄️',
    '🌪️', '💨', '💥', '⚡', '🔥', '💧', '❄️', '🌊', '🌋', '🌀',
    // Elementos mágicos
    '✨', '⭐', '🌟', '💫', '☄️', '🌠', '🔮', '💎', '⚗️', '🧪',
    '🔭', '🔬', '⚛️', '💠', '🕯️', '🔦', '💡', '⚡', '🔥', '💧',
    // Símbolos y signos
    '⚡', '🔥', '💧', '❄️', '🌪️', '💫', '⭐', '✨', '💥', '💢',
    '💨', '🌟', '☄️', '🌠', '🔮', '⚔️', '🛡️', '🗡️', '🏹', '🪃',
    // Objetos del juego
    '💰', '🪙', '💎', '🔮', '⚗️', '🧪', '💊', '💉', '🩸', '⚙️',
    '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '🧱', '⛓️', '🧲', '🔫',
    '💣', '🧨', '🗝️', '🔑', '⚱️', '⚰️', '🏺', '🛡️', '⚔️', '🗡️',
    // Símbolos de poder
    '⚡', '🔥', '💧', '❄️', '🌪️', '💫', '⭐', '✨', '💥', '💢',
    '🌟', '☄️', '🌠', '🔮', '💎', '⚗️', '🧪', '🔭', '🔬', '⚛️',
    // Iconos especiales
    '⚔️', '🛡️', '🗡️', '🏹', '🔪', '🪓', '⚡', '🔥', '💧', '❄️',
    '🌪️', '💨', '💥', '💫', '⭐', '✨', '🌟', '☄️', '🌠', '🔮',
    '💎', '⚗️', '🧪', '🔭', '🔬', '⚛️', '💠', '🕯️', '🔦', '💡',
    '💰', '🪙', '⚙️', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '🧱',
    '⛓️', '🧲', '🔫', '💣', '🧨', '🗝️', '🔑', '⚱️', '⚰️', '🏺'
  ];
  
  selectedUserProfile = computed(() => {
    const selectedId = this.selectedConversation();
    if (!selectedId) return null;
    const conv = this.conversations().find(c => c.userId === selectedId);
    return conv?.profile || null;
  });

  ngOnInit() {
    this.loadCurrentUser();
    this.loadConversations();
    
    // Verificar si hay un userId en queryParams
    this.route.queryParams.subscribe(params => {
      if (params['userId']) {
        this.selectConversation(params['userId']);
      }
    });
  }

  async loadCurrentUser() {
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
    }
  }

  loadConversations() {
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      console.warn('No hay usuario autenticado para cargar conversaciones');
      return;
    }

    console.log('Cargando conversaciones para usuario:', user.uid);

    this.firebaseService.getConversations(user.uid).subscribe({
      next: async (conversationIds) => {
        console.log('IDs de conversaciones recibidos:', conversationIds);
        
        if (!conversationIds || conversationIds.length === 0) {
          console.log('No hay conversaciones');
          this.conversations.set([]);
          return;
        }

        const conversations = await Promise.all(
          conversationIds.map(async (otherUserId) => {
            try {
              const profile = await this.firebaseService.getUserProfile(otherUserId);
              
              // Obtener mensajes usando firstValueFrom para obtener el primer valor del Observable
              let messages: any[] = [];
              try {
                const { firstValueFrom } = await import('rxjs');
                messages = await firstValueFrom(this.firebaseService.getMessages(user.uid, otherUserId));
              } catch (rxjsError) {
                // Fallback: usar el Observable directamente con timeout
                messages = await new Promise((resolve) => {
                  const subscription = this.firebaseService.getMessages(user.uid, otherUserId).subscribe({
                    next: (msgs) => {
                      subscription.unsubscribe();
                      resolve(msgs);
                    },
                    error: () => {
                      subscription.unsubscribe();
                      resolve([]);
                    }
                  });
                  // Timeout de seguridad
                  setTimeout(() => {
                    subscription.unsubscribe();
                    resolve([]);
                  }, 5000);
                });
              }
              
              const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
              const unread = messages ? messages.filter(m => !m.read && m.toId === user.uid).length : 0;
              return { userId: otherUserId, profile, lastMessage, unread };
            } catch (error) {
              console.error(`Error cargando conversación con ${otherUserId}:`, error);
              return null;
            }
          })
        );

        // Filtrar conversaciones nulas
        const validConversations = conversations.filter(c => c !== null) as Array<{ userId: string; profile: UserProfile | null; lastMessage: Message | null; unread: number }>;
        
        // Ordenar por fecha del último mensaje (más reciente primero)
        validConversations.sort((a, b) => {
          if (!a.lastMessage && !b.lastMessage) return 0;
          if (!a.lastMessage) return 1;
          if (!b.lastMessage) return -1;
          const aTime = a.lastMessage.timestamp?.toDate?.() || new Date(0);
          const bTime = b.lastMessage.timestamp?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
        
        console.log('Conversaciones cargadas:', validConversations.length);
        this.conversations.set(validConversations);
      },
      error: (error) => {
        console.error('Error cargando conversaciones:', error);
        this.conversations.set([]);
      }
    });
  }

  selectConversation(userId: string) {
    // Verificar si el usuario existe en las conversaciones
    const existingConv = this.conversations().find(c => c.userId === userId);
    if (!existingConv) {
      // Si no existe, cargar el perfil y crear una conversación temporal
      this.firebaseService.getUserProfile(userId).then(profile => {
        if (profile) {
          this.conversations.update(convs => [...convs, { userId, profile, lastMessage: null, unread: 0 }]);
        }
      });
    }
    
    this.selectedConversation.set(userId);
    this.minimizedChats.update(chats => {
      const newChats = new Set(chats);
      newChats.delete(userId);
      return newChats;
    });
    this.loadMessages(userId);
    this.markAsRead(userId);
    
    // Limpiar queryParams después de seleccionar
    this.router.navigate([], { queryParams: {} });
  }

  loadMessages(otherUserId: string) {
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;

    this.firebaseService.getMessages(user.uid, otherUserId).subscribe({
      next: (messages) => {
        this.messages.set(messages);
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });
  }

  async sendMessage() {
    const user = this.firebaseService.getCurrentUser();
    const otherUserId = this.selectedConversation();
    if (!user || !otherUserId || !this.newMessage().trim()) return;

    // Guardar el ID de la conversación para mantenerla seleccionada
    const currentConversationId = otherUserId;
    const messageContent = this.newMessage().trim();

    try {
      await this.firebaseService.sendMessage({
        fromId: user.uid,
        toId: otherUserId,
        content: messageContent
      });

      this.newMessage.set('');
      // Asegurar que la conversación sigue seleccionada
      this.selectedConversation.set(currentConversationId);
      
      // Recargar mensajes y conversaciones
      this.loadMessages(currentConversationId);
      
      // Esperar un momento antes de recargar conversaciones para que Firestore actualice
      setTimeout(() => {
        this.loadConversations();
        this.scrollToBottom();
      }, 300);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      alert('Error al enviar el mensaje. Por favor intenta nuevamente.');
    }
  }

  async markAsRead(otherUserId: string) {
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;

    const messages = this.messages();
    // Marcar todos los mensajes no leídos como leídos
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg.read && msg.toId === user.uid) {
        try {
          await this.firebaseService.markAsRead(user.uid, otherUserId, i);
        } catch (error) {
          console.error('Error marcando mensaje como leído:', error);
        }
      }
    }
    this.loadConversations();
  }

  minimizeChat(userId: string) {
    this.minimizedChats.update(chats => {
      const newChats = new Set(chats);
      newChats.add(userId);
      return newChats;
    });
  }

  maximizeChat(userId: string) {
    this.minimizedChats.update(chats => {
      const newChats = new Set(chats);
      newChats.delete(userId);
      return newChats;
    });
    this.selectConversation(userId);
  }

  closeChat(userId: string) {
    if (this.selectedConversation() === userId) {
      this.selectedConversation.set(null);
    }
    this.minimizedChats.update(chats => {
      const newChats = new Set(chats);
      newChats.delete(userId);
      return newChats;
    });
  }

  scrollToBottom() {
    const chatContainer = document.querySelector('.chat-messages');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  getLastMessageTime(conv: { userId: string; profile: UserProfile | null; lastMessage: Message | null; unread: number }): string {
    if (!conv.lastMessage) return '';
    return this.formatTime(conv.lastMessage.timestamp);
  }

  isMinimized(userId: string): boolean {
    return this.minimizedChats().has(userId);
  }

  getMinimizedChats(): Array<{ userId: string; profile: UserProfile | null }> {
    return this.conversations()
      .filter(c => this.minimizedChats().has(c.userId))
      .map(c => ({ userId: c.userId, profile: c.profile }));
  }

  toggleEmojiPicker() {
    this.showEmojiPicker.set(!this.showEmojiPicker());
  }

  selectEmojiTab(tab: 'normal' | 'riot') {
    this.emojiTab.set(tab);
  }

  insertEmoji(emoji: string) {
    this.newMessage.update(msg => msg + emoji);
    this.showEmojiPicker.set(false);
  }

  closeEmojiPicker() {
    this.showEmojiPicker.set(false);
  }

  toggleConversationMenu(userId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const currentMenu = new Map(this.showConversationMenu());
    const isOpen = currentMenu.get(userId) || false;
    currentMenu.set(userId, !isOpen);
    this.showConversationMenu.set(currentMenu);
  }

  async deleteConversation(userId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta conversación?')) {
      return;
    }

    const user = this.firebaseService.getCurrentUser();
    if (!user) return;

    try {
      // Eliminar toda la conversación (ahora se elimina el documento de conversación completo)
      await this.firebaseService.deleteMessage(user.uid, userId);

      // Si la conversación seleccionada es la que se elimina, cerrarla
      if (this.selectedConversation() === userId) {
        this.selectedConversation.set(null);
      }

      // Recargar conversaciones
      this.loadConversations();

      // Cerrar el menú
      const currentMenu = new Map(this.showConversationMenu());
      currentMenu.set(userId, false);
      this.showConversationMenu.set(currentMenu);
    } catch (error) {
      console.error('Error eliminando conversación:', error);
      alert('Error al eliminar la conversación. Por favor intenta nuevamente.');
    }
  }

  closeConversationMenu(userId: string) {
    const currentMenu = new Map(this.showConversationMenu());
    currentMenu.set(userId, false);
    this.showConversationMenu.set(currentMenu);
  }
}


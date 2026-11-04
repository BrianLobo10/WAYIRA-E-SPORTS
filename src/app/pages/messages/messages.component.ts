import { Component, signal, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Message, UserProfile } from '../../models';
import { CommunityService } from '../../services/community.service';
import { MessagingService, type ConversationSummary } from '../../services/messaging.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css']
})
export class MessagesComponent implements OnInit, OnDestroy {
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private community = inject(CommunityService);
  private messaging = inject(MessagingService);
  private auth = inject(AuthService);
  private stopWatching?: () => void;
  /** id de conversación por cada persona (la plantilla trabaja con el id de la otra persona). */
  private convIds = new Map<string, string>();
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  conversations = signal<ConversationSummary[]>([]);
  sending = signal(false);
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

  // Emojis de Riot Games / League of Legends (incluyendo gestos)
  riotEmojis = [
    // Gestos de LoL / Emojis de acción
    '👏', '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟',
    '🤘', '👌', '🤌', '🤏', '👋', '🤚', '🖐', '✋', '🖖', '🙌',
    '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '👈', '👉', '👆',
    '👇', '☝️', '👀', '👁️', '🗣️', '👤', '👥',
    // Armas y combate
    '⚔️', '🗡️', '🛡️', '🏹', '🔪', '🪓', '⚡', '🔥', '💧', '❄️',
    '🌪️', '💨', '💥', '🌊', '🌋', '🌀',
    // Elementos mágicos
    '✨', '⭐', '🌟', '💫', '☄️', '🌠', '🔮', '💎', '⚗️', '🧪',
    '🔭', '🔬', '⚛️', '💠', '🕯️', '🔦', '💡',
    // Objetos del juego
    '💰', '🪙', '💊', '💉', '🩸', '⚙️', '🔧', '🔨', '⚒️', '🛠️',
    '⛏️', '🔩', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🗝️', '🔑',
    '⚱️', '⚰️', '🏺'
  ];
  
  selectedUserProfile = computed(() => {
    const selectedId = this.selectedConversation();
    if (!selectedId) return null;
    const conv = this.conversations().find(c => c.userId === selectedId);
    return conv?.profile || null;
  });

  async ngOnInit() {
    await this.auth.waitForInit();
    void this.loadCurrentUser();
    await this.loadConversations();

    // Abrir chat directo desde un perfil (?userId=...)
    this.route.queryParams.subscribe(params => {
      if (params['userId']) {
        void this.selectConversation(params['userId']);
      }
    });

    // Mensajes nuevos al instante
    this.stopWatching = this.messaging.watch({
      onMessage: (conversationId) => {
        void this.loadConversations();
        const open = this.selectedConversation();
        if (open && this.convIds.get(open) === conversationId) {
          void this.loadMessages(open);
          void this.messaging.markConversationRead(conversationId);
        }
      }
    });
  }

  ngOnDestroy() {
    this.stopWatching?.();
  }

  async loadCurrentUser() {
    const user = this.community.getCurrentUser();
    if (user) {
      this.currentUser.set(await this.community.getUserProfile(user.uid));
    }
  }

  async loadConversations() {
    try {
      const list = await this.messaging.getConversations();
      list.forEach((c) => this.convIds.set(c.userId, c.id));
      // Conserva un chat recién abierto que aún no tiene mensajes
      const open = this.selectedConversation();
      const pending = open && !list.some((c) => c.userId === open) ? this.conversations().find((c) => c.userId === open) : undefined;
      this.conversations.set(pending ? [pending, ...list] : list);
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
    }
  }

  async selectConversation(userId: string) {
    if (userId === this.community.getCurrentUser()?.uid) return;
    try {
      let convId = this.convIds.get(userId);
      if (!convId) {
        convId = await this.messaging.openConversation(userId);
        this.convIds.set(userId, convId);
      }
      if (!this.conversations().some((c) => c.userId === userId)) {
        const profile = await this.community.getUserProfile(userId);
        this.conversations.update((convs) => [{ id: convId!, userId, profile, lastMessage: null, unread: 0 }, ...convs]);
      }
    } catch (error) {
      this.toast.notify(error instanceof Error ? error.message : 'No se pudo abrir la conversación.');
      return;
    }

    this.selectedConversation.set(userId);
    this.minimizedChats.update(chats => {
      const newChats = new Set(chats);
      newChats.delete(userId);
      return newChats;
    });

    await this.loadMessages(userId);
    void this.markAsRead(userId);

    // Limpia ?userId= de la dirección sin perder el chat abierto
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  async loadMessages(otherUserId: string) {
    const convId = this.convIds.get(otherUserId);
    if (!convId) return;
    try {
      this.messages.set(await this.messaging.getMessages(convId));
      setTimeout(() => this.scrollToBottom(), 50);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    }
  }

  async sendMessage() {
    const user = this.community.getCurrentUser();
    const otherUserId = this.selectedConversation();
    const convId = otherUserId ? this.convIds.get(otherUserId) : undefined;
    const content = this.newMessage().trim();
    if (!user || !otherUserId || !convId || !content || this.sending()) return;

    this.sending.set(true);
    // Se muestra al instante; el tiempo real confirma y recarga
    const optimistic: Message = {
      id: `tmp-${Date.now()}`, fromId: user.uid, fromName: '', toId: otherUserId, content,
      timestamp: { toDate: () => new Date() } as Message['timestamp'], read: false
    };
    this.messages.update((m) => [...m, optimistic]);
    this.newMessage.set('');
    setTimeout(() => this.scrollToBottom(), 0);
    try {
      await this.messaging.sendMessage(convId, content);
      await this.loadMessages(otherUserId);
      void this.loadConversations();
    } catch (error) {
      this.messages.update((m) => m.filter((x) => x.id !== optimistic.id));
      this.newMessage.set(content);
      this.toast.notify(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    } finally {
      this.sending.set(false);
    }
  }

  async markAsRead(otherUserId: string) {
    const convId = this.convIds.get(otherUserId);
    if (!convId) return;
    await this.messaging.markConversationRead(convId);
    this.conversations.update((list) => list.map((c) => (c.userId === otherUserId ? { ...c, unread: 0 } : c)));
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

  getLastMessageTime(conv: ConversationSummary): string {
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
    // No cerrar el picker al insertar un emoji
    this.newMessage.update(msg => msg + emoji);
  }

  closeEmojiPicker() {
    this.showEmojiPicker.set(false);
  }

  goToUserProfile(userId: string) {
    this.router.navigate(['/profile', userId]);
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
    if (!(await this.dialog.confirm('¿Eliminar esta conversación? Se borrará para los dos.'))) {
      return;
    }
    const convId = this.convIds.get(userId);
    if (!convId) return;

    try {
      await this.messaging.deleteConversation(convId);
      this.convIds.delete(userId);
      if (this.selectedConversation() === userId) {
        this.selectedConversation.set(null);
        this.messages.set([]);
      }
      this.conversations.update((list) => list.filter((c) => c.userId !== userId));
      this.closeConversationMenu(userId);
    } catch (error) {
      this.toast.notify(error instanceof Error ? error.message : 'No se pudo eliminar la conversación.');
    }
  }

  closeConversationMenu(userId: string) {
    const currentMenu = new Map(this.showConversationMenu());
    currentMenu.set(userId, false);
    this.showConversationMenu.set(currentMenu);
  }
}


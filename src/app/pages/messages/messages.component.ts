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
    if (!user) return;

    this.firebaseService.getConversations(user.uid).subscribe({
      next: async (conversationIds) => {
        const conversations = await Promise.all(
          conversationIds.map(async (otherUserId) => {
            const profile = await this.firebaseService.getUserProfile(otherUserId);
            const messages = await this.firebaseService.getMessages(user.uid, otherUserId).toPromise();
            const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
            const unread = messages ? messages.filter(m => !m.read && m.toId === user.uid).length : 0;
            return { userId: otherUserId, profile, lastMessage, unread };
          })
        );
        conversations.sort((a, b) => {
          if (!a.lastMessage && !b.lastMessage) return 0;
          if (!a.lastMessage) return 1;
          if (!b.lastMessage) return -1;
          const aTime = a.lastMessage.timestamp?.toDate?.() || new Date(0);
          const bTime = b.lastMessage.timestamp?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
        this.conversations.set(conversations);
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

    await this.firebaseService.sendMessage({
      fromId: user.uid,
      toId: otherUserId,
      content: this.newMessage()
    });

    this.newMessage.set('');
    this.loadMessages(otherUserId);
    this.loadConversations();
  }

  async markAsRead(otherUserId: string) {
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;

    const messages = this.messages();
    const unreadMessages = messages.filter(m => !m.read && m.toId === user.uid);
    for (const msg of unreadMessages) {
      if (msg.id) {
        await this.firebaseService.markAsRead(msg.id);
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
}


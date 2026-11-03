import { Component, signal, inject, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Notification } from '../../models';
import { MessagingService } from '../../services/messaging.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  @ViewChild('dropdown') dropdown?: ElementRef;

  private messaging = inject(MessagingService);
  private auth = inject(AuthService);
  private stopWatching?: () => void;

  notifications = signal<Notification[]>([]);
  /** Viene del servicio: se actualiza solo con cada notificación nueva (tiempo real). */
  unreadCount = this.messaging.unreadNotifications;
  showDropdown = signal(false);
  loading = signal(true);

  async ngOnInit() {
    await this.auth.waitForInit();
    if (!this.auth.user()) {
      this.loading.set(false);
      return;
    }
    void this.loadNotifications();
    void this.messaging.refreshUnreadNotifications();
    void this.messaging.refreshUnreadMessages();
    // La campana y el contador de mensajes se actualizan solos
    this.stopWatching = this.messaging.watch({
      onNotification: () => {
        if (this.showDropdown()) void this.loadNotifications();
      }
    });
  }

  ngOnDestroy() {
    this.stopWatching?.();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.dropdown && !this.dropdown.nativeElement.contains(event.target)) {
      this.showDropdown.set(false);
    }
  }

  async loadNotifications() {
    try {
      this.notifications.set(await this.messaging.getNotifications());
    } catch (err) {
      console.error('No se pudieron cargar las notificaciones', err);
    } finally {
      this.loading.set(false);
    }
  }

  toggleDropdown() {
    const open = !this.showDropdown();
    this.showDropdown.set(open);
    if (open) void this.loadNotifications();
  }

  async markAsRead(notification: Notification) {
    if (notification.id && !notification.read) {
      this.notifications.update((list) => list.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      await this.messaging.markNotificationRead(notification.id);
    }
  }

  async markAllAsRead() {
    this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
    await this.messaging.markAllNotificationsRead();
  }

  getNotificationMessage(notification: Notification): string {
    switch (notification.type) {
      case 'like':
        return `${notification.fromUserName} reaccionó a tu publicación`;
      case 'comment':
        return `${notification.fromUserName} comentó en tu publicación`;
      case 'comment_reply':
        return `${notification.fromUserName} respondió a tu comentario`;
      case 'follow':
        return `${notification.fromUserName} empezó a seguirte`;
      case 'message':
        return `${notification.fromUserName} te envió un mensaje`;
      default:
        return 'Nueva notificación';
    }
  }

  getNotificationLink(notification: Notification): string[] {
    if (notification.postId) {
      // Las publicaciones propias se ven en tu perfil
      return ['/profile'];
    } else if (notification.type === 'follow') {
      return ['/profile', notification.fromUserId];
    } else if (notification.type === 'message') {
      return ['/messages'];
    }
    return ['/'];
  }

  getNotificationQueryParams(notification: Notification): any {
    if (notification.type === 'message') {
      return { userId: notification.fromUserId };
    }
    return {};
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    
    // Verificar si es el mismo día
    const isSameDay = date.getDate() === now.getDate() &&
                      date.getMonth() === now.getMonth() &&
                      date.getFullYear() === now.getFullYear();
    
    if (isSameDay) {
      // Mostrar hora si es el mismo día
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } else {
      // Mostrar fecha si es otro día
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }
}


import { Component, signal, inject, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FirebaseService, Notification } from '../../services/firebase.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  @ViewChild('dropdown') dropdown?: ElementRef;
  
  firebaseService = inject(FirebaseService);
  private notificationsSubscription?: Subscription;
  private unreadCountSubscription?: Subscription;

  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  showDropdown = signal(false);
  loading = signal(true);

  ngOnInit() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (currentUser) {
      this.loadNotifications(currentUser.uid);
      this.loadUnreadCount(currentUser.uid);
    }
  }

  ngOnDestroy() {
    this.notificationsSubscription?.unsubscribe();
    this.unreadCountSubscription?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.dropdown && !this.dropdown.nativeElement.contains(event.target)) {
      this.showDropdown.set(false);
    }
  }

  loadNotifications(userId: string) {
    this.loading.set(true);
    this.notificationsSubscription = this.firebaseService.getNotifications(userId).subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  loadUnreadCount(userId: string) {
    this.unreadCountSubscription = this.firebaseService.getUnreadNotificationsCount(userId).subscribe({
      next: (count) => {
        this.unreadCount.set(count);
      }
    });
  }

  toggleDropdown() {
    this.showDropdown.set(!this.showDropdown());
  }

  async markAsRead(notification: Notification) {
    if (notification.id && !notification.read) {
      await this.firebaseService.markNotificationAsRead(notification.id);
      const currentUser = this.firebaseService.getCurrentUser();
      if (currentUser) {
        this.loadUnreadCount(currentUser.uid);
      }
    }
  }

  async markAllAsRead(userId: string) {
    await this.firebaseService.markAllNotificationsAsRead(userId);
    this.loadUnreadCount(userId);
  }

  getNotificationMessage(notification: Notification): string {
    switch (notification.type) {
      case 'like':
        return `${notification.fromUserName} reaccionó a tu publicación`;
      case 'comment':
        return `${notification.fromUserName} comentó en tu publicación`;
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
      return ['/blog/post', notification.postId];
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


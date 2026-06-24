import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FirebaseService, UserProfile } from '../../services/firebase.service';

@Component({
  selector: 'app-explore-users',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './explore-users.component.html',
  styleUrl: './explore-users.component.css'
})
export class ExploreUsersComponent implements OnInit {
  private firebaseService = inject(FirebaseService);

  users = signal<UserProfile[]>([]);
  loading = signal(false);
  loadingMore = signal(false);
  lastDoc = signal<unknown>(null);
  hasMore = signal(true);

  ngOnInit() {
    this.loadPage();
  }

  loadPage() {
    const uid = this.firebaseService.getCurrentUser()?.uid;
    if (!uid) return;
    this.loading.set(true);
    this.firebaseService.getExploreUsers(uid, 30, undefined).subscribe({
      next: ({ users, lastDoc, hasMore }) => {
        this.users.set(users);
        this.lastDoc.set(lastDoc);
        this.hasMore.set(hasMore);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadMore() {
    const uid = this.firebaseService.getCurrentUser()?.uid;
    const last = this.lastDoc();
    if (!uid || !last || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.firebaseService.getExploreUsers(uid, 30, last).subscribe({
      next: ({ users, lastDoc, hasMore }) => {
        this.users.update((prev) => [...prev, ...users]);
        this.lastDoc.set(lastDoc);
        this.hasMore.set(hasMore);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false)
    });
  }

  async follow(uid: string) {
    const me = this.firebaseService.getCurrentUser();
    if (!me || me.uid === uid) return;
    try {
      await this.firebaseService.followUser(me.uid, uid);
      this.users.update((list) =>
        list.map((u) => (u.uid === uid ? { ...u, followers: [...(u.followers || []), me.uid] } : u))
      );
    } catch (e) {
      console.error(e);
    }
  }

  isFollowing(user: UserProfile): boolean {
    const me = this.firebaseService.getCurrentUser();
    return !!(me && (user.followers || []).includes(me.uid));
  }

  getHandle(p: UserProfile): string {
    const name = p?.displayName || p?.email?.split('@')[0] || 'user';
    return '@' + name.replace(/\s+/g, '').toLowerCase().slice(0, 16);
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { UserProfile } from '../../models';
import { CommunityService } from '../../services/community.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-explore-users',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './explore-users.component.html',
  styleUrl: './explore-users.component.css'
})
export class ExploreUsersComponent implements OnInit {
  private community = inject(CommunityService);
  private auth = inject(AuthService);

  users = signal<UserProfile[]>([]);
  loading = signal(false);
  loadingMore = signal(false);
  hasMore = signal(true);
  private page = 0;

  async ngOnInit() {
    await this.auth.waitForInit();
    void this.loadPage();
  }

  async loadPage() {
    this.loading.set(true);
    this.page = 0;
    try {
      const { users, hasMore } = await this.community.getExploreUsers(0);
      this.users.set(users);
      this.hasMore.set(hasMore);
    } catch (e) {
      console.error('No se pudieron cargar los jugadores', e);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore() {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    try {
      const { users, hasMore } = await this.community.getExploreUsers(this.page + 1);
      this.page++;
      this.users.update((prev) => [...prev, ...users]);
      this.hasMore.set(hasMore);
    } catch (e) {
      console.error(e);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Seguir / dejar de seguir (pulsar otra vez deja de seguir). */
  async follow(uid: string) {
    const me = this.community.getCurrentUser();
    if (!me || me.uid === uid) return;
    const target = this.users().find((u) => u.uid === uid);
    const wasFollowing = !!target && this.isFollowing(target);
    const setFollowing = (on: boolean) =>
      this.users.update((list) => list.map((u) => (u.uid === uid ? { ...u, followers: on ? [me.uid] : [] } : u)));
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) await this.community.unfollowUser(me.uid, uid);
      else await this.community.followUser(me.uid, uid);
    } catch (e) {
      setFollowing(wasFollowing);
      console.error(e);
    }
  }

  isFollowing(user: UserProfile): boolean {
    const me = this.community.getCurrentUser();
    return !!(me && (user.followers || []).includes(me.uid));
  }

  getHandle(p: UserProfile): string {
    const name = p?.displayName || p?.email?.split('@')[0] || 'user';
    return '@' + name.replace(/\s+/g, '').toLowerCase().slice(0, 16);
  }
}

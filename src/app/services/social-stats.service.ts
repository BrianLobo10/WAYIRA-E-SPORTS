import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import { environment } from '../../environments/environment';
import { firstValueFrom, Subscription } from 'rxjs';

export interface SocialStats {
  discord: number | null;
  twitch: number | null;
  instagram: number | null;
  registeredUsers: number | null;
  twitchLive?: boolean | null;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SocialStatsService implements OnDestroy {
  private http = inject(HttpClient);
  private firestore = inject(Firestore);
  private firestoreUnsub: (() => void) | null = null;

  stats = signal<SocialStats | null>(null);
  loading = signal(false);
  private lastFetch = 0;
  private readonly cacheMs = 5 * 60 * 1000;

  constructor() {
    this.watchFirestore();
  }

  ngOnDestroy() {
    this.firestoreUnsub?.();
  }

  private watchFirestore() {
    const ref = doc(this.firestore, 'config/socialStats');
    this.firestoreUnsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<SocialStats>;
        this.stats.update((current) => ({
          discord: data.discord ?? current?.discord ?? null,
          twitch: data.twitch ?? current?.twitch ?? null,
          instagram: data.instagram ?? current?.instagram ?? null,
          registeredUsers: data.registeredUsers ?? current?.registeredUsers ?? null,
          twitchLive: data.twitchLive ?? current?.twitchLive ?? null,
          updatedAt: data.updatedAt ?? current?.updatedAt
        }));
      },
      () => {}
    );
  }

  async load(force = false): Promise<SocialStats | null> {
    const now = Date.now();
    if (!force && this.stats() && now - this.lastFetch < this.cacheMs) {
      return this.stats();
    }
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<SocialStats>(`${environment.apiUrl}/social-stats`)
      );
      this.stats.set(data);
      this.lastFetch = now;
      return data;
    } catch {
      return this.stats();
    } finally {
      this.loading.set(false);
    }
  }

  formatCount(value: number | null | undefined, fallback = '—'): string {
    if (value == null || Number.isNaN(value)) return fallback;
    if (value >= 1_000_000) {
      const m = value / 1_000_000;
      return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
    }
    if (value >= 10_000) {
      return `${Math.round(value / 1000)}K`;
    }
    if (value >= 1000) {
      const k = value / 1000;
      return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
    }
    return value.toLocaleString('es-CO');
  }
}

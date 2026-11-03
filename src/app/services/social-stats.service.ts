import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
export class SocialStatsService {
  private http = inject(HttpClient);

  stats = signal<SocialStats | null>(null);
  loading = signal(false);
  private lastFetch = 0;
  private readonly cacheMs = 5 * 60 * 1000;

  async load(force = false): Promise<SocialStats | null> {
    const now = Date.now();
    if (!force && this.stats() && now - this.lastFetch < this.cacheMs) {
      return this.stats();
    }
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<SocialStats>(`${environment.supabase.functionsUrl}/social/stats`)
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

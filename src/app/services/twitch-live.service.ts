import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

interface TwitchLiveResponse {
  live: boolean;
  channel?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class TwitchLiveService implements OnDestroy {
  private http = inject(HttpClient);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollMs = 30_000;

  isLive = signal(false);
  loading = signal(false);

  startPolling(): void {
    if (this.pollTimer) return;
    void this.refresh(true);
    this.pollTimer = setInterval(() => void this.refresh(false), this.pollMs);
  }

  stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  async refresh(force = false): Promise<boolean> {
    if (this.loading() && !force) return this.isLive();
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<TwitchLiveResponse>(`${environment.apiUrl}/twitch/live`)
      );
      this.isLive.set(!!data.live);
      return this.isLive();
    } catch {
      this.isLive.set(false);
      return false;
    } finally {
      this.loading.set(false);
    }
  }
}

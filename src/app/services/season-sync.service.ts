import { Injectable, inject, signal } from '@angular/core';
import { RiotApiService, SlimMatch } from './riot-api.service';

/**
 * Descarga la temporada de un jugador (por tandas) y la deja lista para el dashboard.
 * Vive en toda la app (no en la página): si el usuario va a otra página, la descarga sigue,
 * y al volver al perfil la barra continúa donde iba. Si recarga, retoma desde lo guardado en Supabase.
 */
export type SeasonPhase = 'checking' | 'syncing' | 'ready' | 'error';
export interface SeasonState {
  phase: SeasonPhase;
  stored: number;
  total: number;
  pending: number;
  limited: boolean;
  busy: boolean;
  matches: SlimMatch[] | null;
}

const SYNC_DELAY_MS = 15_000;     // entre tandas (la clave Personal permite 100 consultas cada 2 min)
const LIMITED_DELAY_MS = 60_000;  // si Riot pidió esperar
export const SYNC_BATCH = 12;

@Injectable({ providedIn: 'root' })
export class SeasonSyncService {
  private riot = inject(RiotApiService);
  private states = signal<Record<string, SeasonState>>({});
  private running = new Set<string>();
  private refreshedAt: Record<string, number> = {};

  /** Estado actual de un jugador (null si nunca se pidió) */
  state(puuid: string | null | undefined): SeasonState | null {
    return puuid ? this.states()[puuid] ?? null : null;
  }

  /** Arranca (o reanuda) la descarga. Llamarlo varias veces no duplica nada. */
  ensure(region: string, puuid: string) {
    if (!region || !puuid || this.running.has(puuid)) return;
    const current = this.state(puuid);
    // Ya completa y revisada hace poco: no se vuelve a preguntar
    if (current?.phase === 'ready' && Date.now() - (this.refreshedAt[puuid] ?? 0) < 5 * 60_000) return;
    if (!current) this.patch(puuid, { phase: 'checking', stored: 0, total: 0, pending: 0, limited: false, busy: false, matches: null });
    this.running.add(puuid);
    this.step(region, puuid, 0);
  }

  private patch(puuid: string, change: Partial<SeasonState>) {
    this.states.update((all) => ({ ...all, [puuid]: { ...(all[puuid] ?? ({} as SeasonState)), ...change } }));
  }

  private step(region: string, puuid: string, round: number) {
    this.riot.syncSeason(region, puuid).subscribe({
      next: (s) => {
        if (s.busy) {
          // Otra pestaña está descargando este jugador
          if (this.state(puuid)?.phase !== 'ready') this.patch(puuid, { phase: 'syncing', busy: true });
          this.later(region, puuid, round, SYNC_DELAY_MS);
          return;
        }
        const pending = s.pending ?? 0;
        const stored = s.stored ?? 0;
        const total = Math.max(s.total ?? 0, stored);
        const wasReady = this.state(puuid)?.phase === 'ready';
        this.patch(puuid, { stored, total, pending, limited: !!s.limited, busy: false, ...(pending > 0 && !wasReady ? { phase: 'syncing' } : {}) });
        if (pending > 0) this.later(region, puuid, round + 1, s.limited ? LIMITED_DELAY_MS : SYNC_DELAY_MS);
        else this.finish(region, puuid);
      },
      error: () => {
        // Riot o la red fallan: se muestra lo que ya está guardado y se reintenta más tarde
        if (round === 0) this.finish(region, puuid);
        else this.later(region, puuid, round + 1, LIMITED_DELAY_MS);
      },
    });
  }

  private later(region: string, puuid: string, round: number, ms: number) {
    setTimeout(() => this.step(region, puuid, round), ms);
  }

  private finish(region: string, puuid: string) {
    this.riot.getSeasonHistory(region, puuid).subscribe({
      next: (list) => {
        this.patch(puuid, { phase: 'ready', matches: list ?? [] });
        this.refreshedAt[puuid] = Date.now();
        this.running.delete(puuid);
      },
      error: () => {
        this.patch(puuid, { phase: 'error' });
        this.running.delete(puuid);
      },
    });
  }
}

import { Component, computed, inject, input, OnDestroy, output, signal, effect, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { RiotApiService, SlimMatch } from '../../services/riot-api.service';
import { Game, MODE_FILTERS, ModeFilter, Point, computeStats, filterGames, toGames } from './season-stats';

import { championIconUrl } from '../../utils/riot-assets';
interface LineGeom { last: string; average: string; path: string; area: string; avgY: number; dots: { x: number; y: number; tip: string }[]; ticks: { y: number; label: string }[]; labels: { x: number; label: string }[] }

const SYNC_BATCH = 12;
const SYNC_DELAY_MS = 15_000;     // entre lotes (la clave Personal permite 100 consultas cada 2 min)
const LIMITED_DELAY_MS = 60_000;  // si Riot pidió esperar

@Component({
  selector: 'app-profile-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './profile-dashboard.component.html',
  styleUrls: ['./profile-dashboard.component.css'],
})
export class ProfileDashboardComponent implements OnDestroy {
  private riot = inject(RiotApiService);

  region = input.required<string>();
  puuid = input.required<string>();
  gameName = input<string>('');
  tagLine = input<string>('');
  /** Todas las partidas de la temporada (para la línea de actividad del perfil) */
  seasonGames = output<Game[]>();
  /** Avance de la descarga de la temporada (para avisar en otras tarjetas del perfil) */
  syncProgress = output<{ stored: number; total: number; pending: number }>();

  readonly filters = MODE_FILTERS;
  readonly year = new Date().getFullYear();
  filterKey = signal('ranked');
  matches = signal<SlimMatch[]>([]);
  loaded = signal(false);
  /** checking: primera consulta · syncing: descargando la temporada (barra de carga) · ready: datos completos */
  phase = signal<'checking' | 'syncing' | 'ready'>('checking');
  error = signal('');
  sync = signal<{ stored: number; total: number; pending: number; limited: boolean } | null>(null);
  showTable = signal(false);

  private subs = new Subscription();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  allGames = computed(() => toGames(this.matches(), this.puuid(), this.gameName(), this.tagLine()));
  counts = computed(() => {
    const all = this.allGames();
    return Object.fromEntries(this.filters.map((f) => [f.key, filterGames(all, f).length])) as Record<string, number>;
  });
  visibleFilters = computed(() => this.filters.filter((f) => f.key === 'all' || f.key === 'ranked' || this.counts()[f.key] > 0));
  filter = computed<ModeFilter>(() => this.filters.find((f) => f.key === this.filterKey()) ?? this.filters[0]);
  games = computed(() => filterGames(this.allGames(), this.filter()));
  stats = computed(() => (this.games().length ? computeStats(this.games()) : null));
  progress = computed(() => {
    const s = this.sync();
    return s && s.total ? Math.min(100, Math.round((s.stored / s.total) * 100)) : 0;
  });
  /** Minutos aproximados que faltan (12 partidas cada 15 s) */
  eta = computed(() => {
    const p = this.sync()?.pending ?? 0;
    const sec = Math.ceil(p / SYNC_BATCH) * (SYNC_DELAY_MS / 1000);
    return sec < 60 ? 'menos de un minuto' : `unos ${Math.ceil(sec / 60)} min`;
  });

  // Geometría de las gráficas (SVG propio, sin librerías)
  /** Mapa semanal: celdas con intensidad por cantidad de partidas */
  readonly dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  readonly hours = Array.from({ length: 24 }, (_, h) => h);
  heatMax = computed(() => Math.max(1, ...(this.stats()?.heat ?? []).flat().map((c) => c.games)));
  bestRecordIndex = 0;

  wrLine = computed(() => this.line(this.stats()?.sessionWinRate ?? [], '%', true));
  goldLine = computed(() => this.line(this.stats()?.sessionGold ?? [], '', false));
  kpLine = computed(() => this.line(this.stats()?.sessionKp ?? [], '%', false));
  visionLine = computed(() => this.line(this.stats()?.sessionVision ?? [], '', false));

  constructor() {
    // Cuando cambia el jugador, se carga lo guardado y se descarga lo que falte
    effect(() => {
      const region = this.region(); const puuid = this.puuid();
      untracked(() => this.start(region, puuid));
    });
    effect(() => {
      const games = this.allGames();
      // Solo cuando la temporada está completa: así la actividad del perfil no cambia a medias
      if (this.phase() === 'ready' && this.loaded()) untracked(() => this.seasonGames.emit(games));
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.subs.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
  }

  private start(region: string, puuid: string) {
    this.subs.unsubscribe();
    this.subs = new Subscription();
    if (this.timer) clearTimeout(this.timer);
    this.loaded.set(false);
    this.phase.set('checking');
    this.matches.set([]);
    this.sync.set(null);
    this.error.set('');
    // Primero se pregunta qué falta; si falta algo se muestra la barra (y se retoma donde quedó tras recargar)
    this.runSync(region, puuid);
  }

  private finish(region: string, puuid: string) {
    this.loadHistory(region, puuid, () => this.phase.set('ready'));
  }

  private loadHistory(region: string, puuid: string, then?: () => void) {
    this.subs.add(this.riot.getSeasonHistory(region, puuid).subscribe({
      next: (list) => { this.matches.set(list ?? []); this.loaded.set(true); then?.(); },
      error: () => { this.loaded.set(true); this.error.set('No pudimos cargar las estadísticas. Intenta de nuevo en unos minutos.'); },
    }));
  }

  private runSync(region: string, puuid: string, round = 0) {
    if (this.destroyed) return;
    this.subs.add(this.riot.syncSeason(region, puuid).subscribe({
      next: (s) => {
        if (s.busy) {
          // Otra pestaña está descargando este perfil: se muestra la barra y se espera
          if (this.phase() !== 'ready') this.phase.set('syncing');
          this.schedule(() => this.runSync(region, puuid, round), SYNC_DELAY_MS);
          return;
        }
        const pending = s.pending ?? 0;
        const total = Math.max(s.total ?? 0, s.stored ?? 0);
        this.sync.set({ stored: s.stored ?? 0, total, pending, limited: s.limited });
        this.syncProgress.emit({ stored: s.stored ?? 0, total, pending });
        if (pending > 0) {
          if (this.phase() !== 'ready') this.phase.set('syncing');
          this.schedule(() => this.runSync(region, puuid, round + 1), s.limited ? LIMITED_DELAY_MS : SYNC_DELAY_MS);
        } else {
          this.finish(region, puuid);
        }
      },
      error: () => {
        // Si Riot no responde, se muestra lo que ya está guardado
        if (round === 0) this.finish(region, puuid);
        else this.schedule(() => this.runSync(region, puuid, round + 1), LIMITED_DELAY_MS);
      },
    }));
  }

  private schedule(fn: () => void, ms: number) {
    if (this.destroyed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  champIcon(champId: number) { return championIconUrl(champId); }

  private dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' });
  dateLabel(ts: number) { return this.dateFmt.format(new Date(ts)).replace('.', ''); }

  pct(v: number | null) { return v === null ? '—' : `${v}%`; }

  heatLevel(games: number): number {
    if (!games) return 0;
    return Math.min(4, Math.ceil((games / this.heatMax()) * 4));
  }

  heatTip(day: string, hour: number, c: { games: number; wins: number }): string {
    if (!c.games) return `${day} ${hour}:00 · sin partidas`;
    return `${day} ${hour}:00 · ${c.games} partida${c.games === 1 ? '' : 's'} · ${Math.round((c.wins / c.games) * 100)}% de victorias`;
  }

  /** Ancho de la barra de duración (para la lista horizontal) */
  share(games: number): number {
    const max = Math.max(1, ...(this.stats()?.byDuration ?? []).map((b) => b.games));
    return (games / max) * 100;
  }

  private line(points: Point[], unit: string, fixed100: boolean): LineGeom | null {
    if (points.length < 2) return null;
    const width = 240, height = 96, padL = 4, padB = 4, padT = 8;
    const plotW = width - padL - 8, plotH = height - padB - padT;
    const vals = points.map((p) => p.value);
    let min = fixed100 ? 0 : Math.min(...vals), max = fixed100 ? 100 : Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const padV = fixed100 ? 0 : (max - min) * 0.15;
    min -= padV; max += padV;
    const x = (i: number) => padL + (i / (points.length - 1)) * plotW;
    const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area = `${path} L${x(points.length - 1).toFixed(1)},${padT + plotH} L${padL},${padT + plotH} Z`;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());
    return {
      last: fmt(points[points.length - 1].value) + unit, average: fmt(avg) + unit,
      path, area, avgY: y(avg),
      dots: points.map((p, i) => ({ x: x(i), y: y(p.value), tip: `Sesión del ${p.label}: ${fmt(p.value)}${unit}` })),
      ticks: [max - padV, (max + min) / 2, min + padV].map((v) => ({ y: y(v), label: fmt(v) + unit })),
      labels: points.map((p, i) => ({ x: x(i), label: i === 0 || i === points.length - 1 ? p.label : '' })),
    };
  }
}

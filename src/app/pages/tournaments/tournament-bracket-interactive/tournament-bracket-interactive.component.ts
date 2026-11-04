import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, debounceTime, Subject } from 'rxjs';
import type { BracketMatch, Tournament } from '../../../models';
import { TournamentService } from '../../../services/tournament.service';
import { TournamentBracketEngineService } from '../../../services/tournament-bracket-engine.service';
import { ToastService } from '../../../services/toast.service';

/** Partido ubicado en el lienzo (en píxeles). */
export interface BracketVisualNode {
  match: BracketMatch;
  x: number;
  y: number;
  layer: 'upper' | 'lower';
}

/** Conector entre un partido y el siguiente. `done` = el partido de origen ya tiene ganador. */
export interface BracketConnectorPath {
  id: string;
  d: string;
  layer: 'upper' | 'lower';
  done: boolean;
}

export interface BracketColumnLabel {
  x: number;
  y: number;
  label: string;
}

/** Medidas del bracket (px). Tarjetas grandes y legibles, columnas de izquierda a derecha. */
const CARD_W = 232;
const ROW_H = 36;
const CARD_H = ROW_H * 2;
const V_GAP = 20;
const COL_GAP = 64;
const PAD = 32;
const HEAD_H = 44;
const SECTION_GAP = 64;
/** Máximo de pasos que se pueden deshacer. */
const HISTORY_LIMIT = 60;

@Component({
  selector: 'app-tournament-bracket-interactive',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tournament-bracket-interactive.component.html',
  styleUrl: './tournament-bracket-interactive.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TournamentBracketInteractiveComponent implements OnInit, OnDestroy {
  private readonly toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firebase = inject(TournamentService);
  private engine: TournamentBracketEngineService = inject(TournamentBracketEngineService);

  readonly cardW = CARD_W;
  readonly rowH = ROW_H;
  @ViewChild('scrollHost') scrollHost?: ElementRef<HTMLDivElement>;

  tournament = signal<Tournament | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  spectator = signal(false);
  editable = signal(false);
  zoom = signal(1);
  grandFinalBestOf = signal<1 | 3>(3);
  redemptionFinalBestOf = signal<1 | 3>(3);

  private save$ = new Subject<void>();
  private sub = new Subscription();
  /** Evita duplicar incremento de victorias al persistir varias veces */
  private lastPersistedStatus: string | null = null;

  private layout = computed(() => this.buildLayout(this.tournament()));
  nodes = computed(() => this.layout().nodes);
  paths = computed(() => this.layout().paths);
  columns = computed(() => this.layout().columns);
  sections = computed(() => this.layout().sections);
  stageW = computed(() => this.layout().width);
  stageH = computed(() => this.layout().height);

  /** Historial para deshacer / rehacer (solo en esta sesión del navegador). */
  private past = signal<Tournament[]>([]);
  private future = signal<Tournament[]>([]);
  canUndo = computed(() => this.editable() && this.past().length > 0);
  canRedo = computed(() => this.editable() && this.future().length > 0);
  lastAction = signal<string | null>(null);
  /** Campeón guardado la última vez, para descontar la victoria si se deshace el cierre del torneo. */
  private lastPersistedChampion: { id?: string; name?: string } = {};

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('tournamentId');
    const view = this.route.snapshot.queryParamMap.get('view');
    this.spectator.set(view === 'spectator');

    this.sub.add(
      this.save$.pipe(debounceTime(400)).subscribe(() => {
        void this.persistNow();
      })
    );

    if (!id) {
      this.error.set('Torneo no encontrado');
      this.loading.set(false);
      return;
    }

    this.sub.add(
      this.firebase.getTournamentById(id).subscribe(async (t: Tournament | null) => {
        if (!t) {
          this.error.set('No se pudo cargar el torneo');
          this.loading.set(false);
          return;
        }
        if (!t.confirmed || !t.bracket?.length) {
          this.error.set('Este torneo aún no tiene bracket confirmado');
          this.loading.set(false);
          return;
        }
        this.tournament.set(t);
        this.grandFinalBestOf.set(t.grandFinalBestOf === 1 ? 1 : 3);
        this.redemptionFinalBestOf.set(t.redemptionFinalBestOf === 1 ? 1 : 3);
        this.lastPersistedStatus = t.status ?? null;
        this.lastPersistedChampion = { id: t.championTeamId, name: t.championTeamName };
        const user = this.firebase.getCurrentUser();
        if (user) {
          const admin = await this.firebase.isAdmin(user.uid);
          this.editable.set(admin && !this.spectator());
        } else {
          this.editable.set(false);
        }
        this.loading.set(false);
        // Si el bracket es más ancho que la pantalla, se ajusta para verlo completo
        setTimeout(() => this.fitToScreen(true));
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  setZoom(delta: number) {
    const z = Math.min(1.6, Math.max(0.4, this.zoom() + delta));
    this.zoom.set(Math.round(z * 100) / 100);
  }

  /** Ajusta el zoom para que el bracket quepa a lo ancho (sin agrandar más del 100 % al abrir). */
  fitToScreen(onlyShrink = false) {
    const host = this.scrollHost?.nativeElement;
    if (!host || !this.stageW()) return;
    let z = (host.clientWidth - 8) / this.stageW();
    if (onlyShrink) z = Math.min(1, z);
    this.zoom.set(Math.round(Math.min(1.6, Math.max(0.4, z)) * 100) / 100);
  }

  // ---------------------------------------------------------------------------
  // Deshacer / rehacer
  // ---------------------------------------------------------------------------

  /** Guarda el estado actual en el historial y aplica el nuevo. */
  private commit(next: Tournament, action: string) {
    const current = this.tournament();
    if (current) this.past.update((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current]);
    this.future.set([]);
    this.tournament.set(next);
    this.lastAction.set(action);
    this.save$.next();
  }

  undo() {
    const past = this.past();
    const current = this.tournament();
    if (!this.editable() || !past.length || !current) return;
    this.future.update((f) => [current, ...f]);
    this.past.set(past.slice(0, -1));
    this.tournament.set(past[past.length - 1]);
    this.lastAction.set('Cambio deshecho');
    this.save$.next();
  }

  redo() {
    const [next, ...rest] = this.future();
    const current = this.tournament();
    if (!this.editable() || !next || !current) return;
    this.past.update((p) => [...p, current]);
    this.future.set(rest);
    this.tournament.set(next);
    this.lastAction.set('Cambio rehecho');
    this.save$.next();
  }

  /** Ctrl+Z deshace, Ctrl+Y o Ctrl+Shift+Z rehace. */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      this.redo();
    }
  }

  async setGrandFinalMode(mode: 1 | 3) {
    this.grandFinalBestOf.set(mode);
    const t = this.tournament();
    if (!t?.id || !this.editable()) return;
    try {
      await this.firebase.updateTournament(t.id, { grandFinalBestOf: mode });
      this.tournament.set({ ...t, grandFinalBestOf: mode });
    } catch {
      this.toast.notify('No se pudo guardar el formato de final');
    }
  }

  async setRedemptionFinalMode(mode: 1 | 3) {
    this.redemptionFinalBestOf.set(mode);
    const t = this.tournament();
    if (!t?.id || !this.editable()) return;
    try {
      await this.firebase.updateTournament(t.id, { redemptionFinalBestOf: mode });
      this.tournament.set({ ...t, redemptionFinalBestOf: mode });
    } catch {
      this.toast.notify('No se pudo guardar el formato de final de redención');
    }
  }

  pickWinner(matchId: string, winnerId: string) {
    if (!this.editable()) return;
    const t = this.tournament();
    if (!t || t.status === 'finished') return;
    const effective: Tournament = {
      ...t,
      grandFinalBestOf: this.grandFinalBestOf(),
      redemptionFinalBestOf: this.redemptionFinalBestOf()
    };
    const res = this.engine.applyBo3MapWin(effective, matchId, winnerId);
    if (!res) return;
    let next: Tournament = { ...effective, bracket: res.bracket, lowerBracket: res.lowerBracket };
    next = this.engine.finalizeTournamentIfComplete(next);
    const m = [...(t.bracket || []), ...(t.lowerBracket || [])].find((x) => x.id === matchId);
    const name = m?.team1Id === winnerId ? m?.team1Name : m?.team2Name;
    this.commit(next, `Punto para ${name ?? 'el equipo'}`);
  }

  swapSides(matchId: string) {
    if (!this.editable()) return;
    const t = this.tournament();
    if (!t?.bracket) return;
    const res = this.engine.swapTeamsInMatch(t.bracket, t.lowerBracket || [], matchId);
    if (!res) return;
    this.commit({ ...t, bracket: res.bracket, lowerBracket: res.lowerBracket }, 'Lados intercambiados');
  }

  onDragStart(event: DragEvent, matchId: string, slot: 'team1' | 'team2') {
    if (!this.editable()) return;
    event.dataTransfer?.setData('application/x-bracket', JSON.stringify({ matchId, slot }));
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent) {
    if (!this.editable()) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, targetMatchId: string, targetSlot: 'team1' | 'team2') {
    event.preventDefault();
    if (!this.editable()) return;
    const raw = event.dataTransfer?.getData('application/x-bracket');
    if (!raw) return;
    let payload: { matchId: string; slot: 'team1' | 'team2' };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.matchId === targetMatchId && payload.slot === targetSlot) return;
    const t = this.tournament();
    if (!t?.bracket) return;
    const b = t.bracket.map((m: BracketMatch) => ({ ...m }));
    const l = (t.lowerBracket || []).map((m: BracketMatch) => ({ ...m }));

    const getM = (id: string) =>
      b.find((x: BracketMatch) => x.id === id) || l.find((x: BracketMatch) => x.id === id);
    const src = getM(payload.matchId);
    const dst = getM(targetMatchId);
    if (!src || !dst) return;

    const sKey = payload.slot === 'team1' ? 'team1Id' : 'team2Id';
    const sName = payload.slot === 'team1' ? 'team1Name' : 'team2Name';
    const tKey = targetSlot === 'team1' ? 'team1Id' : 'team2Id';
    const tName = targetSlot === 'team1' ? 'team1Name' : 'team2Name';

    const aId = src[sKey];
    const aNa = src[sName];
    const bId = dst[tKey];
    const bNa = dst[tName];

    const srcList = b.some((x: BracketMatch) => x.id === src.id) ? b : l;
    const dstList = b.some((x: BracketMatch) => x.id === dst.id) ? b : l;
    const si = srcList.findIndex((x: BracketMatch) => x.id === src.id);
    const di = dstList.findIndex((x: BracketMatch) => x.id === dst.id);
    if (si === -1 || di === -1) return;

    srcList[si] = { ...srcList[si], [sKey]: bId, [sName]: bNa ?? 'TBD' };
    dstList[di] = { ...dstList[di], [tKey]: aId, [tName]: aNa ?? 'TBD' };

    this.commit({ ...t, bracket: b, lowerBracket: l }, 'Equipo movido');
  }

  private async persistNow() {
    const t = this.tournament();
    if (!t?.id || !this.editable()) return;
    const prev = this.lastPersistedStatus;
    try {
      const payload: Record<string, unknown> = {
        bracket: this.engine.sanitizeBracketForFirestore(t.bracket || []) as any,
        lowerBracket: this.engine.sanitizeBracketForFirestore(t.lowerBracket || []) as any,
        grandFinalBestOf: this.grandFinalBestOf(),
        redemptionFinalBestOf: this.redemptionFinalBestOf()
      };
      // Estado y campeones siempre: así deshacer el cierre del torneo también lo reabre
      payload['status'] = t.status;
      payload['finishedAt'] = t.status === 'finished' ? t.finishedAt : null;
      payload['championTeamId'] = t.championTeamId;
      payload['championTeamName'] = t.championTeamName;
      payload['redemptionChampionTeamId'] = t.redemptionChampionTeamId;
      payload['redemptionChampionTeamName'] = t.redemptionChampionTeamName;
      await this.firebase.updateTournament(t.id, payload as any);
      if (t.status === 'finished' && prev !== 'finished' && t.championTeamId) {
        await this.firebase.incrementTeamTournamentWins(t.championTeamId, t.championTeamName ?? '—');
      } else if (prev === 'finished' && t.status !== 'finished' && this.lastPersistedChampion.id) {
        await this.firebase.decrementTeamTournamentWins(this.lastPersistedChampion.id);
      }
      this.lastPersistedStatus = t.status ?? null;
      this.lastPersistedChampion = { id: t.championTeamId, name: t.championTeamName };
    } catch (e) {
      console.error(e);
      this.lastAction.set('No se pudo guardar el último cambio. Revisa tu conexión.');
    }
  }

  goBack() {
    this.router.navigate(['/tournaments']);
  }

  isGrandFinal(m: BracketMatch): boolean {
    return this.engine.isGrandFinalMatch(m, this.tournament());
  }

  isLowerFinal(m: BracketMatch): boolean {
    return this.engine.isLowerFinalMatch(m);
  }

  /** Etiqueta mostrada: corrige GF / final redención aunque Firestore traiga "Final" o "Redención N". */
  displayRoundLabel(m: BracketMatch): string {
    const t = this.tournament();
    if (t && this.engine.isGrandFinalMatch(m, t)) return 'Gran Final';
    if (this.engine.isLowerFinalMatch(m)) return 'Final Redención';
    return (m.roundLabel || m.round) as string;
  }

  showBo3Ui(m: BracketMatch): boolean {
    const t = this.tournament();
    if (!t) return false;
    if (this.engine.isGrandFinalMatch(m, t)) return (t.grandFinalBestOf ?? 3) === 3;
    if (this.engine.isLowerFinalMatch(m)) return (t.redemptionFinalBestOf ?? 3) === 3;
    return false;
  }

  trackById = (_: number, n: BracketVisualNode) => n.match.id;

  /** Partido con resultado (Bo3: puntos por mapa). */
  score(m: BracketMatch, side: 1 | 2): number | null {
    const v = side === 1 ? m.score1 : m.score2;
    if (!m.team1Id || !m.team2Id) return null;
    return (m.bestOf ?? 1) > 1 || this.showBo3Ui(m) || m.winnerId ? (v ?? 0) : null;
  }

  canPick(m: BracketMatch, t: Tournament): boolean {
    return this.editable() && t.status !== 'finished' && !!m.team1Id && !!m.team2Id && !m.winnerId;
  }

  /**
   * Bracket clásico de izquierda a derecha:
   * - Superior arriba (octavos → … → gran final), redención debajo.
   * - Cada partido queda a la altura media de los dos que lo alimentan, así las líneas son limpias.
   */
  private buildLayout(t: Tournament | null) {
    const empty = { nodes: [] as BracketVisualNode[], paths: [] as BracketConnectorPath[], columns: [] as BracketColumnLabel[],
      sections: [] as { label: string; y: number }[], width: 0, height: 0 };
    if (!t?.bracket?.length) return empty;

    const nodes: BracketVisualNode[] = [];
    const columns: BracketColumnLabel[] = [];
    const sections: { label: string; y: number }[] = [];
    const center = new Map<string, number>();
    let maxCols = 0;

    const placeSection = (matches: BracketMatch[], layer: 'upper' | 'lower', top: number): number => {
      const byRound = this.groupMatchesByRound(matches);
      const rounds = [...byRound.keys()].sort((a, b) => a - b);
      maxCols = Math.max(maxCols, rounds.length);
      let bottom = top;
      rounds.forEach((r, col) => {
        const row = byRound.get(r)!;
        const x = PAD + col * (CARD_W + COL_GAP);
        const label = this.columnLabel(row[0], t);
        columns.push({ x, y: top, label });
        let cursor = top + HEAD_H; // siguiente hueco libre de la columna
        row.forEach((m, i) => {
          // Alimentadores de la misma sección (el perdedor que baja del superior no cuenta)
          const feeders = matches.filter((f) => f.nextMatchId === m.id && center.has(f.id)).map((f) => center.get(f.id)!);
          let cy = feeders.length
            ? feeders.reduce((a, b) => a + b, 0) / feeders.length
            : top + HEAD_H + i * (CARD_H + V_GAP) + CARD_H / 2;
          cy = Math.max(cy, cursor + CARD_H / 2); // nunca encimar tarjetas
          center.set(m.id, cy);
          cursor = cy + CARD_H / 2 + V_GAP;
          nodes.push({ match: m, x, y: cy - CARD_H / 2, layer });
          bottom = Math.max(bottom, cy + CARD_H / 2);
        });
      });
      return bottom;
    };

    const upper = (t.bracket || []).filter((m) => m.bracketType !== 'lower');
    const lower = t.lowerBracket || [];
    const hasLower = lower.length > 0;

    if (hasLower) sections.push({ label: 'Bracket superior', y: PAD });
    const upperTop = PAD + (hasLower ? 28 : 0);
    let height = placeSection(upper, 'upper', upperTop);
    if (hasLower) {
      const lowerTop = height + SECTION_GAP;
      sections.push({ label: 'Bracket de redención', y: lowerTop });
      height = placeSection(lower, 'lower', lowerTop + 28);
    }

    // Conectores: borde derecho del partido → fila (equipo 1 o 2) del siguiente
    const byId = new Map(nodes.map((n) => [n.match.id, n]));
    const paths: BracketConnectorPath[] = [];
    for (const n of nodes) {
      const next = n.match.nextMatchId ? byId.get(n.match.nextMatchId) : undefined;
      if (!next || next.layer !== n.layer || next.x <= n.x) continue;
      const x0 = n.x + CARD_W;
      const y0 = n.y + CARD_H / 2;
      const x1 = next.x;
      const y1 = next.y + (n.match.nextMatchSlot === 'team2' ? ROW_H * 1.5 : ROW_H / 2);
      const xm = x0 + COL_GAP / 2;
      paths.push({
        id: `p-${n.match.id}`,
        d: `M ${x0} ${y0} H ${xm} V ${y1} H ${x1}`,
        layer: n.layer,
        done: !!n.match.winnerId
      });
    }

    return {
      nodes,
      paths,
      columns,
      sections,
      width: PAD * 2 + maxCols * CARD_W + Math.max(0, maxCols - 1) * COL_GAP,
      height: height + PAD
    };
  }

  private columnLabel(m: BracketMatch, t: Tournament): string {
    if (this.engine.isGrandFinalMatch(m, t)) return 'Gran Final';
    if (this.engine.isLowerFinalMatch(m)) return 'Final de redención';
    return (m.roundLabel || m.round || '') as string;
  }

  private groupMatchesByRound(matches: BracketMatch[]): Map<number, BracketMatch[]> {
    const byRound = new Map<number, BracketMatch[]>();
    for (const match of matches) {
      const roundIndex = match.roundIndex ?? 0;
      if (!byRound.has(roundIndex)) byRound.set(roundIndex, []);
      byRound.get(roundIndex)!.push(match);
    }
    for (const arr of byRound.values()) {
      arr.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    }
    return byRound;
  }
}

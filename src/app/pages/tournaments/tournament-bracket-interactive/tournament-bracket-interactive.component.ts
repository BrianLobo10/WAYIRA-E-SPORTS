import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, debounceTime, Subject } from 'rxjs';
import { FirebaseService, BracketMatch, Tournament } from '../../../services/firebase.service';
import { TournamentBracketEngineService } from '../../../services/tournament-bracket-engine.service';

export interface BracketVisualNode {
  match: BracketMatch;
  cx: number;
  cy: number;
  w: number;
  h: number;
  layer: 'upper' | 'lower';
}

/** Conector SVG ortogonal anclado a bordes de tarjeta */
export interface BracketConnectorPath {
  id: string;
  d: string;
  kind: 'upper' | 'lower' | 'cross';
}

/** Alto lógico del canvas (debe coincidir con viewBox y % en la plantilla). Más alto = más aire en el upper. */
const TBI_VB_H = 255;

@Component({
  selector: 'app-tournament-bracket-interactive',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tournament-bracket-interactive.component.html',
  styleUrl: './tournament-bracket-interactive.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TournamentBracketInteractiveComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firebase: FirebaseService = inject(FirebaseService);
  private engine: TournamentBracketEngineService = inject(TournamentBracketEngineService);

  readonly vbHeight = TBI_VB_H;

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

  nodes = computed(() => this.buildNodes(this.tournament()));
  paths = computed(() => this.buildPaths(this.nodes(), this.tournament()));

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
        const user = this.firebase.getCurrentUser();
        if (user) {
          const admin = await this.firebase.isAdmin(user.uid);
          this.editable.set(admin && !this.spectator());
        } else {
          this.editable.set(false);
        }
        this.loading.set(false);
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  setZoom(delta: number) {
    const z = Math.min(2, Math.max(0.5, this.zoom() + delta));
    this.zoom.set(Math.round(z * 100) / 100);
  }

  async setGrandFinalMode(mode: 1 | 3) {
    this.grandFinalBestOf.set(mode);
    const t = this.tournament();
    if (!t?.id || !this.editable()) return;
    try {
      await this.firebase.updateTournament(t.id, { grandFinalBestOf: mode });
      this.tournament.set({ ...t, grandFinalBestOf: mode });
    } catch {
      alert('No se pudo guardar el formato de final');
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
      alert('No se pudo guardar el formato de final de redención');
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
    this.tournament.set(next);
    this.save$.next();
  }

  swapSides(matchId: string) {
    if (!this.editable()) return;
    const t = this.tournament();
    if (!t?.bracket) return;
    const res = this.engine.swapTeamsInMatch(t.bracket, t.lowerBracket || [], matchId);
    if (!res) return;
    this.tournament.set({ ...t, bracket: res.bracket, lowerBracket: res.lowerBracket });
    this.save$.next();
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

    this.tournament.set({ ...t, bracket: b, lowerBracket: l });
    this.save$.next();
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
      if (t.status === 'finished') {
        payload['status'] = t.status;
        if (t.finishedAt) payload['finishedAt'] = t.finishedAt;
        if (t.championTeamId) payload['championTeamId'] = t.championTeamId;
        if (t.championTeamName) payload['championTeamName'] = t.championTeamName;
        if (t.redemptionChampionTeamId) payload['redemptionChampionTeamId'] = t.redemptionChampionTeamId;
        if (t.redemptionChampionTeamName) payload['redemptionChampionTeamName'] = t.redemptionChampionTeamName;
      }
      await this.firebase.updateTournament(t.id, payload as any);
      if (t.status === 'finished' && prev !== 'finished' && t.championTeamId) {
        await this.firebase.incrementTeamTournamentWins(t.championTeamId, t.championTeamName ?? '—');
      }
      this.lastPersistedStatus = t.status ?? null;
    } catch (e) {
      console.error(e);
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

  /**
   * Posiciones alineadas con `bracket-canvas`: rejilla por roundIndex/slotIndex
   * (misma lógica que generateBracketWithOrder en firebase.service).
   */
  private buildNodes(t: Tournament | null): BracketVisualNode[] {
    if (!t?.bracket?.length) return [];
    const upperAll = (t.bracket || []).filter((m: BracketMatch) => m.bracketType !== 'lower');
    const lowerAll = t.lowerBracket || [];
    const upper = upperAll.filter((m: BracketMatch) => !this.engine.isGrandFinalMatch(m, t));
    const grandFinal = upperAll.filter((m: BracketMatch) => this.engine.isGrandFinalMatch(m, t));

    const cardW = 5.65;
    /** Alto mínimo lógico (conectores + minHeight). Debe ser < delta cy entre octavos (~18–20 vb). */
    const upperH = 10;
    const lowerH = 8.5;
    /**
     * Franja Y del upper: S grande ⇒ más separación real entre cuadros apilados (octavos).
     * Fórmula clave: deltaCy ≈ (usableY/countPerSide/100)*S — debe superar claramente upperH.
     */
    const upperSideStripeTop = 1;
    const upperSideStripeBottom = 100;
    /** Debajo del máximo cy del upper (~84) para no montar sobre octavos/cuartos */
    const grandFinalBaseCy = 93;
    const lowerTop = 104;
    const lowerBottom = TBI_VB_H;

    const { totalRounds, powerTeams } = this.inferBracketGeometry(t);
    const sideRounds = Math.max(1, totalRounds - 1);
    /** Columnas un poco más juntas (menos hueco horizontal entre rondas). */
    const colSpread = 30;
    const xLeftBase = 10;
    const xRightBase = 90;

    const nodes: BracketVisualNode[] = [];

    const mapY01ToCyStripe = (y01: number) =>
      upperSideStripeTop + (y01 / 100) * (upperSideStripeBottom - upperSideStripeTop);

    for (const m of upper) {
      const pos = this.upperMatchColumnPosition(m, powerTeams, sideRounds, colSpread, xLeftBase, xRightBase);
      if (!pos) continue;
      nodes.push({ match: m, cx: pos.cx, cy: mapY01ToCyStripe(pos.y01), w: cardW, h: upperH, layer: 'upper' });
    }

    grandFinal.forEach((m, i) => {
      nodes.push({
        match: m,
        cx: 50,
        cy: grandFinalBaseCy + i * (upperH + 5),
        w: cardW + 1,
        h: upperH,
        layer: 'upper'
      });
    });

    if (lowerAll.length) {
      const lowerByRound = this.groupMatchesByRound(lowerAll);
      const lowerRounds = [...lowerByRound.keys()].sort((a, b) => a - b);
      const nCols = Math.max(1, lowerRounds.length);
      lowerRounds.forEach((r, colIdx) => {
        const row = [...(lowerByRound.get(r) || [])].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
        const n = row.length;
        const frac = nCols <= 1 ? 0.5 : colIdx / (nCols - 1);
        /** Redención: columnas un poco más juntas, alineado al upper más compacto en X */
        const cx = 12 + frac * 62;
        row.forEach((m, i) => {
          const vmL = 14;
          const y01 =
            n <= 1 ? 50 : vmL + ((i + 0.5) / n) * (100 - 2 * vmL);
          const cy = lowerTop + (y01 / 100) * (lowerBottom - lowerTop);
          nodes.push({ match: m, cx, cy, w: cardW, h: lowerH, layer: 'lower' });
        });
      });
    }

    return nodes;
  }

  /**
   * Winner bracket: columnas por ronda (como el lower), con más separación horizontal hacia el centro.
   */
  private upperMatchColumnPosition(
    m: BracketMatch,
    powerTeams: number,
    sideRounds: number,
    colSpread: number,
    xLeftBase: number,
    xRightBase: number
  ): { cx: number; y01: number } | null {
    const ri = m.roundIndex ?? 0;
    const si = m.slotIndex ?? 0;

    if (ri >= sideRounds) {
      return null;
    }

    const matchesThisRound = Math.max(1, powerTeams / Math.pow(2, ri + 1));
    const half = matchesThisRound / 2;
    const countPerSide = Math.max(1, half);
    const isLeft = si < half;
    const localIndex = isLeft ? si : si - half;
    /**
     * vMargin bajo + franja S alta ⇒ usableY grande ⇒ delta cy entre octavos ~18–20 vb (sin solapes).
     * (vMargin muy alto reduce usableY y aprieta octavos aunque “suene” a más margen.)
     */
    const vMargin = 12;
    const usableY = 100 - 2 * vMargin;
    const y01 = vMargin + ((localIndex + 0.5) / countPerSide) * usableY;

    const colFrac = sideRounds <= 1 ? 0 : ri / (sideRounds - 1);
    const xLeft = xLeftBase + colFrac * colSpread;
    const xRight = xRightBase - colFrac * colSpread;
    let cx = isLeft ? xLeft : xRight;

    /**
     * Ronda de 2 partidos hacia el centro (p. ej. semis de 16): sin esto cx ~48/52 y los cuadros se solapan.
     * No aplicar en ronda 0 (p. ej. 4 equipos: dos semis ya van en x extremos).
     */
    if (ri >= 1 && matchesThisRound === 2 && half === 1) {
      const semiOut = 2.4;
      cx += isLeft ? -semiOut : semiOut;
    }

    return { cx, y01 };
  }

  private inferBracketGeometry(t: Tournament): { totalRounds: number; powerTeams: number } {
    const upper = (t.bracket || []).filter(
      (m: BracketMatch) => m.bracketType !== 'lower' && !this.engine.isGrandFinalMatch(m, t)
    );
    const firstRoundCount = upper.filter((m) => (m.roundIndex ?? 0) === 0).length;
    let powerTeams: number;
    if (firstRoundCount > 0) {
      powerTeams = firstRoundCount * 2;
    } else {
      const cfg =
        typeof t.configuredRounds === 'number' && t.configuredRounds > 0
          ? t.configuredRounds
          : Math.max(1, Math.ceil(Math.log2(Math.max(2, t.maxTeams ?? (t.teams || []).length ?? 8))));
      powerTeams = Math.pow(2, cfg);
    }
    const totalRounds = Math.max(1, Math.round(Math.log2(powerTeams)));
    return { totalRounds, powerTeams };
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

  private buildPaths(nodes: BracketVisualNode[], t: Tournament | null): BracketConnectorPath[] {
    if (!t) return [];
    const map = new Map(nodes.map(n => [n.match.id, n]));
    const all = [...(t.bracket || []), ...(t.lowerBracket || [])];
    const paths: BracketConnectorPath[] = [];
    for (const m of all) {
      if (!m.nextMatchId) continue;
      const a = map.get(m.id);
      const b = map.get(m.nextMatchId);
      if (!a || !b) continue;
      const d = this.buildOrthogonalConnector(a, b);
      if (!d) continue;
      const kind =
        a.layer === 'lower' && b.layer === 'lower'
          ? 'lower'
          : a.layer === 'upper' && b.layer === 'upper'
            ? 'upper'
            : 'cross';
      paths.push({
        id: `p-${m.id}-${m.nextMatchId}`,
        d,
        kind
      });
    }
    return paths;
  }

  /**
   * Conector tipo bracket: sale por el borde que mira al siguiente nodo y entra por el borde opuesto.
   * Trazo ortogonal (codos) con segmentos H-V-H o V-H-V según la geometría.
   */
  private buildOrthogonalConnector(a: BracketVisualNode, b: BracketVisualNode): string | null {
    const aL = a.cx - a.w / 2;
    const aR = a.cx + a.w / 2;
    const aT = a.cy - a.h / 2;
    const aB = a.cy + a.h / 2;
    const bL = b.cx - b.w / 2;
    const bR = b.cx + b.w / 2;
    const bT = b.cy - b.h / 2;
    const bB = b.cy + b.h / 2;

    let x0: number;
    let y0: number;
    let x1: number;
    let y1: number;

    const dxCenter = b.cx - a.cx;
    const dyCenter = b.cy - a.cy;

    if (Math.abs(dxCenter) > 0.4) {
      if (dxCenter > 0) {
        x0 = aR;
        y0 = a.cy;
        x1 = bL;
        y1 = b.cy;
      } else {
        x0 = aL;
        y0 = a.cy;
        x1 = bR;
        y1 = b.cy;
      }
    } else {
      if (dyCenter > 0) {
        x0 = a.cx;
        y0 = aB;
        x1 = b.cx;
        y1 = bT;
      } else {
        x0 = a.cx;
        y0 = aT;
        x1 = b.cx;
        y1 = bB;
      }
    }

    const eps = 0.15;
    if (Math.abs(x1 - x0) < eps && Math.abs(y1 - y0) < eps) {
      return null;
    }

    if (Math.abs(x1 - x0) < eps) {
      return `M ${x0} ${y0} L ${x1} ${y1}`;
    }
    if (Math.abs(y1 - y0) < eps) {
      return `M ${x0} ${y0} L ${x1} ${y1}`;
    }

    const horizDominant = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    const stub = 1.2;
    if (horizDominant) {
      const dir = x1 > x0 ? 1 : -1;
      const xStart = x0 + stub * dir;
      const xEnd = x1 - stub * dir;
      const xMid = (xStart + xEnd) / 2;
      return `M ${x0} ${y0} L ${xStart} ${y0} L ${xMid} ${y0} L ${xMid} ${y1} L ${xEnd} ${y1} L ${x1} ${y1}`;
    }
    const yMid = (y0 + y1) / 2;
    return `M ${x0} ${y0} L ${x0} ${yMid} L ${x1} ${yMid} L ${x1} ${y1}`;
  }
}

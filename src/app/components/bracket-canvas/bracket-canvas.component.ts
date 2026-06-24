import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  computed,
  input,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Team } from '../../services/firebase.service';

export interface BracketSlotMatch {
  team1: Team | null;
  team2: Team | null;
  matchIndex: number;
}

interface BracketRenderMatch {
  id: string;
  side: 'left' | 'right' | 'center';
  round: number;
  x: number;
  y: number;
  width: number;
  sourceMatchIndex: number | null;
}

interface BracketPath {
  id: string;
  d: string;
  round: number;
}

@Component({
  selector: 'app-bracket-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bracket-canvas.component.html',
  styleUrls: ['./bracket-canvas.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BracketCanvasComponent {
  readonly Math = Math;

  @Input() set matches(value: BracketSlotMatch[]) {
    this.matchesInput.set(value || []);
  }
  @Input() numTeams = 8;
  @Input() editable = true;

  /**
   * Solo primera ronda (p. ej. octavos con 16 equipos): para colocar equipos sin mostrar el árbol completo.
   */
  readonly firstRoundOnly = input(false);

  @Output() slotDrop = new EventEmitter<{ matchIndex: number; slot: 'team1' | 'team2' }>();
  @Output() slotRemove = new EventEmitter<{ matchIndex: number; slot: 'team1' | 'team2' }>();

  matchesInput = signal<BracketSlotMatch[]>([]);

  powerTeams = computed(() => {
    const n = this.numTeams;
    if (n <= 2) return 2;
    const log = Math.ceil(Math.log2(n));
    return Math.min(Math.pow(2, log), 32);
  });

  firstRoundMatches = computed(() => this.powerTeams() / 2);
  totalRounds = computed(() => Math.max(1, Math.log2(this.powerTeams())));
  sideRounds = computed(() => Math.max(1, this.totalRounds() - 1));

  bracketRender = computed(() => {
    const firstRound = this.firstRoundMatches();
    const perSide = firstRound / 2;
    const sideRoundCount = this.sideRounds();
    const left: BracketRenderMatch[] = [];
    const right: BracketRenderMatch[] = [];
    /** Final debajo de las semis (misma x central) para no tapar los cuadros laterales */
    const finalY = 68;
    const center: BracketRenderMatch[] = this.firstRoundOnly()
      ? []
      : [
          {
            id: 'final',
            side: 'center',
            round: this.totalRounds() - 1,
            x: 50,
            y: finalY,
            width: 11,
            sourceMatchIndex: null
          }
        ];

    const safeDivisor = Math.max(1, sideRoundCount - 1);
    /** Más margen lateral: las rondas interiores no se acercan tanto al centro (hueco para la final) */
    const xLeftStart = 10;
    const xLeftEnd = 34;
    const xRightStart = 90;
    const xRightEnd = 66;
    let leftMatchIndex = 0;
    let rightMatchIndex = perSide;

    for (let round = 0; round < sideRoundCount; round++) {
      const count = Math.max(1, perSide / Math.pow(2, round));
      const segment = 100 / count;
      const xLeft = xLeftStart + ((xLeftEnd - xLeftStart) * round) / safeDivisor;
      const xRight = xRightStart - ((xRightStart - xRightEnd) * round) / safeDivisor;

      for (let i = 0; i < count; i++) {
        const y = i * segment + segment / 2;
        left.push({
          id: `l-r${round}-m${i}`,
          side: 'left',
          round,
          x: xLeft,
          y,
          width: 12,
          sourceMatchIndex: round === 0 ? leftMatchIndex++ : null
        });
        right.push({
          id: `r-r${round}-m${i}`,
          side: 'right',
          round,
          x: xRight,
          y,
          width: 12,
          sourceMatchIndex: round === 0 ? rightMatchIndex++ : null
        });
      }
    }

    if (this.firstRoundOnly()) {
      return {
        left: left.filter(m => m.round === 0),
        right: right.filter(m => m.round === 0),
        center
      };
    }

    return { left, right, center };
  });

  bracketPaths = computed<BracketPath[]>(() => {
    if (this.firstRoundOnly()) return [];
    const render = this.bracketRender();
    const sideRoundCount = this.sideRounds();
    const paths: BracketPath[] = [];

    for (let round = 0; round < sideRoundCount - 1; round++) {
      const currentLeft = render.left.filter(m => m.round === round);
      const nextLeft = render.left.filter(m => m.round === round + 1);
      const currentRight = render.right.filter(m => m.round === round);
      const nextRight = render.right.filter(m => m.round === round + 1);

      for (let i = 0; i < nextLeft.length; i++) {
        const top = currentLeft[i * 2];
        const bottom = currentLeft[i * 2 + 1];
        const target = nextLeft[i];
        if (top && bottom && target) {
          paths.push({
            id: `pl-${round}-${i}`,
            round,
            d: this.buildLeftConnector(top, bottom, target)
          });
        }
      }

      for (let i = 0; i < nextRight.length; i++) {
        const top = currentRight[i * 2];
        const bottom = currentRight[i * 2 + 1];
        const target = nextRight[i];
        if (top && bottom && target) {
          paths.push({
            id: `pr-${round}-${i}`,
            round,
            d: this.buildRightConnector(top, bottom, target)
          });
        }
      }
    }

    const leftSemi = render.left.find(m => m.round === sideRoundCount - 1);
    const rightSemi = render.right.find(m => m.round === sideRoundCount - 1);
    const final = render.center[0];
    if (leftSemi && final) {
      const sx = leftSemi.x + leftSemi.width / 2;
      const sy = leftSemi.y;
      const fx = final.x - final.width / 2;
      const fy = final.y;
      const joinX = (sx + fx) / 2;
      paths.push({
        id: 'p-left-final',
        round: sideRoundCount,
        d: `M ${sx} ${sy} H ${joinX} V ${fy} H ${fx}`
      });
    }
    if (rightSemi && final) {
      const sx = rightSemi.x - rightSemi.width / 2;
      const sy = rightSemi.y;
      const fx = final.x + final.width / 2;
      const fy = final.y;
      const joinX = (sx + fx) / 2;
      paths.push({
        id: 'p-right-final',
        round: sideRoundCount,
        d: `M ${sx} ${sy} H ${joinX} V ${fy} H ${fx}`
      });
    }

    return paths;
  });

  roundHeaders = computed(() => {
    if (this.firstRoundOnly()) {
      return [this.getRoundLabel(this.powerTeams())];
    }
    const sideRoundCount = this.sideRounds();
    const rounds = Array.from({ length: sideRoundCount }, (_, round) => {
      const participants = this.powerTeams() / Math.pow(2, round);
      return this.getRoundLabel(participants);
    });
    return [...rounds, 'Final'];
  });

  getMatch(matchIndex: number): BracketSlotMatch | undefined {
    return this.matchesInput().find(m => m.matchIndex === matchIndex);
  }

  isEditableMatch(match: BracketRenderMatch): boolean {
    return this.editable && match.sourceMatchIndex !== null;
  }

  getMatchState(match: BracketRenderMatch): string {
    if (match.sourceMatchIndex === null) return 'Pendiente';
    const data = this.getMatch(match.sourceMatchIndex);
    if (data?.team1 && data?.team2) return 'Listo';
    if (data?.team1 || data?.team2) return 'Parcial';
    return 'Vacío';
  }

  getDisplayTeamName(match: BracketRenderMatch, slot: 'team1' | 'team2'): string {
    if (match.sourceMatchIndex !== null) {
      const data = this.getMatch(match.sourceMatchIndex);
      const team = slot === 'team1' ? data?.team1 : data?.team2;
      return team?.name || 'Equipo';
    }
    return slot === 'team1' ? 'Ganador A' : 'Ganador B';
  }

  getDisplayScore(match: BracketRenderMatch): string {
    return match.sourceMatchIndex !== null ? '- : -' : 'TBD';
  }

  getRoundAnimationDelay(round: number): string {
    return `${120 + round * 120}ms`;
  }

  onDrop(match: BracketRenderMatch, slot: 'team1' | 'team2', event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (this.isEditableMatch(match) && match.sourceMatchIndex !== null) {
      this.slotDrop.emit({ matchIndex: match.sourceMatchIndex, slot });
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onRemove(match: BracketRenderMatch, slot: 'team1' | 'team2') {
    if (this.isEditableMatch(match) && match.sourceMatchIndex !== null) {
      this.slotRemove.emit({ matchIndex: match.sourceMatchIndex, slot });
    }
  }

  getRoundLabel(participants: number): string {
    if (participants === 32) return 'Dieciseisavos';
    if (participants === 16) return 'Octavos';
    if (participants === 8) return 'Cuartos';
    if (participants === 4) return 'Semifinal';
    if (participants === 2) return 'Final';
    return 'Ronda';
  }

  private buildLeftConnector(fromA: BracketRenderMatch, fromB: BracketRenderMatch, to: BracketRenderMatch): string {
    const startA = fromA.x + fromA.width / 2;
    const startB = fromB.x + fromB.width / 2;
    const target = to.x - to.width / 2;
    const join = (startA + target) / 2;
    return [
      `M ${startA} ${fromA.y} H ${join}`,
      `M ${startB} ${fromB.y} H ${join}`,
      `M ${join} ${fromA.y} V ${fromB.y}`,
      `M ${join} ${to.y} H ${target}`
    ].join(' ');
  }

  private buildRightConnector(fromA: BracketRenderMatch, fromB: BracketRenderMatch, to: BracketRenderMatch): string {
    const startA = fromA.x - fromA.width / 2;
    const startB = fromB.x - fromB.width / 2;
    const target = to.x + to.width / 2;
    const join = (startA + target) / 2;
    return [
      `M ${startA} ${fromA.y} H ${join}`,
      `M ${startB} ${fromB.y} H ${join}`,
      `M ${join} ${fromA.y} V ${fromB.y}`,
      `M ${join} ${to.y} H ${target}`
    ].join(' ');
  }
}

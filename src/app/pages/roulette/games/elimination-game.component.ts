import { Component, OnDestroy, computed, input, output, signal } from '@angular/core';
import { prefersReducedMotion, shuffle } from './random';

type ChipState = 'in' | 'hit' | 'out' | 'winner';

/**
 * Eliminación: los nombres van cayendo uno a uno hasta que queda el ganador.
 * El orden completo se decide al empezar (crypto); la animación solo lo revela.
 */
@Component({
  selector: 'app-elimination-game',
  standalone: true,
  template: `
    <div class="elim">
      <p class="elim__status" aria-live="polite">
        @if (running()) {
          Quedan <strong>{{ remaining() }}</strong> de {{ names().length }}
        } @else if (winner()) {
          Ganó <strong>{{ winner() }}</strong>
        } @else {
          Los nombres caerán uno por uno. El último en pie gana.
        }
      </p>

      <ul class="elim__grid" [class.elim__grid--dense]="names().length > 24">
        @for (name of names(); track $index) {
          <li class="elim__chip" [attr.data-state]="stateOf($index)">
            <span class="elim__num">{{ $index + 1 }}</span>
            <span class="elim__name">{{ name }}</span>
          </li>
        }
      </ul>

      <button type="button" class="game-btn" (click)="start()" [disabled]="running() || names().length < 2">
        {{ running() ? 'Eliminando…' : winner() ? 'Jugar otra vez' : 'Empezar eliminación' }}
      </button>
      @if (names().length < 2) {
        <p class="game-hint">Escribe al menos 2 participantes.</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .elim { display: flex; flex-direction: column; gap: 1.25rem; align-items: stretch; }
    .elim__status { margin: 0; text-align: center; color: var(--teal-muted); font-size: 1.05rem; min-height: 1.6em; }
    .elim__status strong { color: var(--white); font-variant-numeric: tabular-nums; }
    .elim__grid {
      list-style: none; margin: 0; padding: 0;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.5rem;
      max-height: 460px; overflow-y: auto; padding-right: 2px;
    }
    .elim__grid--dense { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .elim__chip {
      display: flex; align-items: center; gap: 0.5rem; min-height: 44px; padding: 0 0.75rem;
      border-radius: var(--radius-md, 2px); background: var(--surface-2); color: var(--white);
      box-shadow: inset 0 0 0 1px var(--border);
      transition: opacity 260ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1), background-color 200ms ease;
    }
    .elim__num { font-size: 0.75rem; color: var(--teal-muted); font-variant-numeric: tabular-nums; min-width: 1.5em; }
    .elim__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .elim__chip[data-state='hit'] { background: rgba(var(--ember-rgb), 0.22); box-shadow: inset 0 0 0 1px rgba(var(--ember-rgb), 0.6); animation: elim-shake 300ms ease; }
    .elim__chip[data-state='out'] { opacity: 0.28; transform: scale(0.94); }
    .elim__chip[data-state='out'] .elim__name { text-decoration: line-through; }
    .elim__chip[data-state='winner'] {
      background: var(--teal-pri); transform: scale(1.04);
      box-shadow: inset 0 0 0 2px var(--teal-accent), 0 8px 24px -8px rgba(var(--volt-rgb), 0.33);
    }
    @keyframes elim-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .elim__chip { transition: opacity 150ms ease; }
      .elim__chip[data-state='hit'] { animation: none; }
      .elim__chip[data-state='out'], .elim__chip[data-state='winner'] { transform: none; }
    }
  `],
})
export class EliminationGameComponent implements OnDestroy {
  readonly names = input.required<string[]>();
  readonly finished = output<string>();
  readonly runningChange = output<boolean>();

  readonly states = signal<ChipState[]>([]);
  readonly running = signal(false);
  readonly winner = signal<string | null>(null);
  readonly remaining = computed(() => this.states().filter((s) => s === 'in' || s === 'hit').length);

  private timer: ReturnType<typeof setTimeout> | null = null;

  stateOf(i: number): ChipState {
    return this.states().at(i) ?? 'in';
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  start() {
    const names = this.names();
    if (this.running() || names.length < 2) return;

    const order = shuffle(names.map((_, i) => i)); // el último de la lista es el ganador
    const winnerIndex = order[order.length - 1];
    const eliminations = order.slice(0, -1);
    const fast = prefersReducedMotion();
    // ~8 s en total sin importar cuántos haya; los 3 últimos más lentos para dar tensión
    const base = Math.min(1100, Math.max(fast ? 120 : 220, 7000 / eliminations.length));

    this.states.set(names.map(() => 'in'));
    this.winner.set(null);
    this.running.set(true);
    this.runningChange.emit(true);

    let step = 0;
    const next = () => {
      if (step >= eliminations.length) {
        this.states.update((s) => s.map((v, i) => (i === winnerIndex ? 'winner' : v)));
        this.winner.set(names[winnerIndex]);
        this.running.set(false);
        this.runningChange.emit(false);
        this.timer = setTimeout(() => this.finished.emit(names[winnerIndex]), 700);
        return;
      }
      const idx = eliminations[step++];
      this.states.update((s) => s.map((v, i) => (i === idx ? 'hit' : v)));
      this.timer = setTimeout(() => {
        this.states.update((s) => s.map((v, i) => (i === idx ? 'out' : v)));
        const left = eliminations.length - step;
        this.timer = setTimeout(next, left < 3 && !fast ? 1100 : base * 0.4);
      }, left3(eliminations.length - step) && !fast ? 650 : base * 0.6);
    };
    this.timer = setTimeout(next, 400);
  }
}

/** ¿Estamos en las 3 últimas eliminaciones? */
function left3(left: number): boolean {
  return left < 3;
}

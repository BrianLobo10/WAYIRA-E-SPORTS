import {
  Component, ElementRef, NgZone, OnDestroy, QueryList, ViewChild, ViewChildren, inject, input, output, signal,
} from '@angular/core';
import { GAME_COLORS, prefersReducedMotion, random, randomInt } from './random';

interface Racer {
  checkpoints: number[]; // avance acumulado (0..1) en cada tramo
  finishMs: number;      // cuándo cruza la meta
}

const CAR_WIDTH = 56;
const SEGMENTS = 8;

/**
 * Carrera de carritos: cada participante es un carro en su carril.
 * El ganador se decide al empezar (crypto) y es el que antes cruza la meta;
 * los demás llevan ritmos al azar por tramos, así hay adelantamientos.
 * La animación mueve los carros con transform (GPU) y corre fuera de Angular.
 */
@Component({
  selector: 'app-race-game',
  standalone: true,
  template: `
    <div class="race" [class.race--running]="running()" [class.race--dense]="names().length > 12">
      <p class="race__status" aria-live="polite">
        @if (running()) {
          Va primero: <strong>{{ leader() }}</strong>
        } @else if (winner()) {
          ¡<strong>{{ winner() }}</strong> cruzó primero la meta!
        } @else {
          Cada participante es un carro. El primero en llegar a la meta gana.
        }
      </p>

      <div class="race__track" role="img" [attr.aria-label]="'Pista con ' + names().length + ' carros'">
        @for (name of names(); track $index) {
          <div class="lane">
            <span class="lane__name" [title]="name">{{ name }}</span>
            <div class="lane__road" #road>
              <div class="car" #car [style.color]="color($index)" [class.car--winner]="winnerIndex() === $index">
                @if (winnerIndex() === $index) { <span class="car__badge">1°</span> }
                <!-- Carro de lado mirando a la derecha (hacia la meta): luz delantera a la derecha, roja atrás -->
                <svg viewBox="0 0 64 28" width="56" height="25" aria-hidden="true">
                  <path fill="currentColor" d="M2 20v-5q0-3 4-4l12-1 7-6q1-1 3-1h10q2 0 3 1l6 6 10 1q5 1 5 5v4q0 1-1 1H3q-1 0-1-1Z"/>
                  <path fill="rgba(236, 234, 227, 0.85)" d="M20 10l6-5h5v5Z"/>
                  <path fill="rgba(236, 234, 227, 0.85)" d="M33 5h5l6 5H33Z"/>
                  <rect x="58" y="13" width="4" height="3" rx="1" fill="#e9f7a8"/>
                  <rect x="2" y="13" width="3" height="3" rx="1" fill="#ff5a36"/>
                  <g class="wheel"><circle cx="15" cy="21" r="5.5" fill="#121211"/><path d="M15 17v8M11 21h8" stroke="#A3A19A" stroke-width="1.4"/></g>
                  <g class="wheel"><circle cx="50" cy="21" r="5.5" fill="#121211"/><path d="M50 17v8M46 21h8" stroke="#A3A19A" stroke-width="1.4"/></g>
                </svg>
              </div>
            </div>
          </div>
        }
        <div class="race__finish" aria-hidden="true"></div>
      </div>

      <button type="button" class="game-btn" (click)="start()" [disabled]="running() || names().length < 2">
        {{ running() ? 'En carrera…' : winner() ? 'Otra carrera' : '¡Arrancar!' }}
      </button>
      @if (names().length < 2) {
        <p class="game-hint">Escribe al menos 2 participantes.</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .race { display: flex; flex-direction: column; gap: 1.25rem; }
    .race__status { margin: 0; text-align: center; color: var(--teal-muted); font-size: 1.05rem; min-height: 1.6em; }
    .race__status strong { color: var(--white); }

    .race__track {
      position: relative; border-radius: var(--radius-lg, 2px); overflow: hidden auto; max-height: 540px;
      background: #141B1B; box-shadow: inset 0 0 0 1px var(--border), 0 12px 32px -12px rgba(0, 0, 0, 0.6);
      --lane-h: 46px; --name-w: 112px;
    }
    .race--dense .race__track { --lane-h: 32px; --name-w: 96px; }
    .lane { display: flex; align-items: center; height: var(--lane-h); border-bottom: 2px dashed rgba(236, 234, 227, 0.08); }
    .lane:last-of-type { border-bottom: 0; }
    .lane__name {
      flex: 0 0 var(--name-w); padding: 0 0.6rem; font-size: 0.85rem; font-weight: 600; color: var(--white);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; height: 100%; display: flex; align-items: center;
      background: rgba(0, 0, 0, 0.25); border-right: 3px solid rgba(236, 234, 227, 0.5); /* línea de salida */
    }
    .lane__road { position: relative; flex: 1; height: 100%; margin-right: 18px; }
    .car {
      position: absolute; left: 0; top: 50%; width: ${CAR_WIDTH}px; margin-top: -12px;
      will-change: transform; transform: translate3d(0, 0, 0);
    }
    .race--dense .car svg { width: 42px; height: 19px; }
    .race--dense .car { margin-top: -9px; }
    .car svg { display: block; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5)); }
    .wheel { transform-box: fill-box; transform-origin: center; }
    .race--running .wheel { animation: wheel-spin 0.35s linear infinite; }
    .car__badge {
      position: absolute; top: -6px; left: -6px; z-index: 1; padding: 1px 5px; border-radius: 999px;
      background: var(--gold, #d7ff3f); color: #121211; font-size: 0.7rem; font-weight: 800;
    }
    .car--winner svg { filter: drop-shadow(0 0 6px rgba(215, 255, 63, 0.7)); }
    .race__finish {
      position: absolute; top: 0; bottom: 0; right: 6px; width: 12px; pointer-events: none;
      background: repeating-conic-gradient(#eceae3 0 25%, #121211 0 50%) 0 0 / 12px 12px;
      opacity: 0.85;
    }
    @keyframes wheel-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .race--running .wheel { animation: none; } }
  `],
})
export class RaceGameComponent implements OnDestroy {
  @ViewChildren('car') cars!: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('road') roads!: QueryList<ElementRef<HTMLDivElement>>;

  private readonly zone = inject(NgZone);

  readonly names = input.required<string[]>();
  readonly finished = output<string>();
  readonly runningChange = output<boolean>();

  readonly running = signal(false);
  readonly leader = signal('');
  readonly winner = signal<string | null>(null);
  readonly winnerIndex = signal<number | null>(null);

  private frame = 0;

  color(i: number): string {
    return GAME_COLORS[i % GAME_COLORS.length];
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
  }

  start() {
    const names = this.names();
    if (this.running() || names.length < 2) return;

    const fast = prefersReducedMotion();
    const winnerIdx = randomInt(names.length);
    const winnerMs = fast ? 2500 : 7000;
    const racers: Racer[] = names.map((_, i) => ({
      checkpoints: randomCheckpoints(),
      // los demás llegan entre 0,25 y 1,6 s después del ganador
      finishMs: i === winnerIdx ? winnerMs : winnerMs + (fast ? 150 : 250) + random() * (fast ? 500 : 1350),
    }));

    const carEls = this.cars.map((c) => c.nativeElement);
    const roadWidth = this.roads.first?.nativeElement.clientWidth ?? 400;
    const carWidth = carEls[0]?.offsetWidth || CAR_WIDTH;
    const distance = Math.max(0, roadWidth - carWidth);
    carEls.forEach((el) => (el.style.transform = 'translate3d(0,0,0)'));

    this.winner.set(null);
    this.winnerIndex.set(null);
    this.running.set(true);
    this.runningChange.emit(true);

    const endMs = winnerMs + (fast ? 300 : 1200);
    let startTime = 0;
    let lastLeader = -1;

    this.zone.runOutsideAngular(() => {
      const step = (now: number) => {
        if (!startTime) startTime = now;
        const t = now - startTime;
        // Arranque progresivo (aceleran durante el primer segundo)
        const warped = fast ? t : t < 1000 ? (t * t) / 2000 : t - 500;
        const timeScale = fast ? 1 : (winnerMs - 500) / winnerMs; // compensa el arranque para cuadrar con la meta

        let best = -1;
        let bestP = -1;
        racers.forEach((r, i) => {
          const p = progressAt(r, warped / timeScale);
          // Si ya cruzaron, manda quien llegó antes
          const score = p >= 1 ? 2 - r.finishMs / 1e6 : p;
          if (score > bestP) { bestP = score; best = i; }
          carEls[i].style.transform = `translate3d(${(p * distance).toFixed(1)}px,0,0)`;
        });
        if (best !== lastLeader) {
          lastLeader = best;
          this.leader.set(names[best]);
        }

        if (t < endMs) {
          this.frame = requestAnimationFrame(step);
        } else {
          this.zone.run(() => this.finish(names, winnerIdx));
        }
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  private finish(names: string[], winnerIdx: number) {
    this.running.set(false);
    this.runningChange.emit(false);
    this.winnerIndex.set(winnerIdx);
    this.winner.set(names[winnerIdx]);
    setTimeout(() => this.finished.emit(names[winnerIdx]), 500);
  }
}

/** Avance acumulado por tramo: cada tramo con un ritmo distinto, para que haya adelantamientos. */
function randomCheckpoints(): number[] {
  const steps = Array.from({ length: SEGMENTS }, () => 0.45 + random());
  const total = steps.reduce((a, b) => a + b, 0);
  let acc = 0;
  return [0, ...steps.map((s) => (acc += s / total))];
}

/** Posición (0..1) de un carro en el instante t (ms desde la salida). */
function progressAt(r: Racer, t: number): number {
  if (t >= r.finishMs) return 1;
  if (t <= 0) return 0;
  const x = (t / r.finishMs) * SEGMENTS;
  const k = Math.floor(x);
  const f = x - k;
  return r.checkpoints[k] + (r.checkpoints[k + 1] - r.checkpoints[k]) * f;
}

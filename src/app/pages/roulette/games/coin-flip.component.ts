import { Component, ElementRef, ViewChild, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { prefersReducedMotion, randomInt } from './random';

/**
 * Cara o sello entre dos participantes.
 * El resultado sale de crypto al lanzar; la moneda gira en 3D (Web Animations, en GPU) y cae en esa cara.
 */
@Component({
  selector: 'app-coin-flip',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="coin-game">
      <div class="picks">
        <label class="pick">
          <span class="pick__label">Cara</span>
          <select [ngModel]="headsIdx()" (ngModelChange)="headsIdx.set(+$event)" [disabled]="running()">
            @for (name of names(); track $index) { <option [value]="$index">{{ name }}</option> }
          </select>
        </label>
        <span class="picks__vs" aria-hidden="true">VS</span>
        <label class="pick">
          <span class="pick__label">Sello</span>
          <select [ngModel]="tailsIdx()" (ngModelChange)="tailsIdx.set(+$event)" [disabled]="running()">
            @for (name of names(); track $index) { <option [value]="$index">{{ name }}</option> }
          </select>
        </label>
      </div>

      <div class="stage">
        <div class="lift" #lift>
          <div class="coin" #coin>
            <div class="face face--heads">
              <span class="face__side">CARA</span>
              <span class="face__name">{{ headsName() }}</span>
            </div>
            <div class="face face--tails">
              <span class="face__side">SELLO</span>
              <span class="face__name">{{ tailsName() }}</span>
            </div>
          </div>
        </div>
        <div class="shadow" #shadow aria-hidden="true"></div>
      </div>

      <p class="coin-status" aria-live="polite">
        @if (running()) { La moneda está en el aire… }
        @else if (result()) { Salió <strong>{{ result() === 'heads' ? 'CARA' : 'SELLO' }}</strong>: gana {{ result() === 'heads' ? headsName() : tailsName() }} }
        @else { Elige quién va con cara y quién con sello. }
      </p>

      <button type="button" class="game-btn" (click)="flip()" [disabled]="!canFlip()">
        {{ running() ? 'Lanzando…' : result() ? 'Lanzar otra vez' : 'Lanzar moneda' }}
      </button>
      @if (names().length < 2) {
        <p class="game-hint">Escribe al menos 2 participantes.</p>
      } @else if (headsIdx() === tailsIdx()) {
        <p class="game-hint">Elige dos participantes distintos.</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .coin-game { display: flex; flex-direction: column; align-items: center; gap: 1.25rem; }
    .picks { display: flex; align-items: flex-end; gap: 0.75rem; width: 100%; max-width: 520px; }
    .pick { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
    .pick__label { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--teal-muted); }
    .pick select {
      min-height: 44px; width: 100%; padding: 0 0.75rem; border-radius: var(--radius-md, 2px);
      background: var(--surface-2); color: var(--white); border: 1px solid var(--border); font: inherit;
    }
    .pick select:focus-visible { outline: 2px solid var(--teal-accent); outline-offset: 2px; }
    .picks__vs { padding-bottom: 0.7rem; font-weight: 800; color: var(--teal-muted); }

    .stage { position: relative; height: 300px; width: 100%; display: flex; align-items: flex-end; justify-content: center; perspective: 900px; }
    .lift { position: relative; z-index: 1; margin-bottom: 40px; will-change: transform; }
    .coin { position: relative; width: 190px; height: 190px; transform-style: preserve-3d; will-change: transform; }
    .face {
      position: absolute; inset: 0; border-radius: 50%; backface-visibility: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.35rem; padding: 1.5rem;
      text-align: center; box-sizing: border-box;
    }
    .face--heads {
      background: radial-gradient(circle at 35% 30%, #FFE7A3 0%, #F2B632 45%, #B87A0C 100%);
      box-shadow: inset 0 0 0 7px #C98A12, inset 0 0 0 10px #FFD771; color: #3D2600;
    }
    .face--tails {
      transform: rotateX(180deg);
      background: radial-gradient(circle at 35% 30%, #CFF7F7 0%, #3FC2C2 45%, #2e2e2a 100%);
      box-shadow: inset 0 0 0 7px #015A5A, inset 0 0 0 10px #8FE6E6; color: #022222;
    }
    .face__side { font-family: var(--font-display, sans-serif); font-size: 2.2rem; font-weight: 700; letter-spacing: 0.06em; line-height: 1; }
    .face__name { font-size: 0.95rem; font-weight: 700; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .shadow {
      position: absolute; bottom: 22px; left: 50%; width: 150px; height: 22px; margin-left: -75px;
      border-radius: 50%; background: radial-gradient(closest-side, rgba(0, 0, 0, 0.55), transparent);
    }
    .coin-status { margin: 0; text-align: center; color: var(--teal-muted); font-size: 1.05rem; min-height: 1.6em; }
    .coin-status strong { color: var(--white); }
  `],
})
export class CoinFlipComponent {
  @ViewChild('coin') coinRef!: ElementRef<HTMLDivElement>;
  @ViewChild('lift') liftRef!: ElementRef<HTMLDivElement>;
  @ViewChild('shadow') shadowRef!: ElementRef<HTMLDivElement>;

  readonly names = input.required<string[]>();
  readonly finished = output<string>();
  readonly runningChange = output<boolean>();

  readonly headsIdx = signal(0);
  readonly tailsIdx = signal(1);
  readonly running = signal(false);
  readonly result = signal<'heads' | 'tails' | null>(null);

  readonly headsName = computed(() => this.names()[this.headsIdx()] ?? 'Participante 1');
  readonly tailsName = computed(() => this.names()[this.tailsIdx()] ?? 'Participante 2');
  readonly canFlip = computed(
    () => !this.running() && this.names().length >= 2 && this.headsIdx() !== this.tailsIdx(),
  );

  private rotation = 0;

  constructor() {
    // Si cambia la lista y la selección queda fuera de rango, vuelve a los dos primeros
    effect(() => {
      const n = this.names().length;
      if (this.headsIdx() >= n) this.headsIdx.set(0);
      if (this.tailsIdx() >= n || this.tailsIdx() === this.headsIdx()) this.tailsIdx.set(n > 1 ? (this.headsIdx() === 0 ? 1 : 0) : 0);
    });
  }

  async flip() {
    if (!this.canFlip()) return;
    const outcome: 'heads' | 'tails' = randomInt(2) === 0 ? 'heads' : 'tails';
    const fast = prefersReducedMotion();
    const duration = fast ? 600 : 2600;
    const turns = fast ? 1 : 9;

    const from = this.rotation;
    const to = from - (((from % 360) + 360) % 360) + turns * 360 + (outcome === 'tails' ? 180 : 0);
    this.rotation = to;

    this.result.set(null);
    this.running.set(true);
    this.runningChange.emit(true);

    const spin = this.coinRef.nativeElement.animate(
      [{ transform: `rotateX(${from}deg)` }, { transform: `rotateX(${to}deg)` }],
      { duration, easing: 'cubic-bezier(0.15, 0.6, 0.25, 1)', fill: 'forwards' },
    );
    if (!fast) {
      this.liftRef.nativeElement.animate(
        [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-150px) scale(1.12)', offset: 0.42 },
          { transform: 'translateY(0) scale(1)', offset: 0.85 },
          { transform: 'translateY(-10px) scale(1)', offset: 0.92 },
          { transform: 'translateY(0) scale(1)' },
        ],
        { duration, easing: 'ease-in-out' },
      );
      this.shadowRef.nativeElement.animate(
        [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.55)', opacity: 0.4, offset: 0.42 }, { transform: 'scale(1)', opacity: 1, offset: 0.85 }, { transform: 'scale(1)', opacity: 1 }],
        { duration, easing: 'ease-in-out' },
      );
    }

    await spin.finished.catch(() => undefined);
    this.result.set(outcome);
    this.running.set(false);
    this.runningChange.emit(false);
    const winner = outcome === 'heads' ? this.headsName() : this.tailsName();
    setTimeout(() => this.finished.emit(winner), 600);
  }
}

import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone, computed, inject, signal } from '@angular/core';
import { EliminationGameComponent } from './games/elimination-game.component';
import { RaceGameComponent } from './games/race-game.component';
import { CoinFlipComponent } from './games/coin-flip.component';
import { randomInt, shuffle } from './games/random';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type GameId = 'ruleta' | 'eliminacion' | 'carrera' | 'moneda';

/** Sectores en grises cálidos alternados (estilo editorial); los vecinos se distinguen por luminosidad. */
const SEGMENT_COLORS = ['#1A1A18', '#33332E', '#22221F', '#3D3D37'];
/** Colores del confeti del cartel de ganador. */
const CONFETTI_COLORS = ['#D7FF3F', '#ECEAE3', '#FF5A36', '#A3A19A', '#D7FF3F'];

const SIZE = 550;            // tamaño lógico del lienzo
const CENTER = SIZE / 2;
const OUTER_RADIUS = 220;
const INNER_RADIUS = 80;
const POINTER_DEG = 270;     // la flecha está arriba (en el lienzo 0° es a la derecha y gira en sentido horario)

/**
 * Ruleta de sorteos.
 * - La rueda se dibuja UNA vez y lo que gira es el elemento (transform en GPU), no se redibuja 60 veces por segundo.
 * - La animación corre fuera de Angular para no lanzar la detección de cambios en cada fotograma.
 * - El ganador se elige al inicio con crypto.getRandomValues (aleatorio de verdad) y la rueda se detiene en él.
 */
@Component({
  selector: 'app-roulette',
  standalone: true,
  imports: [CommonModule, FormsModule, EliminationGameComponent, RaceGameComponent, CoinFlipComponent],
  templateUrl: './roulette.component.html',
  styleUrls: ['./roulette.component.css']
})
export class RouletteComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rotor', { static: false }) rotorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('winnerDialog', { static: false }) dialogRef!: ElementRef<HTMLDialogElement>;

  private readonly zone = inject(NgZone);

  readonly games: { id: GameId; label: string; icon: string; hint: string }[] = [
    { id: 'ruleta', label: 'Ruleta', icon: 'A', hint: 'Gira y donde pare la flecha, gana.' },
    { id: 'eliminacion', label: 'Eliminación', icon: 'B', hint: 'Caen uno por uno; el último en pie gana.' },
    { id: 'carrera', label: 'Carrera', icon: 'C', hint: 'Cada participante es un carro; el primero en la meta gana.' },
    { id: 'moneda', label: 'Cara o sello', icon: 'D', hint: 'Duelo entre dos con una moneda.' },
  ];
  readonly currentGame = computed(() => this.games.find((g) => g.id === this.mode())!);
  /** Piezas de confeti (posición, color y retraso fijos para no recalcular en cada render). */
  readonly confetti = Array.from({ length: 28 }, (_, i) => ({
    x: Math.round((i / 28) * 100 + (i % 3) * 2),
    delay: (i % 7) * 60,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    rot: (i * 47) % 360,
  }));
  readonly mode = signal<GameId>('ruleta');
  /** Un juego distinto de la ruleta está en marcha. */
  readonly gameRunning = signal(false);
  readonly busy = computed(() => this.isSpinning() || this.gameRunning());
  readonly currentGameLabel = computed(() => this.games.find((g) => g.id === this.mode())?.label.toLowerCase() ?? 'sorteo');

  options = signal<string[]>([]);
  optionsText = signal('');
  isSpinning = signal(false);
  winner = signal<string | null>(null);
  showWinner = signal(false);
  currentSpinningText = signal('');

  private rotation = 0;              // grados acumulados
  private frame = 0;
  private showWinnerTimeout: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit() {
    this.updateOptions();
    this.drawWheel();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
    if (this.showWinnerTimeout) clearTimeout(this.showWinnerTimeout);
  }

  setMode(id: GameId) {
    if (this.busy()) return;
    this.closeWinnerModal();
    this.mode.set(id);
    // El lienzo sigue en la página aunque esté oculto; se redibuja por si cambió la lista
    if (id === 'ruleta') setTimeout(() => this.drawWheel());
  }

  /** Los juegos avisan aquí cuando terminan y se muestra el mismo cartel de ganador. */
  announceWinner(name: string) {
    this.winner.set(name);
    this.showWinner.set(true);
    const dialog = this.dialogRef?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }

  // ---------------------------------------------------------------------------
  // Herramientas de la lista
  // ---------------------------------------------------------------------------

  /** Quita al ganador de la lista (para sacar varios ganadores seguidos). */
  removeWinner() {
    const name = this.winner();
    if (!name) return;
    const lines = this.optionsText().split('\n');
    const i = lines.findIndex((l) => l.trim() === name);
    if (i >= 0) lines.splice(i, 1);
    this.setList(lines.join('\n'));
    this.closeWinnerModal();
  }

  /** Cierra el cartel y, en la ruleta, vuelve a girar. */
  playAgain() {
    this.closeWinnerModal();
    if (this.mode() === 'ruleta') setTimeout(() => this.spin(), 150);
  }

  shuffleList() {
    this.setList(shuffle(this.options()).join('\n'));
  }

  removeDuplicates() {
    const seen = new Set<string>();
    const unique = this.options().filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    this.setList(unique.join('\n'));
  }

  clearList() {
    if (this.options().length && !confirm('¿Borrar toda la lista de participantes?')) return;
    this.setList('');
  }

  readonly duplicates = computed(() => {
    const names = this.options().map((n) => n.toLowerCase());
    return names.length - new Set(names).size;
  });

  private setList(text: string) {
    this.optionsText.set(text);
    this.onTextChange();
  }

  onTextChange() {
    this.updateOptions();
    this.drawWheel();
  }

  updateOptions() {
    this.options.set(
      this.optionsText()
        .split('\n')
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
    );
  }

  spin() {
    const options = this.options();
    if (this.isSpinning() || options.length < 2) return;

    if (this.showWinnerTimeout) clearTimeout(this.showWinnerTimeout);
    this.closeWinnerModal();
    this.isSpinning.set(true);

    const seg = 360 / options.length;
    const winnerIndex = randomInt(options.length);
    // Punto aleatorio dentro del sector ganador (sin pegarse a los bordes)
    const jitter = (randomInt(1000) / 1000 - 0.5) * seg * 0.7;
    const landing = mod(POINTER_DEG - (winnerIndex + 0.5) * seg + jitter, 360);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const turns = reduceMotion ? 1 : 7;
    const duration = reduceMotion ? 1200 : 6000;

    const from = this.rotation;
    const to = from - mod(from, 360) + turns * 360 + landing;
    const rotor = this.rotorRef.nativeElement;
    let lastIndex = -1;
    let start = 0;

    this.zone.runOutsideAngular(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        this.rotation = from + (to - from) * easeOutQuart(t);
        rotor.style.transform = `rotate(${this.rotation}deg)`;

        // El texto central solo cambia cuando la flecha pasa a otro nombre
        const index = Math.floor(mod(POINTER_DEG - this.rotation, 360) / seg) % options.length;
        if (index !== lastIndex) {
          lastIndex = index;
          this.currentSpinningText.set(options[index]);
        }

        if (t < 1) {
          this.frame = requestAnimationFrame(step);
        } else {
          this.zone.run(() => this.finish(options[winnerIndex]));
        }
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  private finish(winnerName: string) {
    this.isSpinning.set(false);
    // Una pausa corta para que se vea dónde paró la flecha, sin hacer esperar
    this.showWinnerTimeout = setTimeout(() => {
      this.showWinnerTimeout = null;
      this.announceWinner(winnerName);
    }, 450);
  }

  /** Clic fuera de la tarjeta (en el fondo oscuro) cierra el cartel. */
  onDialogClick(event: MouseEvent) {
    if (event.target === this.dialogRef?.nativeElement) this.closeWinnerModal();
  }

  closeWinnerModal() {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog?.open) dialog.close();
    this.showWinner.set(false);
    this.winner.set(null);
  }

  /** Dibuja la rueda completa una sola vez (cuando cambia la lista). */
  private drawWheel() {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Nitidez en pantallas de alta densidad
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== SIZE * dpr) {
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    const options = this.options();
    if (!options.length) return;

    const arc = (2 * Math.PI) / options.length;
    const fontSize = options.length > 24 ? 11 : options.length > 12 ? 13 : 15;
    const maxTextWidth = OUTER_RADIUS - INNER_RADIUS - 28;
    ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < options.length; i++) {
      const angle = i * arc;
      // Si la cantidad es impar, el último sector no repite el color del primero
      const colorIndex = i === options.length - 1 && i % SEGMENT_COLORS.length === 0 ? 1 : i % SEGMENT_COLORS.length;

      ctx.beginPath();
      ctx.arc(CENTER, CENTER, OUTER_RADIUS, angle, angle + arc, false);
      ctx.arc(CENTER, CENTER, INNER_RADIUS, angle + arc, angle, true);
      ctx.closePath();
      ctx.fillStyle = SEGMENT_COLORS[colorIndex];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Texto a lo largo del radio, pegado al borde (como las ruletas de nombres clásicas)
      ctx.save();
      ctx.translate(CENTER, CENTER);
      ctx.rotate(angle + arc / 2);
      const text = fitText(ctx, options[i], maxTextWidth);
      ctx.fillStyle = '#ECEAE3';
      ctx.fillText(text, OUTER_RADIUS - 18, 0);
      ctx.restore();
    }
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/** Recorta nombres largos con "…" para que no se salgan del sector. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

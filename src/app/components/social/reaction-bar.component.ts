import { Component, ElementRef, computed, input, output, signal, viewChild, OnDestroy } from '@angular/core';
import { gsap } from 'gsap';
import type { ReactionKind } from '../../models';
import { DISLIKE, REACTIONS, ReactionDef, countReactions, reactionDef } from './reactions';

/**
 * Barra de reacciones para publicaciones, comentarios y respuestas.
 * Botón principal = Me gusta (o tu reacción actual). Al dejar el cursor encima (o mantener pulsado en el celular)
 * aparece la bandeja con las 6 reacciones. "No me gusta" va aparte. Pulsar tu reacción actual la quita.
 */
@Component({
  selector: 'app-reaction-bar',
  standalone: true,
  template: `
    <div class="bar" [class.bar--compact]="compact()">
      <div class="main" (mouseenter)="openTraySoon()" (mouseleave)="closeTraySoon()" (focusin)="openTraySoon()" (focusout)="closeTraySoon()">
        <button type="button" class="btn" [class.is-on]="mine() && mine() !== 'dislike'" [attr.data-tone]="mainDef().tone"
                [attr.aria-pressed]="!!mine() && mine() !== 'dislike'" [attr.aria-label]="mine() && mine() !== 'dislike' ? 'Quitar reacción: ' + mainDef().label : 'Me gusta'"
                (click)="toggleMain()" (touchstart)="pressStart()" (touchend)="pressEnd($event)" (contextmenu)="$event.preventDefault()"
                [disabled]="disabled()">
          <svg #mainIcon viewBox="0 0 24 24" aria-hidden="true">@for (d of mainDef().paths; track $index) { <path [attr.d]="d" /> }</svg>
          @if (!compact()) { <span class="lbl">{{ mine() && mine() !== 'dislike' ? mainDef().label : 'Me gusta' }}</span> }
        </button>
        @if (trayOpen()) {
          <div #tray class="tray" role="menu" aria-label="Elegir reacción">
            @for (r of reactions; track r.kind) {
              <button type="button" role="menuitemradio" class="tray-btn" [attr.data-tone]="r.tone" [class.is-on]="mine() === r.kind"
                      [attr.aria-checked]="mine() === r.kind" [attr.aria-label]="r.label" [title]="r.label" (click)="choose(r.kind)">
                <svg viewBox="0 0 24 24" aria-hidden="true">@for (d of r.paths; track $index) { <path [attr.d]="d" /> }</svg>
              </button>
            }
          </div>
        }
      </div>
      <button type="button" class="btn" [class.is-on]="mine() === 'dislike'" data-tone="text" [attr.aria-pressed]="mine() === 'dislike'"
              aria-label="No me gusta" title="No me gusta" (click)="choose('dislike')" [disabled]="disabled()">
        <svg viewBox="0 0 24 24" aria-hidden="true">@for (d of dislike.paths; track $index) { <path [attr.d]="d" /> }</svg>
        @if (counts().dislike) { <span class="n">{{ counts().dislike }}</span> }
      </button>
      @if (positiveTotal()) {
        <span class="summary" [title]="summaryTitle()">
          <span class="stack" aria-hidden="true">
            @for (r of topKinds(); track r.kind) {
              <i [attr.data-tone]="r.tone"><svg viewBox="0 0 24 24">@for (d of r.paths; track $index) { <path [attr.d]="d" /> }</svg></i>
            }
          </span>
          <span class="n">{{ positiveTotal() }}</span>
          <span class="sr-only">{{ summaryTitle() }}</span>
        </span>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .bar { display: flex; align-items: center; gap: 2px; }
    .main { position: relative; }
    .btn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border: 0; border-radius: var(--radius-sm, 2px);
      background: none; color: var(--text-secondary); font: inherit; font-size: 13px; cursor: pointer; transition: var(--t-ui); }
    .bar--compact .btn { min-height: 30px; padding: 0 6px; }
    .btn:hover:not(:disabled) { background: var(--surface-2); color: var(--white); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn:focus-visible, .tray-btn:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
    .bar--compact svg { width: 16px; height: 16px; }
    .btn.is-on[data-tone="accent"], .tray-btn.is-on[data-tone="accent"] { color: var(--volt); }
    .btn.is-on[data-tone="alert"], .tray-btn.is-on[data-tone="alert"] { color: var(--ember-text, var(--ember)); }
    .btn.is-on[data-tone="text"], .tray-btn.is-on[data-tone="text"] { color: var(--white); }
    .btn.is-on svg { fill: color-mix(in srgb, currentColor 22%, transparent); }
    .lbl { font-weight: 500; }
    .n { font-variant-numeric: tabular-nums; }
    .tray { position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 30; display: flex; gap: 2px; padding: 4px;
      background: var(--surface-3); border-radius: 999px; box-shadow: var(--shadow-pop); }
    .tray::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 8px; }
    .tray-btn { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: none; color: var(--white); cursor: pointer; }
    .tray-btn svg { width: 22px; height: 22px; }
    .tray-btn:hover { background: var(--surface-2); }
    .summary { display: inline-flex; align-items: center; gap: 6px; margin-left: 6px; font-size: 13px; color: var(--text-secondary); }
    .stack { display: inline-flex; }
    .stack i { display: grid; place-items: center; width: 20px; height: 20px; margin-left: -5px; border-radius: 50%; background: var(--surface-3); box-shadow: 0 0 0 2px var(--surface-1); }
    .stack i:first-child { margin-left: 0; }
    .stack i svg { width: 13px; height: 13px; }
    .stack i[data-tone="accent"] { color: var(--volt); }
    .stack i[data-tone="alert"] { color: var(--ember-text, var(--ember)); }
    .stack i[data-tone="text"] { color: var(--white); }
  `],
})
export class ReactionBarComponent implements OnDestroy {
  reactions_ = input<Record<string, ReactionKind> | undefined>(undefined, { alias: 'reactions' });
  userId = input<string | null>(null);
  compact = input(false);
  disabled = input(false);
  /** Nueva reacción del usuario (null = la quitó) */
  react = output<ReactionKind | null>();

  readonly reactions = REACTIONS;
  readonly dislike = DISLIKE;
  trayOpen = signal(false);
  private mainIcon = viewChild<ElementRef<SVGElement>>('mainIcon');
  private tray = viewChild<ElementRef<HTMLElement>>('tray');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressed = false;

  mine = computed(() => { const u = this.userId(); return u ? this.reactions_()?.[u] ?? null : null; });
  mainDef = computed<ReactionDef>(() => { const m = this.mine(); return m && m !== 'dislike' ? reactionDef(m)! : REACTIONS[0]; });
  counts = computed(() => countReactions(this.reactions_()));
  positiveTotal = computed(() => REACTIONS.reduce((s, r) => s + this.counts()[r.kind], 0));
  topKinds = computed(() => REACTIONS.filter((r) => this.counts()[r.kind] > 0).sort((a, b) => this.counts()[b.kind] - this.counts()[a.kind]).slice(0, 3));
  summaryTitle = computed(() => REACTIONS.filter((r) => this.counts()[r.kind]).map((r) => `${r.label}: ${this.counts()[r.kind]}`).join(' · '));

  private reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

  ngOnDestroy() { this.clear(); if (this.pressTimer) clearTimeout(this.pressTimer); }

  private clear() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  openTraySoon() {
    if (!this.canHover || this.disabled()) return;
    this.clear();
    this.timer = setTimeout(() => this.showTray(), 350);
  }

  closeTraySoon() {
    this.clear();
    this.timer = setTimeout(() => this.trayOpen.set(false), 250);
  }

  private showTray() {
    if (this.trayOpen()) return;
    this.trayOpen.set(true);
    if (this.reduced) return;
    queueMicrotask(() => {
      const el = this.tray()?.nativeElement;
      if (!el) return;
      gsap.fromTo(el, { autoAlpha: 0, y: 6, scale: 0.92, transformOrigin: 'left bottom' }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' });
      gsap.fromTo(el.querySelectorAll('.tray-btn'), { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.2, stagger: 0.025, ease: 'back.out(2)' });
    });
  }

  // Celular: mantener pulsado abre la bandeja; un toque corto da Me gusta
  pressStart() {
    this.longPressed = false;
    this.pressTimer = setTimeout(() => { this.longPressed = true; this.showTray(); }, 420);
  }
  pressEnd(ev: Event) {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    if (this.longPressed) ev.preventDefault();
  }

  toggleMain() {
    if (this.longPressed) { this.longPressed = false; return; }
    const m = this.mine();
    this.emit(m && m !== 'dislike' ? null : 'like');
  }

  choose(kind: ReactionKind) {
    this.trayOpen.set(false);
    this.longPressed = false;
    this.emit(this.mine() === kind ? null : kind);
  }

  private emit(kind: ReactionKind | null) {
    this.react.emit(kind);
    if (kind && kind !== 'dislike' && !this.reduced) {
      const icon = this.mainIcon()?.nativeElement;
      if (icon) gsap.fromTo(icon, { scale: 0.6 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', transformOrigin: '50% 50%' });
    }
  }
}

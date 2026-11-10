import { Component, ElementRef, input, output, signal, viewChild, AfterViewInit } from '@angular/core';
import { gsap } from 'gsap';

export type ReportReason = 'spam' | 'acoso' | 'ofensivo' | 'trampas' | 'otro';

/** Ventana para reportar una publicación o un comentario. Los motivos son los que acepta la base de datos. */
@Component({
  selector: 'app-report-dialog',
  standalone: true,
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <form #box class="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); send()">
        <h2 id="report-title">Reportar {{ what() }}</h2>
        <p class="sub">Lo revisa el equipo de moderación. La persona no sabrá quién la reportó.</p>
        <fieldset>
          <legend class="sr-only">Motivo</legend>
          @for (r of reasons; track r.id) {
            <label class="opt" [class.is-on]="reason() === r.id">
              <input type="radio" name="reason" [value]="r.id" [checked]="reason() === r.id" (change)="reason.set(r.id)" />
              <span><b>{{ r.label }}</b><small>{{ r.hint }}</small></span>
            </label>
          }
        </fieldset>
        <label class="field">
          <span>Detalles (opcional)</span>
          <textarea rows="3" maxlength="500" [value]="details()" (input)="details.set($any($event.target).value)" placeholder="Cuéntanos qué pasó"></textarea>
          <small class="count">{{ details().length }}/500</small>
        </label>
        <div class="actions">
          <button type="button" class="btn btn--quiet" (click)="cancel.emit()">Cancelar</button>
          <button type="submit" class="btn btn--primary" [disabled]="!reason() || sending()">{{ sending() ? 'Enviando…' : 'Enviar reporte' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg) 75%, transparent); }
    .dialog { width: 100%; max-width: 440px; max-height: calc(100vh - 32px); overflow-y: auto; padding: 22px; background: var(--surface-1); border-radius: 6px; box-shadow: var(--shadow-pop); }
    h2 { margin: 0; font-family: var(--font-display); font-weight: 500; font-size: 1.35rem; color: var(--white); }
    .sub { margin: 4px 0 16px; font-size: 13px; color: var(--text-secondary); }
    fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
    .opt { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; transition: var(--t-ui); }
    .opt:hover { border-color: var(--border-strong); }
    .opt.is-on { border-color: var(--volt); background: color-mix(in srgb, var(--volt) 8%, transparent); }
    .opt input { margin-top: 3px; accent-color: var(--volt); }
    .opt span { display: grid; gap: 2px; }
    .opt b { font-size: 14px; color: var(--white); font-weight: 600; }
    .opt small { font-size: 12px; color: var(--text-secondary); }
    .field { display: grid; gap: 6px; margin-top: 14px; font-size: 13px; color: var(--text-secondary); }
    textarea { width: 100%; padding: 10px; border: 1px solid var(--border-input, var(--border)); border-radius: 4px; background: var(--surface-2); color: var(--white); font: inherit; font-size: 14px; resize: vertical; }
    textarea:focus { outline: 2px solid var(--volt); border-color: transparent; }
    .count { justify-self: end; font-variant-numeric: tabular-nums; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .btn { min-height: 40px; padding: 0 16px; border-radius: 4px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn--quiet { border: 1px solid var(--border-strong); background: none; color: var(--white); }
    .btn--primary { border: 0; background: var(--volt); color: var(--volt-ink); }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
    .btn:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
  `],
})
export class ReportDialogComponent implements AfterViewInit {
  what = input('la publicación');
  sending = input(false);
  submitReport = output<{ reason: ReportReason; details: string }>();
  cancel = output<void>();
  reason = signal<ReportReason | null>(null);
  details = signal('');
  private box = viewChild<ElementRef<HTMLElement>>('box');
  readonly reasons: { id: ReportReason; label: string; hint: string }[] = [
    { id: 'spam', label: 'Spam o publicidad', hint: 'Enlaces repetidos, ventas, cadenas' },
    { id: 'acoso', label: 'Acoso', hint: 'Ataques o amenazas a una persona' },
    { id: 'ofensivo', label: 'Contenido ofensivo', hint: 'Insultos, odio o contenido inapropiado' },
    { id: 'trampas', label: 'Trampas o cuentas ajenas', hint: 'Hacks, venta de cuentas, suplantación' },
    { id: 'otro', label: 'Otro motivo', hint: 'Explícalo en los detalles' },
  ];
  ngAfterViewInit() {
    const el = this.box()?.nativeElement;
    el?.querySelector<HTMLInputElement>('input')?.focus();
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.from(el, { autoAlpha: 0, y: 12, duration: 0.2, ease: 'power2.out' });
  }
  send() { const r = this.reason(); if (r) this.submitReport.emit({ reason: r, details: this.details().trim() }); }
}

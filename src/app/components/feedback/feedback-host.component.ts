import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

/**
 * Toasts y diálogo de confirmación de WAYIRA. Se monta una sola vez en app.html.
 * El diálogo usa <dialog> nativo: queda por encima de todo, atrapa el foco y se cierra con Esc.
 */
@Component({
  selector: 'app-feedback-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="toasts" aria-label="Avisos">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast toast--' + t.kind"
             [attr.role]="t.kind === 'error' || t.kind === 'warning' ? 'alert' : 'status'"
             (mouseenter)="toast.pause(t.id)" (mouseleave)="toast.resume(t.id)"
             (focusin)="toast.pause(t.id)" (focusout)="toast.resume(t.id)">
          <span class="toast__icon" aria-hidden="true">
            @switch (t.kind) {
              @case ('success') { <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg> }
              @case ('error') { ! }
              @case ('warning') { ! }
              @default { i }
            }
          </span>
          <span class="toast__body">
            <span class="toast__title">{{ t.title }}</span>
            @if (t.message) { <span class="toast__msg">{{ t.message }}</span> }
          </span>
          <button type="button" class="toast__close" (click)="toast.dismiss(t.id)" aria-label="Cerrar aviso">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          @if (t.duration > 0) { <span class="toast__bar" [style.animation-duration.ms]="t.duration" aria-hidden="true"></span> }
        </div>
      }
    </section>

    <dialog #dlg class="confirm" aria-labelledby="confirm-title" (cancel)="onCancel($event)" (click)="onBackdrop($event)">
      @if (dialog.current(); as d) {
        <div class="confirm__panel">
          @if (d.kicker || d.danger) {
            <span class="confirm__kicker" [class.is-danger]="d.danger">{{ d.kicker || 'Confirmar acción' }}</span>
          }
          <h2 id="confirm-title" class="confirm__title">{{ d.title }}</h2>
          @if (d.message) { <p class="confirm__msg">{{ d.message }}</p> }
          @if (d.requireText) {
            <label class="confirm__label" for="confirm-text">Escribe <code>{{ d.requireText }}</code> para confirmar</label>
            <input id="confirm-text" class="confirm__input" autocomplete="off" [value]="typed()" (input)="typed.set($any($event.target).value)">
          }
          <div class="confirm__actions">
            <button type="button" class="btn btn-secondary" (click)="dialog.close(false)">{{ d.cancelLabel || 'Cancelar' }}</button>
            <button type="button" class="btn" [class.btn-primary]="!d.danger" [class.btn-danger]="d.danger"
                    [disabled]="!!d.requireText && typed().trim().toUpperCase() !== d.requireText.toUpperCase()"
                    (click)="dialog.close(true)">{{ d.confirmLabel || 'Confirmar' }}</button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: [`
    :host { display: contents; }
    .toasts {
      position: fixed; right: 16px; bottom: 16px; z-index: 2000;
      display: flex; flex-direction: column; gap: 8px; width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }
    .toast {
      position: relative; overflow: hidden; pointer-events: auto;
      display: flex; align-items: flex-start; gap: 12px; padding: 14px 12px 14px 16px;
      background: var(--surface-1); border: 1px solid var(--border-strong); border-radius: 2px;
      box-shadow: 0 16px 40px -16px rgba(0,0,0,.8);
      animation: toast-in 240ms var(--ease-wayira) both;
    }
    .toast--error, .toast--warning { border-color: rgba(var(--ember-rgb), .45); }
    .toast__icon {
      flex: none; width: 24px; height: 24px; border-radius: 2px; display: grid; place-items: center;
      font-family: var(--font-mono); font-size: 13px; font-weight: 600;
      border: 1px solid var(--border-strong); color: var(--white);
    }
    .toast--success .toast__icon { background: var(--volt); color: var(--volt-ink); border-color: var(--volt); }
    .toast--error .toast__icon { background: var(--ember); color: var(--volt-ink); border-color: var(--ember); }
    .toast--warning .toast__icon { color: var(--ember-text); border-color: var(--ember); }
    .toast__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .toast__title { font-size: 14px; font-weight: 600; color: var(--white); overflow-wrap: anywhere; }
    .toast__msg { font-size: 13px; line-height: 1.45; color: var(--text-secondary); overflow-wrap: anywhere; }
    .toast__close {
      flex: none; width: 32px; height: 32px; margin: -6px -4px 0 0; display: grid; place-items: center;
      background: none; border: 0; border-radius: 2px; color: var(--text-muted); cursor: pointer;
    }
    .toast__close:hover { color: var(--white); background: rgba(255,255,255,.06); }
    .toast__bar {
      position: absolute; left: 0; bottom: 0; height: 2px; width: 100%;
      background: var(--volt); transform-origin: left; animation: toast-bar linear forwards;
    }
    .toast--error .toast__bar, .toast--warning .toast__bar { background: var(--ember); }
    .toast:hover .toast__bar { animation-play-state: paused; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }
    @keyframes toast-bar { to { transform: scaleX(0); } }
    @media (max-width: 600px) {
      .toasts { top: calc(var(--header-h) + 8px); bottom: auto; right: 16px; }
    }

    .confirm {
      margin: auto; /* el reset global quita el centrado nativo de <dialog> */
      width: min(480px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--border-strong); border-radius: 2px;
      background: var(--surface-1); color: var(--white); box-shadow: 0 24px 64px -16px rgba(0,0,0,.8);
    }
    .confirm::backdrop { background: rgba(8, 8, 7, .72); }
    .confirm[open] { animation: toast-in 220ms var(--ease-wayira) both; }
    .confirm__panel { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
    .confirm__kicker { font-family: var(--font-mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--text-secondary); }
    .confirm__kicker.is-danger { color: var(--ember-text); }
    .confirm__title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 26px; line-height: 1.15; letter-spacing: -.01em; }
    .confirm__msg { margin: 0; font-size: 15px; line-height: 1.6; color: var(--text-secondary); white-space: pre-line; }
    .confirm__label { font-size: 13px; font-weight: 500; margin-top: 4px; }
    .confirm__label code { font-family: var(--font-mono); color: var(--white); }
    .confirm__input {
      height: 44px; padding: 0 12px; background: var(--bg); border: 1px solid var(--border-input);
      border-radius: 2px; color: var(--white); font-family: var(--font-mono);
    }
    .confirm__actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .btn-danger { background: var(--ember); color: var(--volt-ink); }
    .btn-danger:hover:not(:disabled) { background: #ff7354; }
  `],
})
export class FeedbackHostComponent {
  readonly toast = inject(ToastService);
  readonly dialog = inject(DialogService);
  readonly typed = signal('');
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private returnFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const open = !!this.dialog.current();
      const el = this.dlg().nativeElement;
      if (open && !el.open) {
        this.returnFocus = document.activeElement as HTMLElement | null;
        this.typed.set('');
        el.showModal();
      } else if (!open && el.open) {
        el.close();
        this.returnFocus?.focus?.();
      }
    });
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.dialog.close(false);
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) this.dialog.close(false);
  }
}

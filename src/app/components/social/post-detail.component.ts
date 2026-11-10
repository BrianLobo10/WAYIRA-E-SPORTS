import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, input, output, viewChild } from '@angular/core';
import { gsap } from 'gsap';
import { Post } from '../../models';
import { PostCardComponent } from './post-card.component';
import { CommentThreadComponent } from './comment-thread.component';

/**
 * Visor de una publicación: una sola columna que nunca se desborda.
 * En el celular ocupa toda la pantalla; en escritorio es un panel centrado de hasta 720 px.
 */
@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [PostCardComponent, CommentThreadComponent],
  template: `
    <div class="overlay" (click)="closed.emit()">
      <div #box class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="'Publicación de ' + post().authorName" (click)="$event.stopPropagation()" tabindex="-1">
        <header class="bar">
          <span class="bar-title">Publicación</span>
          <button type="button" class="x" aria-label="Cerrar" (click)="closed.emit()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="scroll">
          <app-post-card [post]="post()" [userId]="userId()" [saved]="saved()" [detail]="true"
                         (changed)="changed.emit()" (deleted)="deleted.emit($event)" (savedChange)="savedChange.emit($event)" (open)="focusComments()" />
          <div class="comments" id="comentarios">
            <app-comment-thread [post]="post()" [userId]="userId()" (changed)="changed.emit()" />
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px 16px; background: color-mix(in srgb, var(--bg) 78%, transparent); }
    .dialog { display: flex; flex-direction: column; width: min(720px, 100%); max-height: calc(100dvh - 48px); background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius-sm, 2px); box-shadow: var(--shadow-pop); overflow: hidden; outline: none; }
    .bar { display: flex; align-items: center; justify-content: space-between; min-height: 52px; padding: 0 8px 0 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .bar-title { font-family: var(--font-display); font-size: 16px; font-weight: 600; color: var(--white); }
    .x { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%; background: none; color: var(--text-secondary); cursor: pointer; }
    .x:hover { background: var(--surface-2); color: var(--white); }
    .x:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .x svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
    .comments { padding: 16px; border-top: 1px solid var(--border); }
    @media (max-width: 640px) {
      .overlay { padding: 0; place-items: stretch; }
      .dialog { width: 100%; max-height: none; height: 100dvh; border: 0; border-radius: 0; }
    }
  `],
})
export class PostDetailComponent implements AfterViewInit, OnDestroy {
  post = input.required<Post>();
  userId = input<string | null>(null);
  saved = input(false);
  closed = output<void>();
  changed = output<void>();
  deleted = output<string>();
  savedChange = output<boolean>();
  private box = viewChild<ElementRef<HTMLElement>>('box');
  private returnFocus: HTMLElement | null = null;
  private prevOverflow = '';

  ngAfterViewInit() {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = this.box()?.nativeElement;
    if (!el) return;
    el.focus();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(el, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power2.out' });
    }
  }

  ngOnDestroy() {
    document.body.style.overflow = this.prevOverflow;
    this.returnFocus?.focus?.();
  }

  focusComments() {
    (this.box()?.nativeElement.querySelector('.comments textarea') as HTMLElement | null)?.focus();
  }

  /** Esc cierra solo si no hay otro diálogo encima (editor, reporte, confirmación) */
  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: Event) {
    if (ev.defaultPrevented) return;
    if (document.querySelector('app-post-editor, app-report-dialog, dialog[open], app-emoji-picker, app-more-menu .panel, app-reaction-bar .tray, textarea.edit')) return;
    this.closed.emit();
  }

  /** Mantiene el foco dentro del visor */
  @HostListener('keydown', ['$event'])
  trap(e: Event) {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'Tab') return;
    const el = this.box()?.nativeElement;
    if (!el) return;
    const f = Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,video[controls],[tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
}

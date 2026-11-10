import { Component, ElementRef, HostListener, input, output, signal, viewChild } from '@angular/core';
import { gsap } from 'gsap';

export interface MenuItem { id: string; label: string; icon: string; danger?: boolean }

/** Menú de tres puntos (⋯). Se cierra con Esc o al hacer clic fuera; se maneja con teclado. */
@Component({
  selector: 'app-more-menu',
  standalone: true,
  template: `
    <button #trigger type="button" class="trigger" [attr.aria-label]="label()" aria-haspopup="menu" [attr.aria-expanded]="open()" (click)="toggle($event)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>
    @if (open()) {
      <div #panel class="panel" role="menu" (keydown)="onKey($event)" (click)="$event.stopPropagation()">
        @for (it of items(); track it.id) {
          <button type="button" role="menuitem" class="item" [class.item--danger]="it.danger" (click)="pick(it)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="it.icon" /></svg>
            {{ it.label }}
          </button>
        }
      </div>
    }
  `,
  styles: [`
    :host { position: relative; display: inline-block; }
    .trigger { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--text-secondary); cursor: pointer; transition: var(--t-ui); }
    .trigger:hover, .trigger[aria-expanded="true"] { background: var(--surface-2); color: var(--white); }
    .trigger:focus-visible, .item:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .trigger svg { width: 18px; height: 18px; fill: currentColor; }
    .panel { position: absolute; right: 0; top: calc(100% + 4px); z-index: 40; min-width: 220px; padding: 6px; background: var(--surface-3); border-radius: 4px; box-shadow: var(--shadow-pop); }
    .item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 0 12px; border: 0; border-radius: 2px; background: none; color: var(--white); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
    .item:hover, .item:focus { background: var(--surface-2); }
    .item svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
    .item--danger { color: var(--ember-text, var(--ember)); }
  `],
})
export class MoreMenuComponent {
  items = input.required<MenuItem[]>();
  label = input('Más opciones');
  select = output<string>();
  open = signal(false);
  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private host = new ElementRef<HTMLElement>(null as unknown as HTMLElement);

  constructor(el: ElementRef<HTMLElement>) { this.host = el; }

  toggle(ev: Event) {
    ev.stopPropagation();
    this.open() ? this.close() : this.show();
  }

  private show() {
    this.open.set(true);
    queueMicrotask(() => {
      const el = this.panel()?.nativeElement;
      if (!el) return;
      (el.querySelector('.item') as HTMLElement | null)?.focus();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.fromTo(el, { autoAlpha: 0, y: -4, scale: 0.97, transformOrigin: 'top right' }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.16, ease: 'power2.out' });
      }
    });
  }

  close(focusTrigger = false) {
    this.open.set(false);
    if (focusTrigger) this.trigger()?.nativeElement.focus();
  }

  pick(it: MenuItem) {
    this.close(true);
    this.select.emit(it.id);
  }

  onKey(ev: KeyboardEvent) {
    const items = Array.from(this.panel()?.nativeElement.querySelectorAll<HTMLElement>('.item') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (ev.key === 'Tab') this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: Event) { if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.close(); }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.open()) this.close(true); }
}

/** Íconos de línea para las opciones de los menús */
export const ICONS = {
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  save: 'M6 3h12v18l-6-4-6 4V3z',
  unsave: 'M6 3h12v18l-6-4-6 4V3zM4 4l16 16',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  profile: 'M16 8a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0',
};

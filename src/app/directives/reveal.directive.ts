import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const MOTION_OK = '(prefers-reduced-motion: no-preference)';

let layoutObserver: ResizeObserver | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/** Recalcula los ScrollTriggers cuando cambia la altura de la página (datos asíncronos, imágenes). */
function watchLayout(): void {
  if (layoutObserver || typeof ResizeObserver === 'undefined') return;
  let lastHeight = document.body.scrollHeight;
  layoutObserver = new ResizeObserver(() => {
    const h = document.body.scrollHeight;
    if (Math.abs(h - lastHeight) < 2) return;
    lastHeight = h;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 180);
  });
  layoutObserver.observe(document.body);
}

/**
 * Revela un elemento (o sus hijos) al entrar en el viewport.
 *
 * - `appReveal`: 'up' (por defecto) | 'fade' | 'scale'
 * - `revealChildren`: selector de hijos para escalonar (stagger corto y acotado)
 * - `revealIndex`: posición en una lista renderizada con @for, para escalonar ítems sueltos
 */
@Directive({
  selector: '[appReveal]',
  standalone: true
})
export class RevealDirective implements AfterViewInit, OnDestroy {
  @Input() appReveal: '' | 'up' | 'fade' | 'scale' = '';
  @Input() revealChildren?: string;
  @Input() revealIndex = 0;
  @Input() revealDelay = 0;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private mm?: gsap.MatchMedia;

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.zone.runOutsideAngular(() => {
      watchLayout();
      const el = this.host.nativeElement;
      this.mm = gsap.matchMedia();
      this.mm.add(MOTION_OK, () => {
        const targets = this.revealChildren
          ? gsap.utils.toArray<HTMLElement>(this.revealChildren, el)
          : [el];
        if (!targets.length) return;

        const kind = this.appReveal || 'up';
        const from: gsap.TweenVars = { autoAlpha: 0 };
        if (kind === 'up') from.y = 18;
        if (kind === 'scale') from.scale = 0.96;

        const count = targets.length;
        const each = count > 1 ? Math.min(0.05, 0.24 / count) : 0;
        const delay = this.revealDelay + Math.min(this.revealIndex * 0.04, 0.2);
        const inView = el.getBoundingClientRect().top < window.innerHeight * 0.9;

        gsap.from(targets, {
          ...from,
          duration: kind === 'fade' ? 0.5 : 0.6,
          ease: 'power3.out',
          delay,
          stagger: each,
          clearProps: 'transform,opacity,visibility',
          scrollTrigger: inView
            ? undefined
            : { trigger: el, start: 'top 90%', once: true }
        });
      });
    });
  }

  ngOnDestroy(): void {
    this.mm?.revert();
  }
}

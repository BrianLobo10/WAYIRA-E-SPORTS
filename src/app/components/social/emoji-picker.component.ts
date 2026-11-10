import { Component, ElementRef, HostListener, computed, output, signal, viewChild, AfterViewInit } from '@angular/core';
import { gsap } from 'gsap';

/** Selector de emojis propio de WAYIRA: categorías, buscador en español, recientes y frecuentes. */
interface Cat { id: string; label: string; icon: string; items: [string, string][] }

const CATS: Cat[] = [
  { id: 'gamer', label: 'Gamer', icon: '🎮', items: [
    ['🎮', 'control juego gamer'], ['🕹️', 'joystick arcade'], ['🏆', 'trofeo copa ganar campeon'], ['🥇', 'oro primero medalla'], ['🥈', 'plata segundo'], ['🥉', 'bronce tercero'],
    ['⚔️', 'espadas pelea batalla'], ['🛡️', 'escudo tanque defensa'], ['🏹', 'arco tirador adc'], ['🗡️', 'daga asesino'], ['🪄', 'varita mago magia'], ['🔮', 'bola cristal mago'],
    ['👑', 'corona rey'], ['💎', 'diamante'], ['🎯', 'diana objetivo'], ['🧠', 'cerebro estrategia'], ['⚡', 'rayo rapido'], ['🔥', 'fuego racha'],
    ['💀', 'calavera muerte'], ['👻', 'fantasma'], ['🐉', 'dragon'], ['🐺', 'lobo'], ['🦅', 'aguila'], ['🚀', 'cohete'],
    ['📈', 'subir elo'], ['📉', 'bajar elo'], ['🎲', 'dado suerte'], ['🧩', 'pieza'], ['🗺️', 'mapa'], ['⏱️', 'tiempo'],
  ] },
  { id: 'caras', label: 'Caras', icon: '😀', items: [
    ['😀', 'feliz sonrisa'], ['😁', 'sonrisa dientes'], ['😂', 'risa llorar jaja'], ['🤣', 'carcajada jaja'], ['😅', 'sudor nervios'], ['😊', 'feliz'],
    ['😍', 'enamorado amor'], ['🥰', 'amor corazones'], ['😘', 'beso'], ['😎', 'gafas cool'], ['🤩', 'estrellas wow'], ['🥳', 'fiesta celebrar'],
    ['😏', 'picaro'], ['🤔', 'pensar duda'], ['🤨', 'sospecha ceja'], ['😐', 'neutral'], ['🙄', 'ojos aburrido'], ['😴', 'dormir sueño'],
    ['😮', 'sorpresa wow'], ['😱', 'grito miedo'], ['😢', 'triste llorar'], ['😭', 'llanto'], ['😤', 'resoplar'], ['😡', 'enojo rabia'],
    ['🤬', 'insulto furia'], ['🥶', 'frio'], ['🥵', 'calor'], ['🤯', 'mente explota'], ['🫡', 'saludo'], ['🤝', 'trato acuerdo'],
  ] },
  { id: 'gestos', label: 'Gestos', icon: '👍', items: [
    ['👍', 'bien like pulgar'], ['👎', 'mal pulgar abajo'], ['👏', 'aplausos'], ['🙌', 'celebrar manos'], ['🙏', 'gracias por favor'], ['💪', 'fuerza musculo'],
    ['👊', 'puño'], ['✌️', 'paz victoria'], ['🤞', 'suerte dedos'], ['👌', 'perfecto ok'], ['🤙', 'llamar'], ['👋', 'hola adios'],
    ['👀', 'ojos mirar'], ['🫶', 'corazon manos'], ['✍️', 'escribir'], ['🤌', 'pellizco italiano'],
  ] },
  { id: 'simbolos', label: 'Símbolos', icon: '❤️', items: [
    ['❤️', 'corazon amor rojo'], ['🧡', 'corazon naranja'], ['💛', 'corazon amarillo'], ['💚', 'corazon verde'], ['💙', 'corazon azul'], ['💜', 'corazon morado'],
    ['🖤', 'corazon negro'], ['💔', 'corazon roto'], ['💯', 'cien'], ['✅', 'check listo'], ['❌', 'equis no'], ['⚠️', 'alerta'],
    ['❓', 'pregunta'], ['❗', 'exclamacion'], ['⭐', 'estrella'], ['✨', 'brillo'], ['💥', 'explosion'], ['💤', 'dormir'],
    ['🎉', 'fiesta confeti'], ['🎊', 'celebracion'], ['🔔', 'campana aviso'], ['📢', 'anuncio'], ['🆚', 'versus vs'], ['🔝', 'top'],
  ] },
  { id: 'comida', label: 'Comida', icon: '🍕', items: [
    ['🍕', 'pizza'], ['🍔', 'hamburguesa'], ['🌮', 'taco'], ['🍟', 'papas'], ['🌭', 'perro caliente'], ['🍿', 'palomitas'],
    ['🍩', 'dona'], ['🍫', 'chocolate'], ['☕', 'cafe tinto'], ['🧃', 'jugo'], ['🥤', 'gaseosa'], ['🍻', 'brindis'],
    ['🥔', 'papa potato'], ['🍌', 'banano'], ['🥑', 'aguacate'], ['🍗', 'pollo'],
  ] },
  { id: 'naturaleza', label: 'Naturaleza', icon: '🌴', items: [
    ['🌴', 'palmera guajira playa'], ['🌵', 'cactus desierto'], ['🌊', 'ola mar'], ['☀️', 'sol'], ['🌙', 'luna noche'], ['⛈️', 'tormenta'],
    ['🌈', 'arcoiris'], ['❄️', 'nieve'], ['🐐', 'chivo goat'], ['🦩', 'flamenco'], ['🐢', 'tortuga'], ['🐈', 'gato'],
    ['🐕', 'perro'], ['🦊', 'zorro'], ['🐸', 'rana'], ['🦄', 'unicornio'],
  ] },
];

const RECENT_KEY = 'wayira-emoji-recientes';
const DEFAULT_FREQUENT = ['😂', '🔥', '👍', '❤️', '🏆', '😎', '😭', '🎮'];

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  template: `
    <div #box class="picker" role="dialog" aria-label="Elegir emoji" (click)="$event.stopPropagation()">
      <input #search class="search" type="search" placeholder="Buscar emoji…" aria-label="Buscar emoji"
             [value]="query()" (input)="query.set($any($event.target).value)" (keydown.escape)="close.emit()" />
      @if (!query()) {
        <div class="tabs" role="tablist" aria-label="Categorías">
          <button type="button" role="tab" class="tab" [class.is-on]="cat() === 'recientes'" [attr.aria-selected]="cat() === 'recientes'" title="Recientes" (click)="cat.set('recientes')">🕘</button>
          @for (c of cats; track c.id) {
            <button type="button" role="tab" class="tab" [class.is-on]="cat() === c.id" [attr.aria-selected]="cat() === c.id" [title]="c.label" (click)="cat.set(c.id)">{{ c.icon }}</button>
          }
        </div>
      }
      <p class="cat-title">{{ query() ? 'Resultados' : catLabel() }}</p>
      <div class="grid">
        @for (e of visible(); track e) {
          <button type="button" class="emoji" (click)="pick(e)" [attr.aria-label]="e">{{ e }}</button>
        } @empty {
          <p class="empty">Nada con «{{ query() }}».</p>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { position: absolute; z-index: 50; }
    .picker { width: 300px; max-width: calc(100vw - 24px); padding: 10px; background: var(--surface-3); border-radius: 6px; box-shadow: var(--shadow-pop); }
    .search { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--border-input, var(--border)); border-radius: 4px; background: var(--surface-1); color: var(--white); font: inherit; font-size: 14px; }
    .search:focus { outline: 2px solid var(--volt); outline-offset: 0; border-color: transparent; }
    .tabs { display: flex; gap: 2px; margin-top: 8px; overflow-x: auto; scrollbar-width: none; }
    .tab { flex: 1; min-width: 34px; height: 34px; border: 0; border-bottom: 2px solid transparent; background: none; font-size: 18px; cursor: pointer; opacity: .6; }
    .tab.is-on { opacity: 1; border-bottom-color: var(--volt); }
    .tab:focus-visible, .emoji:focus-visible { outline: 2px solid var(--volt); outline-offset: 1px; }
    .cat-title { margin: 8px 2px 4px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-secondary); }
    .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; max-height: 200px; overflow-y: auto; }
    .emoji { aspect-ratio: 1; border: 0; border-radius: 4px; background: none; font-size: 22px; line-height: 1; cursor: pointer; }
    .emoji:hover { background: var(--surface-2); }
    .empty { grid-column: 1 / -1; margin: 12px 0; text-align: center; font-size: 13px; color: var(--text-secondary); }
  `],
})
export class EmojiPickerComponent implements AfterViewInit {
  picked = output<string>();
  close = output<void>();
  readonly cats = CATS;
  query = signal('');
  recents = signal<string[]>(readRecents());
  cat = signal(this.recents().length ? 'recientes' : 'gamer');
  private box = viewChild<ElementRef<HTMLElement>>('box');
  private searchEl = viewChild<ElementRef<HTMLInputElement>>('search');

  catLabel = computed(() => this.cat() === 'recientes' ? 'Recientes' : CATS.find((c) => c.id === this.cat())?.label ?? '');
  visible = computed(() => {
    const q = normalize(this.query());
    if (q) return CATS.flatMap((c) => c.items).filter(([, k]) => normalize(k).includes(q)).map(([e]) => e);
    if (this.cat() === 'recientes') return this.recents().length ? this.recents() : DEFAULT_FREQUENT;
    return CATS.find((c) => c.id === this.cat())?.items.map(([e]) => e) ?? [];
  });

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    // En pantallas táctiles no se abre el teclado sin que la persona lo pida
    if (matchMedia('(hover: hover)').matches) this.searchEl()?.nativeElement.focus();
    const el = this.box()?.nativeElement;
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(el, { autoAlpha: 0, y: 6, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' });
    }
  }

  pick(e: string) {
    const next = [e, ...this.recents().filter((x) => x !== e)].slice(0, 24);
    this.recents.set(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento local */ }
    this.picked.emit(e);
  }

  @HostListener('document:click', ['$event'])
  onDoc(ev: Event) { if (!this.host.nativeElement.contains(ev.target as Node)) this.close.emit(); }
  @HostListener('document:keydown.escape')
  onEsc() { this.close.emit(); }
}

/** Emojis más usados por esta persona (para la barra rápida) */
export function frequentEmojis(): string[] {
  const r = readRecents();
  return [...r, ...DEFAULT_FREQUENT.filter((e) => !r.includes(e))].slice(0, 8);
}

function readRecents(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 24) : []; }
  catch { return []; }
}

function normalize(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

/** Inserta texto en la posición del cursor de un textarea/input y devuelve el nuevo valor */
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement | null | undefined, current: string, text: string): string {
  if (!el) return current + text;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const value = current.slice(0, start) + text + current.slice(end);
  queueMicrotask(() => { el.focus(); const pos = start + text.length; el.setSelectionRange(pos, pos); });
  return value;
}

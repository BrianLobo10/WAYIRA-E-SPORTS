import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { friendly } from './content.service';

/**
 * Colores de la web, controlados por el Superadmin desde /control/apariencia.
 * Se eligen 6 colores base; el resto (superficies elevadas, hover, texto sobre acento,
 * transparencias) se calcula para que todo combine y se lea bien.
 */
export interface ThemeColors {
  bg: string;            // Fondo de la página
  surface: string;       // Tarjetas y paneles
  accent: string;        // Color de marca: botones, enlaces, destacados
  alert: string;         // En vivo, errores, acciones destructivas
  text: string;          // Texto principal
  textSecondary: string; // Texto secundario
}

export const DEFAULT_THEME: ThemeColors = {
  bg: '#121211',
  surface: '#1A1A18',
  accent: '#D7FF3F',
  alert: '#FF5A36',
  text: '#ECEAE3',
  textSecondary: '#A3A19A',
};

export const THEME_PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: 'WAYIRA original', colors: DEFAULT_THEME },
  { name: 'Hielo', colors: { bg: '#0F1216', surface: '#161B21', accent: '#7CC4FF', alert: '#FF6B5A', text: '#E8EDF2', textSecondary: '#9AA6B2' } },
  { name: 'Brasa', colors: { bg: '#141110', surface: '#1C1816', accent: '#FF8A3D', alert: '#FF4D6A', text: '#F0E9E4', textSecondary: '#A99E97' } },
  { name: 'Amatista', colors: { bg: '#121017', surface: '#1A1721', accent: '#B79CFF', alert: '#FF5C7A', text: '#ECE8F2', textSecondary: '#A39DB0' } },
  { name: 'Esmeralda', colors: { bg: '#0F1412', surface: '#161D1A', accent: '#4BE3A0', alert: '#FF6A4D', text: '#E6EFEA', textSecondary: '#97A69F' } },
  { name: 'Oro', colors: { bg: '#13120F', surface: '#1B1A16', accent: '#F2C14E', alert: '#FF5A4A', text: '#EFEBE1', textSecondary: '#A8A293' } },
];

/** Mismo nombre que usa el script en línea de index.html */
const CACHE_KEY = 'wayira-theme-vars';
const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
// Utilidades de color (sin librerías)
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Mezcla dos colores: t=0 → a, t=1 → b */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Luminancia relativa WCAG */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores (1 a 21) */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texto que se lee mejor encima de un color (el fondo oscuro del tema o blanco) */
function inkOn(color: string, darkInk: string): string {
  return contrast(color, darkInk) >= contrast(color, '#FFFFFF') ? darkInk : '#FFFFFF';
}

export function isValidTheme(v: unknown): v is ThemeColors {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]).every((k) => typeof o[k] === 'string' && HEX.test(o[k] as string));
}

/** Tema completo a partir de uno parcial (lo que falte se toma del original) */
export function completeTheme(partial: Partial<ThemeColors> | null | undefined): ThemeColors {
  const t = { ...DEFAULT_THEME };
  for (const k of Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]) {
    const v = partial?.[k];
    if (typeof v === 'string' && HEX.test(v)) t[k] = v.toUpperCase();
  }
  return t;
}

/** Variables CSS que produce un tema (las mismas que define styles.css) */
export function themeVariables(t: ThemeColors): Record<string, string> {
  const rgb = (h: string) => hexToRgb(h).join(', ');
  const ink = inkOn(t.accent, t.bg);
  return {
    '--bg': t.bg,
    '--surface-1': t.surface,
    '--surface-2': mix(t.surface, t.text, 0.04),
    '--surface-3': mix(t.surface, t.text, 0.08),
    '--teal-pri': mix(t.surface, t.text, 0.1),
    '--teal-hover': mix(t.surface, t.text, 0.15),
    '--teal-500': mix(t.surface, t.text, 0.12),
    '--volt': t.accent,
    '--volt-rgb': rgb(t.accent),
    '--volt-ink': ink,
    '--accent-hover': mix(t.accent, '#FFFFFF', 0.3),
    '--ember': t.alert,
    '--ember-rgb': rgb(t.alert),
    '--ember-text': mix(t.alert, '#FFFFFF', 0.2),
    '--white': t.text,
    '--text-secondary': t.textSecondary,
    '--teal-muted': t.textSecondary,
    '--text-muted': mix(t.textSecondary, t.bg, 0.2),
  };
}

/** Pinta el tema en <html>. Con el original se quitan los estilos en línea y manda styles.css. */
export function applyTheme(t: ThemeColors): void {
  const root = document.documentElement;
  const isDefault = (Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]).every((k) => t[k].toUpperCase() === DEFAULT_THEME[k].toUpperCase());
  for (const [name, value] of Object.entries(themeVariables(t))) {
    if (isDefault) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}

/**
 * Guarda en este navegador las variables ya calculadas del tema. El script en línea de index.html
 * las aplica antes de pintar nada, así la web abre directamente con los colores elegidos.
 * Para el tema original se guarda {} (no hay nada que aplicar, pero ya no hay que esperar).
 */
function cacheTheme(t: ThemeColors): void {
  try {
    const isDefault = (Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]).every((k) => t[k].toUpperCase() === DEFAULT_THEME[k].toUpperCase());
    localStorage.setItem(CACHE_KEY, JSON.stringify(isDefault ? {} : themeVariables(t)));
  } catch {
    /* sin almacenamiento (modo privado): la próxima visita esperará al tema guardado */
  }
}

/** Quita la espera de la primera visita (ver index.html) */
function revealPage(): void {
  document.documentElement.classList.remove('theme-pending');
}

/** Revisiones de legibilidad (WCAG AA) que se muestran en el panel */
export interface ThemeCheck {
  label: string;
  ratio: number;
  min: number;
  ok: boolean;
}

export function themeChecks(t: ThemeColors): ThemeCheck[] {
  const ink = inkOn(t.accent, t.bg);
  const list: [string, string, string, number][] = [
    ['Texto sobre el fondo', t.text, t.bg, 4.5],
    ['Texto sobre tarjetas', t.text, t.surface, 4.5],
    ['Texto secundario sobre el fondo', t.textSecondary, t.bg, 4.5],
    ['Texto de los botones de acento', ink, t.accent, 4.5],
    ['Acento sobre el fondo (enlaces, iconos)', t.accent, t.bg, 3],
    ['Alerta sobre el fondo', mix(t.alert, '#FFFFFF', 0.2), t.bg, 3],
  ];
  return list.map(([label, a, b, min]) => {
    const ratio = contrast(a, b);
    return { label, ratio: Math.round(ratio * 10) / 10, min, ok: ratio >= min };
  });
}

/** La web usa bordes y capas claras semitransparentes: necesita un fondo oscuro. */
export function isDarkEnough(bg: string): boolean {
  return luminance(bg) <= 0.06;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly sb = inject(SupabaseService).client;
  /** Tema guardado (el que ven todos los visitantes) */
  readonly saved = signal<ThemeColors>(DEFAULT_THEME);

  /** Lee el tema guardado y lo aplica. Si falla, se queda el que haya. */
  async load(): Promise<void> {
    try {
      const { data } = await this.sb.from('site_config').select('value').eq('key', 'theme').maybeSingle();
      const t = completeTheme((data as { value?: Partial<ThemeColors> } | null)?.value);
      this.saved.set(t);
      applyTheme(t);
      cacheTheme(t);
    } catch {
      /* sin conexión: se mantiene el tema en caché o el original */
    } finally {
      revealPage();
    }
  }

  /** Vista previa en vivo (solo en este navegador, sin guardar) */
  preview(t: ThemeColors): void {
    applyTheme(t);
  }

  /** Vuelve a lo guardado (al salir sin guardar) */
  revert(): void {
    applyTheme(this.saved());
  }

  /** Guarda para todos. Solo el Superadmin puede (la base lo comprueba y lo audita). */
  async save(t: ThemeColors): Promise<void> {
    const value = { ...t };
    const { data, error } = await this.sb.from('site_config').update({ value }).eq('key', 'theme').select('key');
    if (error) throw new Error(friendly(error));
    if (!data?.length) {
      const { error: insertError } = await this.sb.from('site_config').insert({ key: 'theme', value });
      if (insertError) throw new Error(friendly(insertError));
    }
    this.saved.set(t);
    applyTheme(t);
    cacheTheme(t);
  }
}

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
  headingFont: string;   // Tipografía de títulos
  bodyFont: string;      // Tipografía de texto normal
}

export const DEFAULT_THEME: ThemeColors = {
  bg: '#121211',
  surface: '#1A1A18',
  accent: '#D7FF3F',
  alert: '#FF5A36',
  text: '#ECEAE3',
  textSecondary: '#A3A19A',
  headingFont: 'Newsreader',
  bodyFont: 'Inter',
};

/**
 * Catálogo de fuentes (Google Fonts). `gf` es el trozo de URL de Google Fonts; sin `gf`, la fuente es del sistema.
 * `role`: dónde se puede usar. Las fuentes de títulos pueden ser extravagantes; las de texto deben leerse bien.
 * IMPORTANTE: si añades una fuente aquí, añádela también a la lista de la base de datos (migración tema_fuentes).
 */
export type FontRole = 'heading' | 'body' | 'both';
export interface FontOption { value: string; label: string; category: string; stack: string; gf?: string; role: FontRole }

const F = (value: string, category: string, fallback: string, role: FontRole, weights = '', label = value): FontOption => ({
  value, label, category, role,
  stack: `'${value}', ${fallback}`,
  gf: value.replace(/ /g, '+') + (weights ? ':wght@' + weights : ''),
});
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = 'system-ui, Arial, sans-serif';
const IMPACT = 'Impact, Haettenschweiler, sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';
const HAND = "'Comic Sans MS', cursive";

export const FONT_CATEGORIES = ['Clásicas', 'Modernas', 'Impacto', 'Gamer', 'Retro y píxel', 'Manuscritas', 'Locas', 'Lectura'] as const;

export const FONT_CATALOG: FontOption[] = [
  // Clásicas (serif)
  { value: 'Newsreader', label: 'Newsreader', category: 'Clásicas', role: 'heading', stack: "'Newsreader', Georgia, 'Times New Roman', serif" },
  F('Lora', 'Clásicas', SERIF, 'both', '400;500;600'),
  F('Playfair Display', 'Clásicas', SERIF, 'heading', '400;600;800'),
  F('Cormorant Garamond', 'Clásicas', SERIF, 'both', '400;500;600'),
  F('DM Serif Display', 'Clásicas', SERIF, 'heading'),
  F('Libre Baskerville', 'Clásicas', SERIF, 'heading', '400;700'),
  F('Merriweather', 'Clásicas', SERIF, 'heading', '400;700'),
  F('Bitter', 'Clásicas', SERIF, 'heading', '400;600'),
  F('Roboto Slab', 'Clásicas', SERIF, 'heading', '400;600'),
  F('Cinzel', 'Clásicas', SERIF, 'heading', '400;600;800'),
  { value: 'Georgia', label: 'Georgia (sistema)', category: 'Clásicas', role: 'heading', stack: "Georgia, 'Times New Roman', serif" },
  // Modernas
  F('Montserrat', 'Modernas', SANS, 'heading', '400;600;800'),
  F('Poppins', 'Modernas', SANS, 'both', '400;500;600;700'),
  F('Space Grotesk', 'Modernas', SANS, 'both', '400;500;700'),
  F('Unbounded', 'Modernas', SANS, 'heading', '400;600;800'),
  F('Syne', 'Modernas', SANS, 'heading', '500;700;800'),
  F('Bricolage Grotesque', 'Modernas', SANS, 'heading', '400;600;800'),
  F('Sora', 'Modernas', SANS, 'both', '400;600'),
  F('Outfit', 'Modernas', SANS, 'both', '400;500;600'),
  F('Lexend', 'Modernas', SANS, 'both', '400;500;600'),
  // Impacto
  F('Bebas Neue', 'Impacto', IMPACT, 'heading'),
  F('Anton', 'Impacto', IMPACT, 'heading'),
  F('Archivo Black', 'Impacto', IMPACT, 'heading'),
  F('Oswald', 'Impacto', IMPACT, 'heading', '400;600'),
  F('Teko', 'Impacto', IMPACT, 'heading', '500;600'),
  F('Russo One', 'Impacto', IMPACT, 'heading'),
  F('Black Ops One', 'Impacto', IMPACT, 'heading'),
  F('Alfa Slab One', 'Impacto', IMPACT, 'heading'),
  // Gamer / futuristas
  F('Orbitron', 'Gamer', SANS, 'heading', '500;700;900'),
  F('Audiowide', 'Gamer', SANS, 'heading'),
  F('Michroma', 'Gamer', SANS, 'heading'),
  F('Bungee', 'Gamer', IMPACT, 'heading'),
  F('Righteous', 'Gamer', SANS, 'heading'),
  F('Chakra Petch', 'Gamer', SANS, 'both', '400;500;700'),
  F('Exo 2', 'Gamer', SANS, 'both', '400;500;700'),
  F('Rajdhani', 'Gamer', SANS, 'both', '500;600;700'),
  F('Saira Stencil One', 'Gamer', IMPACT, 'heading'),
  // Retro y píxel
  F('Press Start 2P', 'Retro y píxel', MONO, 'heading'),
  F('VT323', 'Retro y píxel', MONO, 'both'),
  F('Silkscreen', 'Retro y píxel', MONO, 'heading', '400;700'),
  F('Monoton', 'Retro y píxel', IMPACT, 'heading'),
  F('Bungee Shade', 'Retro y píxel', IMPACT, 'heading'),
  F('Major Mono Display', 'Retro y píxel', MONO, 'heading'),
  F('Space Mono', 'Retro y píxel', MONO, 'both', '400;700'),
  F('Inconsolata', 'Retro y píxel', MONO, 'body', '400;700'),
  // Manuscritas
  F('Pacifico', 'Manuscritas', HAND, 'heading'),
  F('Permanent Marker', 'Manuscritas', HAND, 'heading'),
  F('Lobster', 'Manuscritas', HAND, 'heading'),
  F('Caveat', 'Manuscritas', HAND, 'both', '400;600'),
  F('Kalam', 'Manuscritas', HAND, 'both', '400;700'),
  F('Sedgwick Ave Display', 'Manuscritas', HAND, 'heading'),
  F('Comic Neue', 'Manuscritas', HAND, 'body', '400;700'),
  // Locas
  F('Creepster', 'Locas', IMPACT, 'heading'),
  F('Nosifer', 'Locas', IMPACT, 'heading'),
  F('Metal Mania', 'Locas', IMPACT, 'heading'),
  F('Rubik Glitch', 'Locas', IMPACT, 'heading'),
  F('Faster One', 'Locas', IMPACT, 'heading'),
  F('UnifrakturMaguntia', 'Locas', SERIF, 'heading'),
  F('Bangers', 'Locas', IMPACT, 'heading'),
  F('Rubik Mono One', 'Locas', IMPACT, 'heading'),
  // Lectura (texto normal)
  { value: 'Inter', label: 'Inter', category: 'Lectura', role: 'body', stack: "'Inter', system-ui, sans-serif" },
  F('Manrope', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('Lato', 'Lectura', SANS, 'body', '400;700'),
  F('Source Sans 3', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('DM Sans', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('Nunito Sans', 'Lectura', SANS, 'body', '400;600;700'),
  F('Open Sans', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('PT Sans', 'Lectura', SANS, 'body', '400;700'),
  F('Raleway', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('Roboto', 'Lectura', SANS, 'body', '400;500;700'),
  F('Rubik', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('Ubuntu', 'Lectura', SANS, 'body', '400;500;700'),
  F('Work Sans', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('Atkinson Hyperlegible', 'Lectura', SANS, 'body', '400;700'),
  F('Fira Sans', 'Lectura', SANS, 'body', '400;500;600'),
  F('IBM Plex Sans', 'Lectura', SANS, 'body', '400;500;600'),
  F('Libre Franklin', 'Lectura', SANS, 'body', '400;500;600'),
  F('Josefin Sans', 'Lectura', SANS, 'body', '400;500;600'),
  F('Quicksand', 'Lectura', SANS, 'body', '400;500;600;700'),
  F('Barlow', 'Lectura', SANS, 'body', '400;500;600;700'),
];

export const HEADING_FONTS = FONT_CATALOG.filter((f) => f.role !== 'body');
export const BODY_FONTS = FONT_CATALOG.filter((f) => f.role !== 'heading');

/** Fuentes que ya carga index.html (no hace falta pedirlas otra vez) */
const BASE_FONTS = new Set(['Newsreader', 'Inter', 'Georgia', 'Rajdhani']);

/** URL de Google Fonts para un conjunto de fuentes del catálogo (vacía si no hace falta ninguna) */
export function googleFontsUrl(values: string[]): string {
  const specs = [...new Set(values)]
    .filter((v) => !BASE_FONTS.has(v))
    .map((v) => FONT_CATALOG.find((f) => f.value === v)?.gf)
    .filter((g): g is string => !!g);
  return specs.length ? 'https://fonts.googleapis.com/css2?' + specs.map((g) => 'family=' + g).join('&') + '&display=swap' : '';
}

/** Inserta (o cambia) un <link> de Google Fonts identificado por `id` */
export function loadFontCss(id: string, url: string): void {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!url) { link?.remove(); return; }
  if (link?.href === url) return;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = url;
}

type Palette = Pick<ThemeColors, 'bg' | 'surface' | 'accent' | 'alert' | 'text' | 'textSecondary'>;
const P = (bg: string, surface: string, accent: string, alert: string, text: string, textSecondary: string): Palette =>
  ({ bg, surface, accent, alert, text, textSecondary });

/** Paletas de color: solo cambian colores, respetan las fuentes elegidas */
export const COLOR_PRESETS: { name: string; group: string; colors: Palette }[] = [
  { name: 'WAYIRA', group: 'Sobrias', colors: P('#121211', '#1A1A18', '#D7FF3F', '#FF5A36', '#ECEAE3', '#A3A19A') },
  { name: 'Hielo', group: 'Sobrias', colors: P('#0F1216', '#161B21', '#7CC4FF', '#FF6B5A', '#E8EDF2', '#9AA6B2') },
  { name: 'Brasa', group: 'Sobrias', colors: P('#141110', '#1C1816', '#FF8A3D', '#FF4D6A', '#F0E9E4', '#A99E97') },
  { name: 'Amatista', group: 'Sobrias', colors: P('#121017', '#1A1721', '#B79CFF', '#FF5C7A', '#ECE8F2', '#A39DB0') },
  { name: 'Esmeralda', group: 'Sobrias', colors: P('#0F1412', '#161D1A', '#4BE3A0', '#FF6A4D', '#E6EFEA', '#97A69F') },
  { name: 'Oro', group: 'Sobrias', colors: P('#13120F', '#1B1A16', '#F2C14E', '#FF5A4A', '#EFEBE1', '#A8A293') },
  { name: 'Medianoche', group: 'Sobrias', colors: P('#090B12', '#111522', '#5D8EFF', '#FF5470', '#F1F4FF', '#929BB6') },
  { name: 'Arena', group: 'Sobrias', colors: P('#17130D', '#252016', '#E9B872', '#D95D39', '#F5EDE1', '#B8AA91') },
  { name: 'Lavanda', group: 'Sobrias', colors: P('#13101A', '#211A2E', '#C49BFF', '#FF7597', '#F2ECFA', '#ADA1BC') },
  { name: 'Cobalto', group: 'Sobrias', colors: P('#0B101B', '#141D2E', '#4D7FFF', '#FFB84D', '#EDF3FF', '#96A4BA') },
  { name: 'Selva', group: 'Sobrias', colors: P('#091311', '#11211D', '#55D68A', '#FF7861', '#EAF8F1', '#93ACA2') },
  { name: 'Grafito', group: 'Sobrias', colors: P('#151417', '#252329', '#FF86BA', '#FF7557', '#F6EFF3', '#B2A7AD') },
  { name: 'Turquesa', group: 'Sobrias', colors: P('#091314', '#102225', '#2ED3C6', '#FF9D4D', '#EDFDF9', '#91AAA8') },
  { name: 'Rojo', group: 'Intensas', colors: P('#140D0D', '#241617', '#FF4A3D', '#FFC857', '#FFF1ED', '#BFA6A1') },
  { name: 'Neón', group: 'Intensas', colors: P('#0B0E0A', '#151A12', '#00E8A4', '#FF3EA5', '#EFFFEA', '#91A68E') },
  { name: 'Magenta', group: 'Intensas', colors: P('#160D16', '#261A27', '#EF55C1', '#FFCE58', '#FAEDF7', '#B7A3B3') },
  { name: 'Cyberpunk', group: 'Locas', colors: P('#0D0221', '#1A0B3A', '#FF2A6D', '#05D9E8', '#F5F3FF', '#B4A9D6') },
  { name: 'Vaporwave', group: 'Locas', colors: P('#1A0B2E', '#2A1548', '#FF71CE', '#01CDFE', '#FFF0FB', '#C4A8D8') },
  { name: 'Matrix', group: 'Locas', colors: P('#020A04', '#08160B', '#00FF41', '#FF3B3B', '#D8FFE0', '#7FB38A') },
  { name: 'Lava', group: 'Locas', colors: P('#1A0500', '#2B0D04', '#FF4500', '#FFD000', '#FFEDE5', '#C89A85') },
  { name: 'Tóxico', group: 'Locas', colors: P('#0A0F00', '#141C05', '#ADFF02', '#FF00E6', '#F4FFE0', '#A3B386') },
  { name: 'Sangre', group: 'Locas', colors: P('#0F0000', '#1F0606', '#E10600', '#FFB000', '#FFE9E6', '#C79A94') },
  { name: 'Terminal ámbar', group: 'Locas', colors: P('#0A0700', '#161004', '#FFB000', '#FF4F2E', '#FFE8B8', '#B8975C') },
  { name: 'Ártico', group: 'Locas', colors: P('#06121A', '#0D2130', '#9EF0FF', '#FF7AA2', '#EAFBFF', '#8FB3C2') },
  { name: 'Atardecer', group: 'Locas', colors: P('#1B0B1A', '#2B1229', '#FF9E3D', '#FF3D7F', '#FFF0E6', '#C9A3B8') },
  { name: 'Sakura', group: 'Locas', colors: P('#170B12', '#26131F', '#FF8FB8', '#FFD166', '#FFEFF5', '#C7A2B4') },
  { name: 'Galaxia', group: 'Locas', colors: P('#07051A', '#120E2E', '#8C7BFF', '#3DFFD6', '#EEEBFF', '#A39FCC') },
  { name: 'Hextech', group: 'Locas', colors: P('#010A13', '#0A1428', '#C8AA6E', '#0AC8B9', '#F0E6D2', '#A09B8C') },
];

/** Combos completos: colores + fuentes, para cambiar de personalidad con un clic */
export const STYLE_PRESETS: { name: string; theme: ThemeColors }[] = [
  { name: 'Arcade', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Neón')!.colors, headingFont: 'Press Start 2P', bodyFont: 'Chakra Petch' } },
  { name: 'Cyberpunk 2077', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Cyberpunk')!.colors, headingFont: 'Orbitron', bodyFont: 'Exo 2' } },
  { name: 'Noche de terror', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Sangre')!.colors, headingFont: 'Creepster', bodyFont: 'Barlow' } },
  { name: 'Hacker', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Matrix')!.colors, headingFont: 'VT323', bodyFont: 'Space Mono' } },
  { name: 'Estadio', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Lava')!.colors, headingFont: 'Bebas Neue', bodyFont: 'Barlow' } },
  { name: 'Retro 80s', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Vaporwave')!.colors, headingFont: 'Monoton', bodyFont: 'Outfit' } },
  { name: 'Heavy metal', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Terminal ámbar')!.colors, headingFont: 'Metal Mania', bodyFont: 'Rubik' } },
  { name: 'Grafiti', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Tóxico')!.colors, headingFont: 'Sedgwick Ave Display', bodyFont: 'Rubik' } },
  { name: 'Runaterra', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Hextech')!.colors, headingFont: 'Cinzel', bodyFont: 'Lato' } },
  { name: 'Cómic', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Atardecer')!.colors, headingFont: 'Bangers', bodyFont: 'Comic Neue' } },
  { name: 'Editorial', theme: { ...COLOR_PRESETS.find((p) => p.name === 'WAYIRA')!.colors, headingFont: 'Playfair Display', bodyFont: 'Source Sans 3' } },
  { name: 'Militar', theme: { ...COLOR_PRESETS.find((p) => p.name === 'Selva')!.colors, headingFont: 'Black Ops One', bodyFont: 'Chakra Petch' } },
];

/** Compatibilidad: antes los temas listos traían colores y fuentes juntos */
export const THEME_PRESETS: { name: string; colors: ThemeColors }[] =
  COLOR_PRESETS.map((p) => ({ name: p.name, colors: { ...DEFAULT_THEME, ...p.colors } }));

/** Mismos nombres que usa el script en línea de index.html */
const CACHE_KEY = 'wayira-theme-vars';
const FONT_CACHE_KEY = 'wayira-theme-fonts';
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
  return (['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary'] as (keyof ThemeColors)[])
    .every((k) => typeof o[k] === 'string' && HEX.test(o[k] as string))
    && HEADING_FONTS.some((f) => f.value === o['headingFont'])
    && BODY_FONTS.some((f) => f.value === o['bodyFont']);
}

/** Tema completo a partir de uno parcial (lo que falte se toma del original) */
export function completeTheme(partial: Partial<ThemeColors> | null | undefined): ThemeColors {
  const t = { ...DEFAULT_THEME };
  for (const k of ['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary'] as (keyof ThemeColors)[]) {
    const v = partial?.[k];
    if (typeof v === 'string' && HEX.test(v)) t[k] = v.toUpperCase();
  }
  const headingFont = partial?.headingFont;
  const bodyFont = partial?.bodyFont;
  if (HEADING_FONTS.some((f) => f.value === headingFont)) t.headingFont = headingFont!;
  if (BODY_FONTS.some((f) => f.value === bodyFont)) t.bodyFont = bodyFont!;
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
    '--font-display': HEADING_FONTS.find((f) => f.value === t.headingFont)?.stack ?? HEADING_FONTS[0].stack,
    '--font-body': BODY_FONTS.find((f) => f.value === t.bodyFont)?.stack ?? BODY_FONTS[0].stack,
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
  // Solo se descargan las fuentes del tema (antes index.html cargaba el catálogo entero para todos)
  loadFontCss('theme-fonts', googleFontsUrl([t.headingFont, t.bodyFont]));
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
    const fontUrl = googleFontsUrl([t.headingFont, t.bodyFont]);
    if (fontUrl) localStorage.setItem(FONT_CACHE_KEY, fontUrl);
    else localStorage.removeItem(FONT_CACHE_KEY);
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
    const { data, error } = await this.sb.from('site_config')
      .update({ value })
      .eq('key', 'theme')
      .select('key');
    if (error) throw new Error(friendly(error));
    if (!data?.length) {
      const { error: insertError } = await this.sb.from('site_config')
        .insert({ key: 'theme', value })
        .select('key');
      if (insertError) throw new Error(friendly(insertError));
    }
    this.saved.set(t);
    applyTheme(t);
    cacheTheme(t);
  }
}

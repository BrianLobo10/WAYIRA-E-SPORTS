import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_THEME, COLOR_PRESETS, STYLE_PRESETS, FONT_CATALOG, FONT_CATEGORIES, HEADING_FONTS, BODY_FONTS, ThemeService, completeTheme,
  googleFontsUrl, isDarkEnough, loadFontCss, themeChecks, themeVariables,
  type FontOption, type ThemeColors,
} from '../../services/theme.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

const FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'accent', label: 'Acento', hint: 'Botones principales, enlaces, marcadores y destacados.' },
  { key: 'bg', label: 'Fondo', hint: 'Fondo de todas las páginas. Debe ser oscuro.' },
  { key: 'surface', label: 'Tarjetas', hint: 'Paneles, tarjetas y menús. Las capas elevadas se calculan solas.' },
  { key: 'text', label: 'Texto', hint: 'Títulos y texto principal.' },
  { key: 'textSecondary', label: 'Texto secundario', hint: 'Descripciones, fechas y etiquetas.' },
  { key: 'alert', label: 'Alerta', hint: 'En vivo, errores y acciones de borrar.' },
];

/**
 * Apariencia: el Superadmin elige los colores de la web, los prueba en vivo y los guarda para todos.
 * La base valida el formato (#RRGGBB) y registra cada cambio en la auditoría.
 */
@Component({
  selector: 'app-control-theme',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../staff/admin-ui.css'],
  templateUrl: './control-theme.component.html',
  styles: [`
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 16px; align-items: start; }
    @media (max-width: 1050px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .preset {
      display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 44px; padding: 0 12px 0 8px; border: 0; border-radius: 2px; cursor: pointer;
      background: var(--bg); color: var(--white); font: inherit; font-size: 13px; box-shadow: inset 0 0 0 1px var(--border);
    }
    .preset { text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .preset:hover { box-shadow: inset 0 0 0 1px var(--border-strong); }
    .preset.is-on { box-shadow: inset 0 0 0 2px var(--white); }
    .preset:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .dots { display: inline-flex; }
    .dots i { width: 14px; height: 14px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.2); }
    .dots i + i { margin-left: -4px; }
    .fields { display: flex; flex-direction: column; }
    .color-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) 112px; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
    .color-row:last-child { border-bottom: 0; }
    .swatch { position: relative; width: 48px; height: 40px; border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); overflow: hidden; cursor: pointer; }
    .swatch input { position: absolute; inset: -8px; width: calc(100% + 16px); height: calc(100% + 16px); border: 0; padding: 0; cursor: pointer; opacity: 0; }
    .swatch:focus-within { outline: 2px solid var(--volt); outline-offset: 2px; }
    .color-row .field__label { display: block; }
    .color-row .field__hint { display: block; margin-top: 2px; }
    .typography-fields { display: flex; flex-direction: column; }
    .typography-field { display: block; padding: 12px 0; }
    .typography-field:first-child { border-bottom: 1px solid var(--border-subtle); }
    .typography-field .field__label { display: block; }
    .typography-field .field__hint { display: block; margin-top: 2px; }
    .font-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .font-picker-mobile { display: none; width: 100%; min-height: 44px; margin-top: 10px; padding: 0 12px; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--white); }
    .font-option { min-width: 0; min-height: 76px; padding: 10px; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--white); cursor: pointer; text-align: left; }
    .font-option:hover { border-color: var(--border-strong); }
    .font-option.is-on { border-color: var(--volt); box-shadow: inset 0 0 0 1px var(--volt); }
    .font-option__sample { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-bottom: 6px; font-size: 28px; line-height: 1.2; }
    .font-option__sample--body { font-size: 16px; line-height: 1.35; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .font-option > span:last-child { display: block; color: var(--text-secondary); font-size: 11px; overflow-wrap: anywhere; }
    .font-selected-preview { margin-top: 12px; padding: 16px; border: 1px solid var(--border); background: var(--bg); }
    .font-selected-preview > span { display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .font-selected-preview strong { display: block; font-size: 26px; font-weight: 500; line-height: 1.15; }
    .font-selected-preview--body strong { font-size: 18px; font-weight: 400; line-height: 1.55; }

    @media (max-width: 560px) {
      .font-options { display: none; }
      .font-picker-mobile { display: block; }
    }
    @media (max-width: 560px) { .typography-field { grid-template-columns: 1fr; gap: 8px; } }
    @media (max-width: 850px) { .presets { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 560px) {
      .presets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .preset { min-height: 52px; padding: 8px; font-size: 12px; line-height: 1.15; }
      .preset .dots { flex: 0 0 auto; }
    }
    .group-title { margin: 14px 0 8px; font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--text-muted); }
    .group-title:first-child { margin-top: 0; }
    .styles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .style-card {
      display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 12px; border: 0; border-radius: 2px; cursor: pointer; text-align: left;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
    }
    .style-card:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,.3); }
    .style-card.is-on { box-shadow: inset 0 0 0 2px currentColor; }
    .style-card:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .style-card__title { font-size: clamp(16px, 1.6vw, 21px); line-height: 1.15; overflow-wrap: anywhere; }
    .style-card__meta { font-size: 11px; opacity: .75; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .style-card__bar { display: flex; gap: 4px; }
    .style-card__bar i { flex: 1; height: 4px; border-radius: 1px; }
    @media (max-width: 850px) { .styles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .cats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .cat { min-height: 32px; padding: 0 10px; border: 0; border-radius: 2px; cursor: pointer; font: inherit; font-size: 12px; background: var(--bg); color: var(--text-secondary); box-shadow: inset 0 0 0 1px var(--border); }
    .cat:hover { color: var(--white); }
    .cat.is-on { background: var(--white); color: var(--bg); box-shadow: none; }
    .cat:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .font-option__cat { display: block; margin-top: 2px; font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); }
    .font-options { max-height: 420px; overflow-y: auto; padding-right: 4px; }
    .hex { font-family: var(--font-mono); text-transform: uppercase; }
    .hex.is-bad { border-color: var(--ember); }
    .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .checks li { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    .checks .ok { color: var(--volt); }
    .checks .bad { color: var(--ember-text); }
    .ratio { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
    .sticky { position: sticky; top: calc(var(--header-h) + 16px); }
    @media (max-width: 1050px) { .sticky { position: static; } }
    .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 16px; }
    .bar .switch { margin-right: auto; }
    .dirty { font-size: 13px; color: var(--ember-text); }

    /* Vista previa: una mini página pintada con el borrador (variables locales) */
    .pv { padding: 20px; border-radius: 2px; background: var(--bg); color: var(--white); font-family: var(--font-body); box-shadow: inset 0 0 0 1px var(--border); }
    .pv__nav { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid var(--border); font-size: 13px; }
    .pv__brand { font-family: var(--font-display); font-size: 18px; margin-right: auto; }
    .pv__brand span { color: var(--volt); }
    .pv__link { color: var(--text-secondary); }
    .pv__link.is-on { color: var(--white); box-shadow: inset 0 -2px 0 var(--volt); padding-bottom: 4px; }
    .pv__kicker { margin: 0; font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--text-secondary); }
    .pv__title { margin: 6px 0 8px; font-family: var(--font-display); font-weight: 400; font-size: 30px; line-height: 1.05; }
    .pv__title em { font-style: normal; color: var(--volt); }
    .pv__lead { margin: 0 0 14px; font-size: 13px; line-height: 1.55; color: var(--text-secondary); }
    .pv__btns { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .pv__btn { display: inline-flex; align-items: center; min-height: 36px; padding: 0 14px; border-radius: 2px; font-size: 13px; font-weight: 600; }
    .pv__btn--primary { background: var(--volt); color: var(--volt-ink); }
    .pv__btn--ghost { box-shadow: inset 0 0 0 1px var(--border-strong); color: var(--white); }
    .pv__btn--danger { background: var(--ember); color: var(--volt-ink); }
    .pv__cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pv__card { padding: 14px; border-radius: 2px; background: var(--surface-1); box-shadow: inset 0 0 0 1px var(--border); }
    .pv__card--up { background: var(--surface-2); }
    .pv__card h4 { margin: 8px 0 4px; font-size: 14px; font-weight: 600; }
    .pv__card p { margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
    .pv__score { font-family: var(--font-score); font-weight: 700; font-size: 30px; line-height: 1; color: var(--volt); }
    .pv__live { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; color: var(--ember-text); }
    .pv__live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--ember); }
    .pv__tag { display: inline-flex; height: 20px; align-items: center; padding: 0 6px; border-radius: 2px; font-family: var(--font-mono); font-size: 10px; background: rgba(var(--volt-rgb), .12); color: var(--volt); }
    .pv__muted { font-size: 11px; color: var(--text-muted); margin-top: 8px; }
  `],
})
export class ControlThemeComponent implements OnInit, OnDestroy {
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly pv = viewChild<ElementRef<HTMLElement>>('pv');

  readonly fields = FIELDS;
  readonly colorGroups = ['Sobrias', 'Intensas', 'Locas'].map((g) => ({ name: g, items: COLOR_PRESETS.filter((p) => p.group === g) }));
  readonly stylePresets = STYLE_PRESETS;
  readonly headingFonts = HEADING_FONTS;
  readonly bodyFonts = BODY_FONTS;
  /** Pestaña de categoría abierta en cada selector de fuente */
  readonly headingCat = signal<string>('Todas');
  readonly bodyCat = signal<string>('Todas');
  readonly headingCats = ['Todas', ...FONT_CATEGORIES.filter((c) => HEADING_FONTS.some((f) => f.category === c))];
  readonly bodyCats = ['Todas', ...FONT_CATEGORIES.filter((c) => BODY_FONTS.some((f) => f.category === c))];
  readonly visibleHeading = computed(() => this.filterFonts(HEADING_FONTS, this.headingCat()));
  readonly visibleBody = computed(() => this.filterFonts(BODY_FONTS, this.bodyCat()));
  readonly draft = signal<ThemeColors>({ ...DEFAULT_THEME });
  readonly hexText = signal<Record<string, string>>({});
  readonly livePreview = signal(false);
  readonly saving = signal(false);
  readonly loaded = signal(false);

  readonly checks = computed(() => themeChecks(this.draft()));
  readonly failing = computed(() => this.checks().filter((c) => !c.ok));
  readonly darkOk = computed(() => isDarkEnough(this.draft().bg));
  readonly dirty = computed(() => !sameTheme(this.draft(), this.theme.saved()));
  readonly isDefault = computed(() => sameTheme(this.draft(), DEFAULT_THEME));
  /** Paleta activa: compara solo colores (las fuentes no cuentan) */
  readonly activePreset = computed(() => COLOR_PRESETS.find((p) => sameColors(p.colors, this.draft()))?.name ?? null);
  readonly activeStyle = computed(() => STYLE_PRESETS.find((p) => sameTheme(p.theme, this.draft()))?.name ?? null);

  constructor() {
    // La vista previa pequeña siempre muestra el borrador
    effect(() => {
      const el = this.pv()?.nativeElement;
      if (!el) return;
      for (const [k, v] of Object.entries(themeVariables(this.draft()))) el.style.setProperty(k, v);
    });
    // Con "Probar en toda la web" activado, toda la página usa el borrador (solo en este navegador)
    effect(() => {
      if (this.livePreview()) this.theme.preview(this.draft());
      else this.theme.revert();
    });
  }

  async ngOnInit() {
    // Solo en este panel se descarga el catálogo entero (para ver cada fuente con su forma real)
    loadFontCss('font-catalog', googleFontsUrl(FONT_CATALOG.map((f) => f.value)));
    await this.theme.load();
    this.setDraft(this.theme.saved());
    this.loaded.set(true);
  }

  ngOnDestroy() {
    // Salir sin guardar deja la web como estaba
    this.theme.revert();
    loadFontCss('font-catalog', '');
  }

  private setDraft(t: ThemeColors) {
    this.draft.set({ ...t });
    this.hexText.set({ ...t });
  }

  /** Paleta: cambia los colores y conserva las fuentes elegidas */
  usePreset(colors: Partial<ThemeColors>) {
    this.setDraft({ ...this.draft(), ...colors });
  }

  /** Combo: colores y fuentes a la vez */
  useStyle(theme: ThemeColors) {
    this.setDraft({ ...theme });
  }

  private filterFonts(list: FontOption[], cat: string): FontOption[] {
    return cat === 'Todas' ? list : list.filter((f) => f.category === cat);
  }

  stackOf(value: string): string {
    return FONT_CATALOG.find((f) => f.value === value)?.stack ?? 'inherit';
  }

  fontLabel(value: string): string {
    return FONT_CATALOG.find((f) => f.value === value)?.label ?? value;
  }

  pick(key: keyof ThemeColors, value: string) {
    const v = value.toUpperCase();
    this.draft.update((d) => ({ ...d, [key]: v }));
    this.hexText.update((h) => ({ ...h, [key]: v }));
  }

  typeHex(key: keyof ThemeColors, raw: string) {
    let v = raw.trim().toUpperCase();
    if (v && !v.startsWith('#')) v = '#' + v;
    this.hexText.update((h) => ({ ...h, [key]: v }));
    if (/^#[0-9A-F]{6}$/.test(v)) this.draft.update((d) => ({ ...d, [key]: v }));
  }

  setHeadingFont(value: string): void {
    this.draft.update((draft) => ({ ...draft, headingFont: value }));
  }

  setBodyFont(value: string): void {
    this.draft.update((draft) => ({ ...draft, bodyFont: value }));
  }

  headingFontStack(): string {
    return this.headingFonts.find((font) => font.value === this.draft().headingFont)?.stack ?? this.headingFonts[0].stack;
  }

  bodyFontStack(): string {
    return this.bodyFonts.find((font) => font.value === this.draft().bodyFont)?.stack ?? this.bodyFonts[0].stack;
  }

  hexBad(key: keyof ThemeColors): boolean {
    return !/^#[0-9A-F]{6}$/i.test(this.hexText()[key] ?? '');
  }

  discard() {
    this.setDraft(this.theme.saved());
    this.livePreview.set(false);
  }

  async save() {
    if (!this.darkOk()) {
      this.toast.warning('El fondo es demasiado claro', 'La web usa bordes y capas claras: elige un fondo oscuro.');
      return;
    }
    const issues = this.failing();
    const ok = await this.dialog.confirm({
      kicker: 'Apariencia',
      title: '¿Aplicar este estilo a toda la web?',
      message:
        (issues.length
          ? `Hay ${issues.length} ${issues.length === 1 ? 'combinación' : 'combinaciones'} con poco contraste: ${issues.map((i) => i.label.toLowerCase()).join(', ')}. Se podrá leer peor.\n\n`
          : '') + 'Todos los visitantes verán el cambio al cargar la página. Queda registrado en la auditoría y puedes volver al original cuando quieras.',
      confirmLabel: 'Aplicar estilo',
    });
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.theme.save(completeTheme(this.draft()));
      this.livePreview.set(false);
      this.toast.success('Estilo aplicado', 'La web ya usa los nuevos colores y fuentes.');
    } catch (e) {
      this.toast.error('No se guardaron los colores', e instanceof Error ? e.message : undefined);
    } finally {
      this.saving.set(false);
    }
  }

  async restoreDefault() {
    const ok = await this.dialog.confirm({
      kicker: 'Apariencia',
      title: '¿Volver a los colores originales de WAYIRA?',
      message: 'Se aplica a toda la web. Puedes volver a cambiarlos cuando quieras.',
      confirmLabel: 'Restaurar originales',
    });
    if (!ok) return;
    this.setDraft(DEFAULT_THEME);
    this.saving.set(true);
    try {
      await this.theme.save({ ...DEFAULT_THEME });
      this.livePreview.set(false);
      this.toast.success('Colores originales restaurados');
    } catch (e) {
      this.toast.error('No se pudieron restaurar', e instanceof Error ? e.message : undefined);
    } finally {
      this.saving.set(false);
    }
  }
}

function sameColors(a: Partial<ThemeColors>, b: ThemeColors): boolean {
  return (['bg', 'surface', 'accent', 'alert', 'text', 'textSecondary'] as const).every((k) => (a[k] ?? '').toUpperCase() === b[k].toUpperCase());
}

function sameTheme(a: ThemeColors, b: ThemeColors): boolean {
  return (Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]).every((k) => {
    const av = a[k];
    const bv = b[k];
    return typeof av === 'string' && typeof bv === 'string' && av.toUpperCase() === bv.toUpperCase();
  });
}

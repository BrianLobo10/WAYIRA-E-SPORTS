import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_THEME, THEME_PRESETS, ThemeService, completeTheme, isDarkEnough, themeChecks, themeVariables,
  type ThemeColors,
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
    .presets { display: flex; flex-wrap: wrap; gap: 8px; }
    .preset {
      display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px 0 8px; border: 0; border-radius: 2px; cursor: pointer;
      background: var(--bg); color: var(--white); font: inherit; font-size: 13px; box-shadow: inset 0 0 0 1px var(--border);
    }
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
  readonly presets = THEME_PRESETS;
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
  readonly activePreset = computed(() => this.presets.find((p) => sameTheme(p.colors, this.draft()))?.name ?? null);

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
    await this.theme.load();
    this.setDraft(this.theme.saved());
    this.loaded.set(true);
  }

  ngOnDestroy() {
    // Salir sin guardar deja la web como estaba
    this.theme.revert();
  }

  private setDraft(t: ThemeColors) {
    this.draft.set({ ...t });
    this.hexText.set({ ...t });
  }

  usePreset(colors: ThemeColors) {
    this.setDraft(colors);
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
      title: '¿Aplicar estos colores a toda la web?',
      message:
        (issues.length
          ? `Hay ${issues.length} ${issues.length === 1 ? 'combinación' : 'combinaciones'} con poco contraste: ${issues.map((i) => i.label.toLowerCase()).join(', ')}. Se podrá leer peor.\n\n`
          : '') + 'Todos los visitantes verán el cambio al cargar la página. Queda registrado en la auditoría y puedes volver al original cuando quieras.',
      confirmLabel: 'Aplicar colores',
    });
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.theme.save(completeTheme(this.draft()));
      this.livePreview.set(false);
      this.toast.success('Colores aplicados', 'La web ya usa el nuevo tema.');
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

function sameTheme(a: ThemeColors, b: ThemeColors): boolean {
  return (Object.keys(DEFAULT_THEME) as (keyof ThemeColors)[]).every((k) => a[k].toUpperCase() === b[k].toUpperCase());
}

import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Milisegundos antes de cerrarse solo (0 = no se cierra solo) */
  duration: number;
}

/**
 * Avisos propios de WAYIRA (sustituyen a alert()).
 * Uso: toast.success('Torneo creado'), toast.error('No se pudo guardar', 'Revisa tu conexión').
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  success(title: string, message?: string): void { this.show('success', title, message); }
  error(title: string, message?: string): void { this.show('error', title, message, 7000); }
  info(title: string, message?: string): void { this.show('info', title, message); }
  warning(title: string, message?: string): void { this.show('warning', title, message, 6000); }

  /** Reemplazo directo de alert(texto): elige el tipo por el contenido del mensaje. */
  notify(text: unknown): void {
    const raw = String(text ?? '').trim();
    const clean = raw.replace(/^[\s✅❌⚠️⚠ℹ️🎉✓✔×!]+/u, '').trim();
    const [first, ...rest] = clean.split(/\n+/);
    const message = rest.join(' ').trim() || undefined;
    const lower = clean.toLowerCase();
    if (raw.startsWith('❌') || /\b(error|no se pudo|fall[óo]|inválid|no tienes permiso|no puedes|sin permiso)\b/.test(lower)) {
      this.error(first, message);
    } else if (raw.startsWith('⚠') || /\b(debes|necesitas|falta|completa|selecciona|ingresa|escribe|máximo|mínimo|al menos)\b/.test(lower)) {
      this.warning(first, message);
    } else if (raw.startsWith('✅') || raw.startsWith('🎉') || /(correctamente|creado|creada|guardad|actualizad|eliminad|publicad|enviad|copiad|listo)/.test(lower)) {
      this.success(first, message);
    } else {
      this.info(first, message);
    }
  }

  show(kind: ToastKind, title: string, message?: string, duration = 5000): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list.slice(-3), { id, kind, title, message, duration }]);
    if (duration > 0) this.schedule(id, duration);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Pausa el cierre automático mientras el cursor o el foco están encima */
  pause(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  resume(id: number): void {
    const t = this.toasts().find((x) => x.id === id);
    if (t && t.duration > 0) this.schedule(id, 2500);
  }

  private schedule(id: number, ms: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
  }
}

import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Texto del botón principal, en verbo ("Eliminar torneo") */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción destructiva: botón en brasa */
  danger?: boolean;
  /** Palabra que hay que escribir para habilitar el botón (acciones irreversibles) */
  requireText?: string;
  /** Etiqueta pequeña sobre el título ("Acción permanente", "Cambio de rol") */
  kicker?: string;
}

interface PendingDialog extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Confirmaciones propias de WAYIRA (sustituyen a confirm()).
 * Uso: if (!(await dialog.confirm({ title: '¿Eliminar?', danger: true }))) return;
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<PendingDialog | null>(null);

  confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts: ConfirmOptions = typeof options === 'string' ? splitQuestion(options) : options;
    // Si ya había una abierta, se cancela antes de abrir la nueva
    this.current()?.resolve(false);
    return new Promise<boolean>((resolve) => this.current.set({ ...opts, resolve }));
  }

  close(ok: boolean): void {
    const d = this.current();
    if (!d) return;
    this.current.set(null);
    d.resolve(ok);
  }
}

/** Convierte un texto de confirm() antiguo en título + detalle. */
function splitQuestion(text: string): ConfirmOptions {
  const clean = text.trim();
  const m = clean.match(/^(.*?\?)\s+(.+)$/s);
  const title = m ? m[1] : clean;
  const message = m ? m[2] : undefined;
  const danger = /(eliminar|borrar|quitar|retirar|rechazar|desvincular|cerrar el check-in)/i.test(clean);
  return { title, message, danger, confirmLabel: danger ? 'Sí, continuar' : 'Confirmar' };
}

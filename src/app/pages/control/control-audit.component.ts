import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, ENTITY_LABELS, actionLabel, type AuditEntry } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';

/** Auditoría: solo lectura. Nadie (ni el Superadmin desde la web) puede editarla ni borrarla. */
@Component({
  selector: 'app-control-audit',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../staff/admin-ui.css'],
  template: `
    <header class="view-head">
      <div>
        <p class="view-kicker">Centro de control</p>
        <h1 class="view-title">Auditoría</h1>
        <p class="view-lead">Quién hizo qué y cuándo, incluidos los intentos rechazados. Es de solo lectura: la escribe la base de datos.</p>
      </div>
    </header>

    <div class="toolbar">
      <label>
        <span class="sr-only">Tipo</span>
        <select class="select" [ngModel]="entity()" (ngModelChange)="entity.set($event); reload()">
          <option value="">Todo</option>
          @for (e of entities; track e[0]) { <option [value]="e[0]">{{ e[1] }}</option> }
        </select>
      </label>
      <label class="switch">
        <input type="checkbox" [checked]="onlyDenied()" (change)="onlyDenied.set(!onlyDenied()); reload()" />
        <span class="switch__track" aria-hidden="true"></span>
        Solo rechazados
      </label>
    </div>

    <section class="panel">
      @if (loading() && !items().length) {
        <div class="panel__body"><div class="skeleton" style="width: 70%"></div><br /><div class="skeleton" style="width: 50%"></div></div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th><th>Resultado</th></tr></thead>
            <tbody>
              @for (a of items(); track a.id) {
                <tr (click)="toggle(a.id)" class="row" [class.is-open]="open() === a.id">
                  <td class="muted" style="white-space: nowrap">{{ a.at | date: 'd MMM y, HH:mm:ss' }}</td>
                  <td>
                    @if (a.actorId) { <a [routerLink]="['/profile', a.actorId]" (click)="$event.stopPropagation()">{{ a.actorName || 'Usuario' }}</a> }
                    @else { <span class="muted">Sistema</span> }
                  </td>
                  <td style="white-space: nowrap">{{ entityLabel(a.entity) }} · {{ action(a.action) }}</td>
                  <td>
                    <button type="button" class="linkish" [attr.aria-expanded]="open() === a.id" (click)="$event.stopPropagation(); toggle(a.id)">{{ a.summary || '—' }}</button>
                    @if (open() === a.id && hasDetails(a)) {
                      <dl class="details">
                        @if (a.details['reason']) { <div><dt>Motivo</dt><dd>{{ a.details['reason'] }}</dd></div> }
                        @if (a.details['error']) { <div><dt>Rechazo</dt><dd>{{ a.details['error'] }}</dd></div> }
                        @if (a.details['content']) { <div><dt>Contenido</dt><dd>{{ a.details['content'] }}</dd></div> }
                        @if (a.details['hours'] !== undefined) { <div><dt>Horas</dt><dd>{{ a.details['hours'] || 'Indefinida' }}</dd></div> }
                        @if (a.entityId) { <div><dt>ID</dt><dd class="mono">{{ a.entityId }}</dd></div> }
                      </dl>
                    }
                  </td>
                  <td><span class="badge" [class.badge--danger]="a.result === 'denied'">{{ a.result === 'denied' ? 'Rechazado' : 'Hecho' }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">{{ onlyDenied() ? 'No hay intentos rechazados.' : 'Todavía no hay acciones registradas.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        @if (more()) {
          <div class="panel__body" style="text-align: center">
            <button type="button" class="btn btn-quiet btn-sm" (click)="loadMore()" [disabled]="loading()">{{ loading() ? 'Cargando…' : 'Cargar más' }}</button>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .row { cursor: pointer; }
    .row:hover td { background: rgba(255,255,255,.02); }
    .linkish { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .linkish:hover { text-decoration: underline; text-underline-offset: 3px; }
    .details { margin: 8px 0 0; display: grid; gap: 4px; font-size: 13px; }
    .details div { display: grid; grid-template-columns: 80px 1fr; gap: 8px; }
    .details dt { color: var(--text-muted); }
    .details dd { margin: 0; color: var(--text-secondary); overflow-wrap: anywhere; }
    .mono { font-family: var(--font-mono); font-size: 12px; }
    a { color: var(--white); }
  `],
})
export class ControlAuditComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  readonly entities = Object.entries(ENTITY_LABELS);
  readonly items = signal<AuditEntry[]>([]);
  readonly loading = signal(true);
  readonly more = signal(false);
  readonly entity = signal('');
  readonly onlyDenied = signal(false);
  readonly open = signal<number | null>(null);
  private readonly page = 100;

  ngOnInit() {
    void this.reload();
  }

  async reload() {
    this.items.set([]);
    await this.fetch();
  }

  async loadMore() {
    await this.fetch(this.items().at(-1)?.at);
  }

  private async fetch(before?: Date) {
    this.loading.set(true);
    try {
      const rows = await this.admin.audit({ entity: this.entity() || undefined, onlyDenied: this.onlyDenied(), before, limit: this.page });
      this.items.update((l) => [...l, ...rows]);
      this.more.set(rows.length === this.page);
    } catch (e) {
      this.toast.error('No se pudo cargar la auditoría', e instanceof Error ? e.message : undefined);
    } finally {
      this.loading.set(false);
    }
  }

  toggle(id: number) {
    this.open.set(this.open() === id ? null : id);
  }

  hasDetails(a: AuditEntry): boolean {
    return !!a.entityId || Object.keys(a.details).length > 0;
  }

  entityLabel(e: string) {
    return ENTITY_LABELS[e] ?? e;
  }

  action(a: string) {
    return actionLabel(a);
  }
}

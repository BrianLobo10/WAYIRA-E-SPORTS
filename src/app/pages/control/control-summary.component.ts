import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService, ENTITY_LABELS, actionLabel, type AuditEntry, type PlatformStats } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';

/** Resumen del centro de control: cifras de la plataforma y lo último que pasó. Solo Superadmin. */
@Component({
  selector: 'app-control-summary',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../staff/admin-ui.css'],
  template: `
    <header class="view-head">
      <div>
        <p class="view-kicker">Centro de control</p>
        <h1 class="view-title">Resumen</h1>
        <p class="view-lead">Cifras en vivo desde la base de datos. Nadie más que el Superadmin ve esta pantalla.</p>
      </div>
      <div class="view-actions"><button type="button" class="btn btn-quiet btn-sm" (click)="load()" [disabled]="loading()"><span class="material-icons" aria-hidden="true">refresh</span>Actualizar</button></div>
    </header>

    @if (s(); as st) {
      <section class="kpis" aria-label="Cifras principales">
        <div class="kpi kpi--lead"><span class="kpi__label">Usuarios registrados</span><span class="kpi__value">{{ st.users_total | number }}</span><span class="kpi__sub">+{{ st.users_new_7d }} esta semana · +{{ st.users_new_30d }} en 30 días</span></div>
        <div class="kpi"><span class="kpi__label">Activos 30 días</span><span class="kpi__value">{{ st.users_active_30d | number }}</span><span class="kpi__sub">{{ activePct() }}% del total</span></div>
        <div class="kpi"><span class="kpi__label">Publicaciones</span><span class="kpi__value">{{ st.posts_total | number }}</span><span class="kpi__sub">en el Feed</span></div>
        <div class="kpi"><span class="kpi__label">Torneos</span><span class="kpi__value">{{ st.tournaments_active }}</span><span class="kpi__sub">activos · {{ st.tournaments_done }} finalizados</span></div>
        <div class="kpi"><span class="kpi__label">Contenido</span><span class="kpi__value">{{ st.news_published }}</span><span class="kpi__sub">noticias publicadas · {{ st.projects_active }} proyectos visibles</span></div>
        <div class="kpi" [class.kpi--alert]="st.reports_open > 0 || st.suspended_now > 0">
          <span class="kpi__label">Moderación</span><span class="kpi__value">{{ st.reports_open }}</span>
          <span class="kpi__sub">denuncias abiertas · {{ st.suspended_now }} cuentas suspendidas</span>
        </div>
      </section>

      <div class="cols">
        <section class="panel">
          <div class="panel__head"><h2 class="panel__title">Registros por semana</h2><span class="muted" style="font-size: 13px">últimas 8 semanas</span></div>
          <div class="panel__body">
            <div class="bars" role="img" [attr.aria-label]="chartLabel()">
              @for (w of st.signups_weekly; track w.week; let last = $last) {
                <div class="bar" [class.is-now]="last">
                  <span class="bar__n tabular-score">{{ w.count }}</span>
                  <span class="bar__fill" [style.height.%]="max() ? (w.count / max()) * 100 : 0"></span>
                  <span class="bar__x">{{ w.week | date: 'd MMM' }}</span>
                </div>
              }
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head"><h2 class="panel__title">Actividad reciente</h2><a class="btn btn-quiet btn-sm" routerLink="../auditoria">Ver todo</a></div>
          <ul class="feed">
            @for (a of recent(); track a.id) {
              <li class="feed__item">
                <span class="badge" [class.badge--danger]="a.result === 'denied'">{{ a.result === 'denied' ? 'Rechazado' : (entity(a.entity)) }}</span>
                <span class="feed__text"><strong>{{ a.actorName || 'Sistema' }}</strong> {{ a.summary || action(a.action) }}</span>
                <time class="feed__time" [attr.datetime]="a.at.toISOString()">{{ a.at | date: 'd MMM, HH:mm' }}</time>
              </li>
            } @empty {
              <li class="empty">Todavía no hay acciones registradas.</li>
            }
          </ul>
        </section>
      </div>
    } @else if (loading()) {
      <section class="kpis">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="kpi"><div class="skeleton" style="width: 50%"></div><br /><div class="skeleton" style="width: 30%; height: 28px"></div></div> }</section>
    } @else {
      <div class="panel empty"><strong>No se pudieron cargar las cifras</strong>Revisa tu conexión y pulsa Actualizar.</div>
    }
  `,
  styles: [`
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--border); box-shadow: 0 0 0 1px var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 16px; }
    .kpi { display: flex; flex-direction: column; gap: 4px; padding: 18px; background: var(--surface-1); }
    .kpi--lead { background: var(--surface-2); }
    .kpi__label { font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); }
    .kpi__value { font-family: var(--font-score); font-weight: 700; font-size: 40px; line-height: 1; font-variant-numeric: tabular-nums; }
    .kpi--lead .kpi__value { color: var(--volt); }
    .kpi--alert .kpi__value { color: var(--ember-text); }
    .kpi__sub { font-size: 13px; color: var(--text-secondary); }
    .cols { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .cols .panel + .panel { margin-top: 0; }
    .bars { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; height: 200px; align-items: end; }
    .bar { display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
    .bar__fill { width: 100%; min-height: 2px; background: var(--surface-3); border-radius: 2px 2px 0 0; }
    .bar.is-now .bar__fill { background: var(--volt); }
    .bar__n { font-size: 14px; font-weight: 600; }
    .bar__x { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); white-space: nowrap; }
    .feed { list-style: none; margin: 0; padding: 0; }
    .feed__item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); font-size: 13px; }
    .feed__item:last-child { border-bottom: 0; }
    .feed__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
    .feed__text strong { color: var(--white); font-weight: 600; }
    .feed__time { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); white-space: nowrap; }
    @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kpi__value { font-size: 32px; } }
  `],
})
export class ControlSummaryComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  readonly s = signal<PlatformStats | null>(null);
  readonly recent = signal<AuditEntry[]>([]);
  readonly loading = signal(true);
  readonly max = computed(() => Math.max(0, ...(this.s()?.signups_weekly ?? []).map((w) => w.count)));
  readonly activePct = computed(() => {
    const st = this.s();
    return st && st.users_total ? Math.round((st.users_active_30d / st.users_total) * 100) : 0;
  });
  readonly chartLabel = computed(
    () => 'Registros por semana: ' + (this.s()?.signups_weekly ?? []).map((w) => `${w.week}: ${w.count}`).join(', '),
  );

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [st, recent] = await Promise.all([this.admin.stats(), this.admin.audit({ limit: 8 })]);
      this.s.set(st);
      this.recent.set(recent);
    } catch (e) {
      this.toast.error('No se pudieron cargar las estadísticas', e instanceof Error ? e.message : undefined);
    } finally {
      this.loading.set(false);
    }
  }

  entity(e: string) {
    return ENTITY_LABELS[e] ?? e;
  }
  action(a: string) {
    return actionLabel(a);
  }
}
